import { normalizeCode } from "@html2figma/shared";
import type { BackgroundToPopup, CaptureRequest } from "../messages.js";
import { getQuota } from "../quota.js";
import { fetchStatus, getAccount, signIn, signOut } from "../account.js";
import { UPGRADE_URL } from "../config.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const codeEl        = $<HTMLInputElement>("code");
const captureBtn    = $<HTMLButtonElement>("capture");
const statusEl      = $<HTMLDivElement>("status");
const progressEl    = $<HTMLSpanElement>("progress");
const planPill      = $<HTMLSpanElement>("plan-pill");
const paywallEl     = $<HTMLDivElement>("paywall");
const upgradeBtn    = $<HTMLButtonElement>("upgrade");
const signinPaywall = $<HTMLAnchorElement>("signin-paywall");
const accountLine   = $<HTMLDivElement>("account-line");

/* ---------------- 플랜/쿼터 상태 ---------------- */

let codeOk = false;
let quotaOk = true;

function applyCaptureEnabled() {
  captureBtn.disabled = !(codeOk && quotaOk);
}

function renderPlan(plan: "free" | "pro", remaining: number) {
  planPill.hidden = false;
  if (plan === "pro") {
    planPill.textContent = "Pro ✓";
    planPill.className = "plan-pill pro";
    paywallEl.classList.add("hidden");
    quotaOk = true;
  } else {
    planPill.textContent = `무료 ${remaining}/5`;
    planPill.className = remaining > 0 ? "plan-pill" : "plan-pill empty";
    paywallEl.classList.toggle("hidden", remaining > 0);
    quotaOk = remaining > 0;
  }
  applyCaptureEnabled();
}

async function renderAccountLine() {
  const acc = await getAccount();
  accountLine.innerHTML = "";
  if (acc) {
    accountLine.append(acc.email ?? "로그인됨", " · ");
    const out = document.createElement("a");
    out.textContent = "로그아웃";
    out.addEventListener("click", async () => {
      await signOut();
      await refreshPlanUI();
    });
    accountLine.append(out);
  } else {
    const link = document.createElement("a");
    link.textContent = "Pro 구독 중이신가요? Figma로 로그인";
    link.addEventListener("click", () => void handleSignIn());
    accountLine.append(link);
  }
}

/** 로컬 캐시로 즉시 그리고, 서버 확인 후 한 번 더 갱신한다. */
async function refreshPlanUI() {
  const [acc, quota] = await Promise.all([getAccount(), getQuota()]);
  renderPlan(acc?.plan === "pro" ? "pro" : "free", quota.remaining);
  void renderAccountLine();

  if (acc) {
    const status = await fetchStatus();
    const q = await getQuota();
    renderPlan(status?.plan === "pro" ? "pro" : "free", q.remaining);
    void renderAccountLine();
  }
}

/* ---------------- 로그인 / 업그레이드 ---------------- */

async function handleSignIn(): Promise<void> {
  try {
    setStatus("Figma 로그인 중…");
    const result = await signIn();
    if (result.plan === "pro") {
      setStatus("Pro 구독이 활성화됐어요 ✓", "success");
    } else {
      setStatus("이 Figma 계정에 활성 구독이 없어요.", "error");
    }
    await refreshPlanUI();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "로그인에 실패했습니다.", "error");
  }
}

upgradeBtn.addEventListener("click", async () => {
  upgradeBtn.disabled = true;
  try {
    setStatus("Figma 로그인 중…");
    const result = await signIn();
    if (result.plan === "pro") {
      setStatus("이미 Pro 구독 중이에요 ✓", "success");
      await refreshPlanUI();
      return;
    }
    // 결제 페이지에 계정을 연결할 단기 토큰을 받아 새 탭으로 연다.
    const status = await fetchStatus();
    const ct = status?.checkoutToken;
    setStatus("결제 페이지로 이동합니다…");
    await chrome.tabs.create({ url: ct ? `${UPGRADE_URL}?ct=${encodeURIComponent(ct)}` : UPGRADE_URL });
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "업그레이드를 시작할 수 없습니다.", "error");
  } finally {
    upgradeBtn.disabled = false;
  }
});

signinPaywall.addEventListener("click", () => void handleSignIn());

/* ---------------- 캡처 ---------------- */

// 저장된 코드 복원
chrome.storage.local.get("bridgeCode").then((s) => {
  if (typeof s.bridgeCode === "string") {
    codeEl.value = s.bridgeCode;
    codeOk = codeEl.value.length === 6;
    applyCaptureEnabled();
  }
});

void refreshPlanUI();

codeEl.addEventListener("input", () => {
  codeEl.value = normalizeCode(codeEl.value).slice(0, 6);
  chrome.storage.local.set({ bridgeCode: codeEl.value });
  codeOk = codeEl.value.length === 6;
  applyCaptureEnabled();
});

function setStatus(text: string, type: "normal" | "success" | "error" = "normal", ratio?: number) {
  statusEl.textContent = text;
  statusEl.className = type === "normal" ? "" : type;
  if (ratio != null) progressEl.style.width = `${Math.round(ratio * 100)}%`;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

captureBtn.addEventListener("click", async () => {
  const bridgeCode = normalizeCode(codeEl.value);
  if (bridgeCode.length !== 6) {
    setStatus("6자리 코드를 입력하세요.", "error");
    return;
  }

  captureBtn.disabled = true;
  setStatus("시작…", "normal", 0);

  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus("활성 탭을 찾을 수 없습니다.", "error");
    applyCaptureEnabled();
    return;
  }

  const port = chrome.runtime.connect({ name: "capture" });
  const req: CaptureRequest = {
    kind: "capture",
    tabId: tab.id,
    sendToBridge: true,
    bridgeCode,
  };
  port.postMessage(req);

  port.onMessage.addListener((msg: BackgroundToPopup) => {
    if (msg.kind === "progress") {
      setStatus(msg.step, "normal", msg.ratio);
    } else if (msg.kind === "done") {
      const count = countNodes(msg.doc.root);
      setStatus(
        `완료 — 노드 ${count}개${msg.bridgeSent ? " · Figma 전송됨 ✓" : ""}`,
        "success",
        1,
      );
      if (msg.remaining === null) {
        renderPlan("pro", 0);
      } else if (typeof msg.remaining === "number") {
        renderPlan("free", msg.remaining);
      }
      applyCaptureEnabled();
      port.disconnect();
    } else if (msg.kind === "error") {
      if (msg.code === "quota-exceeded") {
        setStatus(msg.message, "error", 0);
        renderPlan("free", 0);
      } else {
        setStatus(`오류: ${msg.message}`, "error", 0);
        applyCaptureEnabled();
      }
      port.disconnect();
    }
  });
});

function countNodes(node: { type: string; children?: unknown[] }): number {
  let n = 1;
  if (node.type === "frame" && Array.isArray(node.children)) {
    for (const c of node.children) n += countNodes(c as { type: string; children?: unknown[] });
  }
  return n;
}
