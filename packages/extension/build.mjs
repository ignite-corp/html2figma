import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(__dirname, "chrome-extension");
const watch = process.argv.includes("--watch");

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const common = {
  bundle: true,
  format: "esm",
  target: "chrome110",
  sourcemap: true,
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: {
    background: resolve(__dirname, "src/background.ts"),
    popup: resolve(__dirname, "src/popup/popup.ts"),
  },
  outdir,
});

// 정적 파일 복사
cpSync(resolve(__dirname, "manifest.json"), resolve(outdir, "manifest.json"));
cpSync(resolve(__dirname, "src/popup/popup.html"), resolve(outdir, "popup.html"));
cpSync(resolve(__dirname, "icons"), resolve(outdir, "icons"), { recursive: true });

if (watch) {
  console.log("watch 모드는 아직 미지원 — 단발성 빌드 완료");
}
console.log("extension 빌드 완료 →", outdir);
