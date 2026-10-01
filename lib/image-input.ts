"use client";

import { compressImageForUpload, loadImageElement, type SourceImage } from "./image-compress";
import type { InputImagePolicy } from "./models";

export interface PreparedImage {
  /** 发给上游的 Data-URL */
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  name: string;
  /** 被等比缩放过 */
  compressed: boolean;
  /** 留原文件引用，改压缩长边时可以直接重算，不必让用户重传 */
  file: File | null;
}

export class ImageInputError extends Error {}

function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageInputError("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function approxBytes(dataUrl: string): number {
  return Math.max(0, Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75));
}

/**
 * 目标长边。`uncompressed` 只在官方允许不压的模型上生效；
 * 否则夹到该模型滑杆上限（官方推荐值），拖过头也没用。
 */
export function resolveTargetEdge(
  policy: InputImagePolicy,
  chosen: number,
  uncompressed = false,
): number {
  if (uncompressed && policy.allowUncompressed) {
    return Number.POSITIVE_INFINITY;
  }
  const safe = Number.isFinite(chosen) && chosen > 0 ? chosen : policy.defaultMaxEdge;
  return Math.min(safe, policy.maxEdgeCeiling);
}

/**
 * 按该模型的输入图策略准备一张图。
 * 各家限制不同：千问按模型走建议上限（3.0 长边 2048、2.0 编辑 3072，≤10 MB），
 * SenseNova 只把 10 MB 当警告线、长边由用户选、格式只收 png/jpeg/webp。
 */
export async function prepareImageInput(
  source: File | string,
  name: string,
  policy: InputImagePolicy,
  chosenMaxEdge: number,
  file?: File | null,
  uncompressed = false,
): Promise<PreparedImage> {
  const incoming = typeof source === "string" ? null : source;
  const target = file ?? incoming;
  if (target) {
    if (target.type.length > 0 && !policy.formats.includes(target.type)) {
      throw new ImageInputError(
        `该模型不收 ${target.type || "这种文件"}，它接受：${policy.formats.map((f) => f.split("/")[1]).join(" / ")}`,
      );
    }
    if (policy.hardMaxBytes && target.size > policy.maxBytes) {
      throw new ImageInputError(`${name} 有 ${(target.size / 1024 / 1024).toFixed(1)} MB，超过该模型的单张上限`);
    }
  }

  const rawUrl = typeof source === "string" ? source : await readAsDataURL(source as Blob);
  const image = await loadImageElement(rawUrl).catch(() => {
    throw new ImageInputError("图片解码失败，请确认文件是完整可用的图片");
  });
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const longEdge = Math.max(width, height);

  if (policy.minEdge !== null && longEdge < policy.minEdge) {
    throw new ImageInputError(
      `图片只有 ${width}×${height}，该模型要求长边不小于 ${policy.minEdge} px`,
    );
  }

  const targetEdge = resolveTargetEdge(policy, chosenMaxEdge, uncompressed);
  const sourceImage: SourceImage = {
    dataUrl: rawUrl,
    width,
    height,
    bytes: approxBytes(rawUrl),
    mime: rawUrl.slice(5, rawUrl.indexOf(";")),
  };
  if (longEdge <= targetEdge) {
    return {
      dataUrl: rawUrl,
      width,
      height,
      bytes: sourceImage.bytes,
      name,
      compressed: false,
      file: target,
    };
  }

  const compressed = await compressImageForUpload(sourceImage, targetEdge);
  return {
    dataUrl: compressed.dataUrl,
    width: compressed.width,
    height: compressed.height,
    bytes: compressed.bytes,
    name,
    compressed: true,
    file: target,
  };
}
