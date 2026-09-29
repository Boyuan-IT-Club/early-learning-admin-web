import type { AdminFile } from "../../api/files";

/** 试评页的草稿值类型与构造器。与契约类型的转换在 images.ts。 */

export type ImageMode = "local" | "material";

export interface DraftImage {
  key: string;
  mode: ImageMode;
  file: File | null;
  material: AdminFile | null;
}

export interface DraftGroup {
  key: string;
  rule: string;
  images: DraftImage[];
}

export interface DraftQuestion {
  question_id: string;
  text: string;
  hint: string;
}

export function newKey(): string {
  return crypto.randomUUID();
}

export function emptyImage(mode: ImageMode = "local"): DraftImage {
  return { key: newKey(), mode, file: null, material: null };
}
