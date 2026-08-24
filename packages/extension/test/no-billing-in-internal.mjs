/**
 * 사내 배포 산출물에 결제/구독/로그인 관련 흔적이 없는지 검사한다.
 *
 * esbuild 는 기본 charset=ascii 라 번들 안의 한글이 \uXXXX 로 이스케이프된다.
 * 그냥 grep 하면 한글 키워드가 절대 걸리지 않으므로, 파일을 읽어 이스케이프를
 * 되돌린 뒤 검사해야 한다(이 스크립트가 존재하는 이유).
 *
 * 사용법: node test/no-billing-in-internal.mjs
 *   (사전에 `node build.mjs --internal` 과 `node build.mjs --store` 실행)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const internalDir = join(root, "chrome-extension-internal");
const storeDir = join(root, "chrome-extension");

/** 사내 산출물에서 하나도 나오면 안 되는 문자열 */
const FORBIDDEN = [
  "구독",
  "결제",
  "업그레이드",
  "페이월",
  "무료 변환",
  "로그인",
  "Pro 업그레이드",
  "paywall",
  "upgrade",
  "checkout",
  "Paddle",
  "paddle",
  "accounts.google",
  "launchWebAuthFlow",
  "googleusercontent",
  "workers.dev",
  "pages.dev",
  "identity",
  "billingConfig",
  "$9",
];

/** 텍스트로 검사할 확장자 */
const TEXT_EXT = /\.(js|json|html|css|map|txt)$/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** \uXXXX 이스케이프를 실제 문자로 되돌린다 */
function unescapeUnicode(text) {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function scan(dir) {
  const hits = [];
  for (const file of walk(dir)) {
    if (!TEXT_EXT.test(file)) continue;
    const text = unescapeUnicode(readFileSync(file, "utf8"));
    for (const needle of FORBIDDEN) {
      const count = text.split(needle).length - 1;
      if (count > 0) hits.push({ file: relative(dir, file), needle, count });
    }
  }
  return hits;
}

let failed = false;

// 1) 사내 산출물에는 결제 흔적이 없어야 한다
const internalHits = scan(internalDir);
if (internalHits.length) {
  failed = true;
  console.error("❌ 사내 산출물에 결제 관련 흔적이 남아있습니다:");
  for (const h of internalHits) console.error(`   ${h.file}: "${h.needle}" ${h.count}건`);
} else {
  console.log(`✓ 사내 산출물 ${FORBIDDEN.length}개 금지어 전부 0건`);
}

// 2) 스토어 산출물에는 남아있어야 한다 (검사 자체가 헛돌고 있지 않은지 확인)
if (!existsSync(storeDir)) {
  console.warn("⚠ 스토어 빌드가 없어 대조 검사를 건너뜁니다 (`node build.mjs --store` 후 다시 실행).");
  if (failed) process.exit(1);
  process.exit(0);
}
const storeHits = scan(storeDir);
const storeNeedles = new Set(storeHits.map((h) => h.needle));
const expectInStore = ["paywall", "upgrade", "accounts.google", "identity"];
const missing = expectInStore.filter((n) => !storeNeedles.has(n));
if (missing.length) {
  failed = true;
  console.error(`❌ 스토어 산출물에서 ${missing.join(", ")} 를 찾지 못했습니다 —`);
  console.error("   스토어 빌드가 깨졌거나 이 검사가 무의미해졌습니다(빌드 먼저 실행했는지 확인).");
} else {
  console.log(`✓ 스토어 산출물에는 결제 코드가 정상적으로 존재 (${storeNeedles.size}종 검출)`);
}

if (failed) process.exit(1);
console.log("\n사내/스토어 빌드 분리 검사 통과");
