import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");
// 크롬 웹스토어 항목은 이미 최초 게시 시 자체 ID(cgjbnhacnalehnfkkkoilmglhiigbjmf)를
// 할당받았음. manifest.json의 "key"는 로컬 언팩 테스트 ID(gdbjhecfadldmdnidkdgceninhepgocl)
// 고정용이라 스토어에 업로드하면 "key가 기존 항목과 불일치" 오류가 난다 — 스토어 패키징 시엔 제거.
const forStore = process.argv.includes("--store");
// 사내 배포 빌드: 쿼터/결제 게이트를 끈 무료 무제한 버전. 스토어에 올리지 않고
// zip 을 사내에 직접 배포한다(개발자 모드 언팩 로드).
const internal = process.argv.includes("--internal");

if (forStore && internal) {
  console.error("--store 와 --internal 은 함께 쓸 수 없습니다 (배포 대상이 다른 빌드입니다).");
  process.exit(1);
}

const outdir = resolve(__dirname, internal ? "chrome-extension-internal" : "chrome-extension");
const mode = internal ? "사내 배포" : forStore ? "스토어(결제용)" : "개발(언팩)";
console.log(`빌드 모드: ${mode}`);

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

/**
 * 사내 빌드에서 결제 관련 모듈을 스텁으로 치환한다.
 *
 * 런타임 플래그(INTERNAL_BUILD)만으로는 esbuild 가 블록을 제거하지 못해 결제 페이지 URL·
 * OAuth 코드가 사내 번들에 남는다. 그래서 모듈 자체를 빌드 시점에 갈아끼워
 * 두 빌드의 코드가 실제로 달라지게 한다.
 */
const internalStubs = {
  account: resolve(__dirname, "src/account.internal.ts"),
  monetization: resolve(__dirname, "src/popup/monetization.internal.ts"),
};

const stubForInternalPlugin = {
  name: "stub-monetization-for-internal",
  setup(b) {
    b.onResolve({ filter: /(^|\/)(account|monetization)\.js$/ }, (args) => {
      const name = args.path.replace(/^.*\//, "").replace(/\.js$/, "");
      return { path: internalStubs[name] };
    });
  },
};

const common = {
  bundle: true,
  format: "esm",
  target: "chrome110",
  sourcemap: true,
  logLevel: "info",
  define: { __INTERNAL__: internal ? "true" : "false" },
  plugins: internal ? [stubForInternalPlugin] : [],
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
cpSync(resolve(__dirname, "_locales"), resolve(outdir, "_locales"), { recursive: true });

const manifestPath = resolve(outdir, "manifest.json");
const readManifest = () => JSON.parse(readFileSync(manifestPath, "utf8"));
const writeManifest = (m) => writeFileSync(manifestPath, JSON.stringify(m, null, 2) + "\n");

if (forStore) {
  const manifest = readManifest();
  delete manifest.key;
  writeManifest(manifest);
  console.log("스토어 패키징: manifest.json에서 key 제거 (기존 스토어 항목 ID 유지)");
}

if (internal) {
  const manifest = readManifest();

  // 1) 확장 ID — manifest 의 key 는 개발용 언팩 빌드 ID 고정용이다. 사내 배포본이 그 key 를
  //    그대로 쓰면 개발용 언팩 빌드와 ID 가 충돌한다. 사내 전용 공개키를 주면 고정 ID 를 갖고,
  //    없으면 key 를 제거해 최소한 충돌은 피한다(ID 는 설치 경로에서 파생됨).
  const internalKey = process.env.H2F_INTERNAL_KEY?.trim();
  if (internalKey) {
    manifest.key = internalKey;
    console.log("사내 패키징: H2F_INTERNAL_KEY 적용 — 사내 전용 고정 확장 ID");
  } else {
    delete manifest.key;
    console.log(
      "사내 패키징: key 제거 — 확장 ID가 설치 경로에서 파생됩니다.\n" +
        "  고정 ID가 필요하면 H2F_INTERNAL_KEY 에 사내 전용 공개키를 넣고 다시 빌드하세요.",
    );
  }

  // 2) 사내 빌드는 로그인을 하지 않으므로 identity 권한이 필요 없다(설치 시 권한 경고 축소).
  const before = manifest.permissions.length;
  manifest.permissions = manifest.permissions.filter((p) => p !== "identity");
  if (manifest.permissions.length !== before) console.log("사내 패키징: identity 권한 제거");

  // 3) 이름/설명은 _locales 를 덮어써 구분한다(manifest 를 리터럴로 바꾸면 다국어가 깨짐).
  const labels = {
    ko: { name: "html2figma (사내용)", desc: "웹페이지를 캡처해 편집 가능한 Figma 디자인으로 변환합니다. (사내 배포판 · 무제한)" },
    en: { name: "html2figma (Internal)", desc: "Capture any webpage and turn it into an editable Figma design. (Internal build · unlimited)" },
  };
  for (const [locale, label] of Object.entries(labels)) {
    const p = resolve(outdir, "_locales", locale, "messages.json");
    const messages = JSON.parse(readFileSync(p, "utf8"));
    messages.extName.message = label.name;
    messages.extDescription.message = label.desc;
    writeFileSync(p, JSON.stringify(messages, null, 2) + "\n");
  }
  manifest.action.default_title = "__MSG_extName__";

  // 4) chrome://extensions 에서 한눈에 구분되도록 표기
  manifest.version_name = `${manifest.version} (internal)`;

  writeManifest(manifest);
  console.log("사내 패키징: 쿼터/결제 게이트 비활성 + 결제·OAuth 코드 미포함 + 이름에 (사내용) 표기");
}

if (watch) {
  console.log("watch 모드는 아직 미지원 — 단발성 빌드 완료");
}
console.log("extension 빌드 완료 →", outdir);
