import type { H2FDocument } from "@html2figma/shared";
import { Renderer, type RenderOptions } from "./render.js";

interface ImportMessage {
  type: "import";
  doc: H2FDocument;
  options: RenderOptions;
}

type UiMessage = ImportMessage | { type: "cancel" };

figma.showUI(__html__, { width: 340, height: 380, title: "html2figma" });

figma.ui.onmessage = async (msg: UiMessage) => {
  if (msg.type === "cancel") {
    figma.closePlugin();
    return;
  }
  if (msg.type !== "import") return;

  try {
    figma.ui.postMessage({ type: "status", text: "렌더링 중…" });
    const renderer = new Renderer(msg.doc.assets, msg.options);
    const node = await renderer.render(msg.doc);
    figma.currentPage.selection = [node];
    figma.viewport.scrollAndZoomIntoView([node]);
    figma.ui.postMessage({ type: "status", text: "완료!" });
    figma.notify("html2figma: 임포트 완료");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    figma.ui.postMessage({ type: "status", text: `오류: ${message}` });
    figma.notify(`html2figma 오류: ${message}`, { error: true });
  }
};
