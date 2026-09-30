import { ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from "../../api/contract";
import type { AllowedImageMime } from "../../api/contract";
import type { ContentItem, ImageContext } from "../../api/aiScore";
import { formatFileSize } from "../../utils/format";
import type { DraftGroup, DraftImage } from "./types";

/**
 * 草稿 → 契约载荷的纯转换:base64 编码、MIME 白名单、图片分组的 images[] 与 content_items[]。
 * 服务端是权威:这里的校验只是让用户在提交前就得到正确的提示。
 */

/**
 * 读成 base64。 `content_base64` 不含 `data:*;base64,` 前缀,所以不走 readAsDataURL。
 *
 * 分块编码:`String.fromCharCode(...bytes)` 一次性展开大数组会爆栈,按 32KB 一段拼。
 */
export async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/** 契约只接受 jpeg/png/webp(不认 gif,也不能用 files.ts 的 kindOfFile)。 */
export function mimeOf(file: File): AllowedImageMime | null {
  const found = ALLOWED_IMAGE_MIME.find((mime) => mime === file.type);
  return found ?? null;
}

/** 一张草稿 → 一个 ImageContext。编号由调用方给定:素材用它自己的编号,内联的自造一个。 */
export async function toImageContext(draft: DraftImage, fileCode: string, where: string): Promise<ImageContext> {
  if (draft.mode === "material") {
    if (!draft.material) throw new Error(`${where}:还没选素材`);
    return { kind: "SERVER_FETCH", file_code: draft.material.file_code };
  }
  if (!draft.file) throw new Error(`${where}:还没选图片文件`);
  const mime = mimeOf(draft.file);
  if (!mime) throw new Error(`${where}:只支持 JPEG / PNG / WebP(服务端还会再验魔数)`);
  if (draft.file.size === 0 || draft.file.size > MAX_IMAGE_BYTES) {
    throw new Error(`${where}:单张图片不能超过 ${formatFileSize(MAX_IMAGE_BYTES)}`);
  }
  return { kind: "INLINE_IMAGE", file_code: fileCode, mime_type: mime, content_base64: await toBase64(draft.file) };
}

/**
 * 分组草稿 → 契约的 images[] 与 content_items[]。
 *
 * 一趟算出来:`content_items[].image_file_codes` 里的每个编号都必须在 images[] 里出现,
 * 分两处各算一遍迟早对不上。
 */
export async function buildStoryPayload(groups: DraftGroup[]): Promise<{
  images: ImageContext[];
  contentItems: ContentItem[];
}> {
  const images: ImageContext[] = [];
  const contentItems: ContentItem[] = [];
  for (const [groupIndex, group] of groups.entries()) {
    const fileCodes: string[] = [];
    for (const [imageIndex, draft] of group.images.entries()) {
      const where = `分组 G${groupIndex + 1} 的第 ${imageIndex + 1} 张图`;
      const fileCode =
        draft.mode === "material" && draft.material
          ? draft.material.file_code
          : `INLINE_${groupIndex + 1}_${imageIndex + 1}`;
      images.push(await toImageContext(draft, fileCode, where));
      fileCodes.push(fileCode);
    }
    contentItems.push({
      content_item_id: `G${groupIndex + 1}`,
      image_file_codes: fileCodes,
      rubric_item_code: group.rule,
    });
  }
  return { images, contentItems };
}
