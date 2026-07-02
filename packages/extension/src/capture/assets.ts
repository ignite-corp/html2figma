import type { AssetMap, ImageAsset } from "@html2figma/shared";

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function parseDataUrl(url: string): ImageAsset | null {
  const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) return null;
  const mime = m[1] || "image/png";
  const isBase64 = !!m[2];
  const data = m[3];
  const dataBase64 = isBase64 ? data : btoa(decodeURIComponent(data));
  return { kind: "image", mime, dataBase64 };
}

async function fetchImage(url: string): Promise<ImageAsset | null> {
  if (url.startsWith("data:")) return parseDataUrl(url);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const mime = res.headers.get("content-type") || guessMime(url);
    return { kind: "image", mime, dataBase64: arrayBufferToBase64(buf) };
  } catch {
    return null;
  }
}

function guessMime(url: string): string {
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.jpe?g(\?|$)/i.test(url)) return "image/jpeg";
  if (/\.gif(\?|$)/i.test(url)) return "image/gif";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  if (/\.svg(\?|$)/i.test(url)) return "image/svg+xml";
  return "image/png";
}

/** 이미지 URL 집합을 병렬로 받아 AssetMap 구성 (assetId = url) */
export async function collectImageAssets(
  urls: Set<string>,
  onProgress?: (done: number, total: number) => void
): Promise<AssetMap> {
  const map: AssetMap = {};
  const list = [...urls];
  let done = 0;
  const CONCURRENCY = 6;

  async function worker(start: number) {
    for (let i = start; i < list.length; i += CONCURRENCY) {
      const url = list[i];
      const asset = await fetchImage(url);
      if (asset) map[url] = asset;
      done++;
      onProgress?.(done, list.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, list.length) }, (_, k) => worker(k))
  );
  return map;
}
