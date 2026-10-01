export interface SourceImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
}

export interface CompressedImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

const JPEG_QUALITY = 0.85;
const JPEG_QUALITY_FALLBACK = 0.7;
const MAX_BASE64_CHARS = 8 * 1024 * 1024;

export function approxBytesFromDataURL(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  return Math.max(0, Math.round((dataUrl.length - comma - 1) * 0.75));
}

export function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败，无法读取尺寸"));
    image.src = dataUrl;
  });
}

function hasAlphaChannel(image: HTMLImageElement): boolean {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  ctx.drawImage(image, 0, 0, size, size);
  try {
    const { data } = ctx.getImageData(0, 0, size, size);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * 长边超过 maxEdge 才等比缩放；否则保持原分辨率。
 * 输出 JPEG（quality 0.85，Base64 仍 >8MB 时降 0.7 重压）；仅原图 PNG 含透明通道时保留 PNG。
 */
export async function compressImageForUpload(
  source: SourceImage,
  maxEdge: number,
): Promise<CompressedImage> {
  const longEdge = Math.max(source.width, source.height);
  const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const image = await loadImageElement(source.dataUrl);
  const keepPng = source.mime === "image/png" && hasAlphaChannel(image);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("当前浏览器不支持 Canvas 2D，无法压缩");
  }
  if (!keepPng) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(image, 0, 0, width, height);

  let dataUrl: string;
  if (keepPng) {
    dataUrl = canvas.toDataURL("image/png");
  } else {
    dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    if (dataUrl.length > MAX_BASE64_CHARS) {
      dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY_FALLBACK);
    }
  }
  return { dataUrl, width, height, bytes: approxBytesFromDataURL(dataUrl) };
}
