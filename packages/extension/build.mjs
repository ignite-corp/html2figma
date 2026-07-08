import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(__dirname, "chrome-extension");
const watch = process.argv.includes("--watch");
// 크롬 웹스토어 항목은 이미 최초 게시 시 자체 ID(cgjbnhacnalehnfkkkoilmglhiigbjmf)를
// 할당받았음. manifest.json의 "key"는 로컬 언팩 테스트 ID(gdbjhecfadldmdnidkdgceninhepgocl)
// 고정용이라 스토어에 업로드하면 "key가 기존 항목과 불일치" 오류가 난다 — 스토어 패키징 시엔 제거.
const forStore = process.argv.includes("--store");

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

if (forStore) {
  const manifestPath = resolve(outdir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  delete manifest.key;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("스토어 패키징: manifest.json에서 key 제거 (기존 스토어 항목 ID 유지)");
}

if (watch) {
  console.log("watch 모드는 아직 미지원 — 단발성 빌드 완료");
}
console.log("extension 빌드 완료 →", outdir);
