import { get, post, postForm } from "./client";

/**
 * 官方文件（零散素材）接口。
 *
 * 契约里 `/admin/files` 上传的是**零散素材**：音频、PDF、图片三类。
 * 课程与评估材料走整包发布，不从这里上传 ZIP——那是另一套接口。
 */

/** 契约的 `CloudFileKind`。 */
export type CloudFileKind = "AUDIO" | "PDF" | "IMAGE";

/** 契约的 `CloudFileStatus`。 */
export type CloudFileStatus = "UPLOADING" | "READY" | "INVALID" | "DELETED";

/** 官方文件记录；不含 `object_key` 等存储路径，那是服务端内部的事。 */
export interface CloudFile {
  id: number;
  file_code: string;
  file_name: string;
  file_kind: CloudFileKind;
  mime_type: string;
  size_bytes: number;
  /** 仅音频有值。 */
  duration_ms: number | null;
  status: CloudFileStatus;
  sha256: string | null;
  created_at: string;
  updated_at: string;
}

/** 列表元素 = 文件记录 + 引用数。`reference_count > 0` 时删除会返回 `RESOURCE_IN_USE`。 */
export interface AdminFile extends CloudFile {
  reference_count: number;
}

export interface AdminFilePage {
  items: AdminFile[];
  page: number;
  page_size: number;
  total: number;
}

export interface ListFilesQuery {
  page?: number;
  page_size?: number;
  file_code?: string;
  file_kind?: CloudFileKind;
  status?: CloudFileStatus;
  keyword?: string;
}

export const FILE_KINDS: CloudFileKind[] = ["IMAGE", "AUDIO", "PDF"];

export function listFiles(query: ListFilesQuery = {}): Promise<AdminFilePage> {
  return get<AdminFilePage>("/admin/files", { params: query });
}

/**
 * 上传单个官方素材。
 *
 * `idempotencyKey` 由调用方持有：**同一个文件的重发必须沿用它**，服务端据此不重复创建
 * （契约：同标识同输入不重复创建，不同输入返回 409 `IDEMPOTENCY_CONFLICT`）。
 *
 * `file_name` 只在需要覆盖显示名时给；不给就用文件名本身。
 */
export function uploadOfficialFile(
  file: File,
  fileKind: CloudFileKind,
  idempotencyKey: string,
  fileName?: string,
  onProgress?: (percent: number) => void,
): Promise<CloudFile> {
  const form = new FormData();
  form.append("file", file);
  form.append("file_kind", fileKind);
  if (fileName) {
    form.append("file_name", fileName);
  }
  return postForm<CloudFile>("/admin/files", form, {
    headers: { "Idempotency-Key": idempotencyKey },
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
}

/** 按扩展名推断素材种类；认不出来返回 null，由页面提示而不是猜。 */
export function kindOfFile(fileName: string): CloudFileKind | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return KIND_BY_EXTENSION[extension] ?? null;
}

const KIND_BY_EXTENSION: Record<string, CloudFileKind> = {
  png: "IMAGE",
  jpg: "IMAGE",
  jpeg: "IMAGE",
  gif: "IMAGE",
  webp: "IMAGE",
  mp3: "AUDIO",
  wav: "AUDIO",
  m4a: "AUDIO",
  ogg: "AUDIO",
  flac: "AUDIO",
  pdf: "PDF",
};

/**
 * 标记删除。
 *
 * 只有未被引用的 READY 文件能删：被引用时服务端返回 409 `RESOURCE_IN_USE`，
 * 状态非 READY 时返回 409 `RESOURCE_NOT_READY`——两者要分别提示。
 */
export function deleteOfficialFile(fileCode: string): Promise<CloudFile> {
  return post<CloudFile>(`/admin/files/${encodeURIComponent(fileCode)}/delete`);
}
