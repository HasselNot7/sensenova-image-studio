export function extensionForDataUrl(dataUrl: string): string {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1]?.toLowerCase() ?? "";
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

export function buildFilename(model: string, ts: number, extension: string): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${model}_${stamp}.${extension}`;
}

export function triggerDownload(dataUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
