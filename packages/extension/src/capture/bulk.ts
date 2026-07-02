import type { H2FDocument, H2FBundle } from "@html2figma/shared";
import { H2F_VERSION } from "@html2figma/shared";
import { capturePage, type CaptureOptions } from "./index.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 탭이 완전히 로드될 때까지 대기 (status === 'complete') */
function waitForTabComplete(tabId: number, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      // 타임아웃이어도 캡처는 시도 (부분 로드)
      resolve();
    }, timeoutMs);

    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // 이미 complete인 경우
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error(chrome.runtime.lastError.message));
      } else if (tab.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

function createTab(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError || tab.id == null) {
        reject(new Error(chrome.runtime.lastError?.message ?? "탭 생성 실패"));
      } else {
        resolve(tab.id);
      }
    });
  });
}

function removeTab(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

export interface BulkOptions extends Omit<CaptureOptions, "onProgress"> {
  onProgress?: (step: string, ratio: number) => void;
}

/**
 * 여러 URL을 백그라운드 탭에서 순차 캡처해 번들로 반환한다.
 * 한 URL이 실패해도 나머지는 계속 진행한다.
 */
export async function captureUrls(
  urls: string[],
  opts: BulkOptions
): Promise<{ bundle: H2FBundle; errors: { url: string; message: string }[] }> {
  const { onProgress } = opts;
  const documents: H2FDocument[] = [];
  const errors: { url: string; message: string }[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const base = i / urls.length;
    const span = 1 / urls.length;
    onProgress?.(`(${i + 1}/${urls.length}) ${url}`, base);

    let tabId: number | null = null;
    try {
      tabId = await createTab(url);
      await waitForTabComplete(tabId);
      await delay(600); // 지연 로딩/애니메이션 안정화

      const doc = await capturePage(tabId, {
        viewport: opts.viewport,
        theme: opts.theme,
        onProgress: (step, ratio) => onProgress?.(`(${i + 1}/${urls.length}) ${step}`, base + ratio * span),
      });
      documents.push(doc);
    } catch (e) {
      errors.push({ url, message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (tabId != null) await removeTab(tabId);
    }
  }

  onProgress?.("완료", 1);
  return {
    bundle: { version: H2F_VERSION, kind: "bundle", documents },
    errors,
  };
}
