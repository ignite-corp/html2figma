/**
 * 팝업의 플랜/쿼터/결제 UI (스토어 빌드 전용).
 *
 * 사내 빌드에서는 build.mjs 가 이 모듈을 `monetization.internal.ts` 로 치환하므로,
 * 여기 있는 코드·문자열(결제 페이지 URL, 로그인 흐름)은 사내 번들에 포함되지 않는다.
 */
import { getQuota } from "../quota.js";
import { fetchStatus, getAccount, signIn, signOut } from "../account.js";
import { UPGRADE_URL } from "../config.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const planPill      = $<HTMLSpanElement>("plan-pill");
const paywallEl     = $<HTMLDivElement>("paywall");
const upgradeBtn    = $<HTMLButtonElement>("upgrade");
const signinPaywall = $<HTMLAnchorElement>("signin-paywall");
const accountLine   = $<HTMLDivElement>("account-line");

/** 팝업 쪽 상태 반영 통로 — 캡처 버튼 활성화와 상태 문구는 popup.ts 가 소유한다. */
export interface PlanUiHost {
  setStatus(text: string, type?: "normal" | "success" | "error"): void;
  setQuotaOk(ok: boolean): void;
}

let host: PlanUiHost;

function renderPlan(plan: "free" | "pro", remaining: number) {
  planPill.hidden = false;
  if (plan === "pro") {
    planPill.textContent = "Pro ✓";
    planPill.className = "plan-pill pro";
    paywallEl.classList.add("hidden");
    host.setQuotaOk(true);
  } else {
    planPill.textContent = `무료 ${remaining}/5`;
    planPill.className = remaining > 0 ? "plan-pill" : "plan-pill empty";
    paywallEl.classList.toggle("hidden", remaining > 0);
    host.setQuotaOk(remaining > 0);
  }
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
    link.textContent = "Pro 구독 중이신가요? Google로 로그인";
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

async function handleSignIn(): Promise<void> {
  try {
    host.setStatus("Google 로그인 중…");
    const result = await signIn();
    if (result.plan === "pro") {
      host.setStatus("Pro 구독이 활성화됐어요 ✓", "success");
    } else {
      host.setStatus("이 Google 계정에 활성 구독이 없어요.", "error");
    }
    await refreshPlanUI();
  } catch (e) {
    host.setStatus(e instanceof Error ? e.message : "로그인에 실패했습니다.", "error");
  }
}

/** 팝업 로드 시 1회 — 이벤트 바인딩 + 플랜 상태 렌더 */
export function initPlanUi(h: PlanUiHost): void {
  host = h;

  upgradeBtn.addEventListener("click", async () => {
    upgradeBtn.disabled = true;
    try {
      host.setStatus("Google 로그인 중…");
      const result = await signIn();
      if (result.plan === "pro") {
        host.setStatus("이미 Pro 구독 중이에요 ✓", "success");
        await refreshPlanUI();
        return;
      }
      // 결제 페이지에 계정을 연결할 단기 토큰을 받아 새 탭으로 연다.
      const status = await fetchStatus();
      const ct = status?.checkoutToken;
      host.setStatus("결제 페이지로 이동합니다…");
      await chrome.tabs.create({ url: ct ? `${UPGRADE_URL}?ct=${encodeURIComponent(ct)}` : UPGRADE_URL });
    } catch (e) {
      host.setStatus(e instanceof Error ? e.message : "업그레이드를 시작할 수 없습니다.", "error");
    } finally {
      upgradeBtn.disabled = false;
    }
  });

  signinPaywall.addEventListener("click", () => void handleSignIn());

  void refreshPlanUI();
}

/** 캡처 완료 후 잔여 횟수 반영 (null = Pro/무제한) */
export function applyCaptureResult(remaining: number | null | undefined): void {
  if (remaining === null) renderPlan("pro", 0);
  else if (typeof remaining === "number") renderPlan("free", remaining);
}

/** 쿼터 소진 응답을 받았을 때 */
export function showQuotaExceeded(): void {
  renderPlan("free", 0);
}
