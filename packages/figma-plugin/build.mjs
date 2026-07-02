import { build } from "esbuild";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(__dirname, "dist");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

// 1) 메인(샌드박스) 번들
await build({
  entryPoints: [resolve(__dirname, "src/main.ts")],
  bundle: true,
  format: "iife",
  target: "es2017",
  outfile: resolve(outdir, "main.js"),
  logLevel: "info",
});

// 2) UI 스크립트를 문자열로 번들 후 HTML에 인라인
const uiResult = await build({
  entryPoints: [resolve(__dirname, "src/ui.ts")],
  bundle: true,
  format: "iife",
  target: "es2017",
  write: false,
  logLevel: "info",
});
const uiJs = uiResult.outputFiles[0].text;

const htmlTemplate = readFileSync(resolve(__dirname, "src/ui.html"), "utf8");
const html = htmlTemplate.replace(
  "<!-- SCRIPT -->",
  `<script>${uiJs}</script>`
);
writeFileSync(resolve(outdir, "ui.html"), html);

writeFileSync(
  resolve(outdir, "manifest.json"),
  readFileSync(resolve(__dirname, "manifest.json"))
);

console.log("figma-plugin 빌드 완료 →", outdir);
