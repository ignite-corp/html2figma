import type { H2FDocument } from "@html2figma/shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const drop = $<HTMLDivElement>("drop");
const fileInput = $<HTMLInputElement>("file");
const paste = $<HTMLTextAreaElement>("paste");
const importBtn = $<HTMLButtonElement>("import");
const autolayout = $<HTMLInputElement>("autolayout");
const styles = $<HTMLInputElement>("styles");
const statusEl = $<HTMLDivElement>("status");

let doc: H2FDocument | null = null;

function setStatus(t: string) {
  statusEl.textContent = t;
}

function loadFromText(text: string) {
  try {
    const parsed = JSON.parse(text) as H2FDocument;
    if (!parsed.version || !parsed.root) throw new Error("올바른 .h2f 형식이 아닙니다.");
    doc = parsed;
    importBtn.disabled = false;
    setStatus(`문서 로드됨 — ${parsed.meta?.title || parsed.meta?.url || "무제"}`);
  } catch (e) {
    doc = null;
    importBtn.disabled = true;
    setStatus(`파싱 실패: ${e instanceof Error ? e.message : e}`);
  }
}

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const file = e.dataTransfer?.files[0];
  if (file) file.text().then(loadFromText);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) file.text().then(loadFromText);
});

paste.addEventListener("input", () => {
  if (paste.value.trim()) loadFromText(paste.value.trim());
});

importBtn.addEventListener("click", () => {
  if (!doc) return;
  importBtn.disabled = true;
  parent.postMessage(
    {
      pluginMessage: {
        type: "import",
        doc,
        options: { useAutoLayout: autolayout.checked, createStyles: styles.checked },
      },
    },
    "*"
  );
});

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage;
  if (msg?.type === "status") {
    setStatus(msg.text);
    if (msg.text === "완료!") importBtn.disabled = false;
  }
};
