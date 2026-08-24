import type { H2FFile } from "@html2figma/shared";
import { Renderer, type RenderOptions } from "./render.js";

interface ImportMessage {
  type: "import";
  file: H2FFile;
  options: RenderOptions;
}

type UiMessage = ImportMessage | { type: "cancel" };

/** 페이로드에 styled text run(segments) 이 실제로 도착했는지 진단용으로 센다. */
function countSegments(node: H2FFile["root"]): { nodes: number; total: number } {
  let nodes = 0;
  let total = 0;
  const walk = (n: { type: string; segments?: unknown[]; children?: unknown[] }) => {
    if (n.type === "text" && n.segments && n.segments.length) {
      nodes += 1;
      total += n.segments.length;
    }
    if (Array.isArray(n.children)) {
      for (const c of n.children) walk(c as typeof n);
    }
  };
  walk(node as { type: string; segments?: unknown[]; children?: unknown[] });
  return { nodes, total };
}

figma.showUI(__html__, { width: 340, height: 520, title: "html2figma" });

figma.ui.onmessage = async (msg: UiMessage) => {
  if (msg.type === "cancel") {
    figma.closePlugin();
    return;
  }
  if (msg.type !== "import") return;

  try {
    figma.ui.postMessage({ type: "status", text: "렌더링 중…" });
    const renderer = new Renderer({}, msg.options);
    const seg = countSegments(msg.file.root);
    const nodes: SceneNode[] = [await renderer.render(msg.file)];
    if (nodes.length) {
      figma.currentPage.selection = nodes;
      figma.viewport.scrollAndZoomIntoView(nodes);
    }
    figma.ui.postMessage({ type: "status", text: "완료!" });
    figma.notify(
      `html2figma: ${nodes.length}개 임포트 완료 (styled runs: ${seg.nodes}개 노드/${seg.total}구간)`
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    figma.ui.postMessage({ type: "status", text: `오류: ${message}` });
    figma.notify(`html2figma 오류: ${message}`, { error: true });
  }
};
