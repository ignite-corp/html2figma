import type { H2FFile } from "@html2figma/shared";
import { isBundle } from "@html2figma/shared";
import { Renderer, type RenderOptions } from "./render.js";

interface ImportMessage {
  type: "import";
  file: H2FFile;
  options: RenderOptions;
}

type UiMessage = ImportMessage | { type: "cancel" };

figma.showUI(__html__, { width: 340, height: 440, title: "html2figma" });

figma.ui.onmessage = async (msg: UiMessage) => {
  if (msg.type === "cancel") {
    figma.closePlugin();
    return;
  }
  if (msg.type !== "import") return;

  try {
    figma.ui.postMessage({ type: "status", text: "렌더링 중…" });
    const renderer = new Renderer({}, msg.options);
    let nodes: SceneNode[];
    if (isBundle(msg.file)) {
      nodes = await renderer.renderBundle(msg.file);
    } else {
      nodes = [await renderer.render(msg.file)];
    }
    if (nodes.length) {
      figma.currentPage.selection = nodes;
      figma.viewport.scrollAndZoomIntoView(nodes);
    }
    figma.ui.postMessage({ type: "status", text: "완료!" });
    figma.notify(`html2figma: ${nodes.length}개 임포트 완료`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    figma.ui.postMessage({ type: "status", text: `오류: ${message}` });
    figma.notify(`html2figma 오류: ${message}`, { error: true });
  }
};
