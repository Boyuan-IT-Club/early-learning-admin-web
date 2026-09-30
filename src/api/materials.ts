import { get, post, postForm } from "./client";

/**
 * 评估材料接口（管理端三个操作）。
 *
 * 版本目录与依赖下载是平板端接口，管理端不消费；这里只覆盖
 * `/admin/assessment-materials` 的发布、列表与停用。
 */

/** 契约的 `ContentStatus`。 */
export type ContentStatus = "ACTIVE" | "DISABLED";

/**
 * 冻结的 ActivityConfig v2。字段结构与契约一致，页面只做展示，
 * 不解释活动内部字段；文件引用是发布时已转换的 CF_ 编号。
 */
export interface ActivityConfig {
  schema_version: number;
  story_context: string;
  activities: Array<{
    activity_id: string;
    type: string;
    config?: Record<string, unknown>;
  }>;
}

/** 契约的 `AssessmentMaterial`：发布接口返回的完整版本。 */
export interface AssessmentMaterial {
  id: number;
  official_material_code: string;
  content_version: string;
  name: string;
  activity_configs_json: ActivityConfig;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}

/** 列表概要，不含活动配置。 */
export interface MaterialSummary {
  id: number;
  official_material_code: string;
  content_version: string;
  name: string;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}

export interface MaterialPage {
  items: MaterialSummary[];
  page: number;
  page_size: number;
  total: number;
}

export interface ListMaterialsQuery {
  page?: number;
  page_size?: number;
  official_material_code?: string;
  status?: ContentStatus;
  keyword?: string;
}

export function listMaterials(query: ListMaterialsQuery = {}): Promise<MaterialPage> {
  return get<MaterialPage>("/admin/assessment-materials", { params: query });
}

/**
 * 上传 ZIP 发布一个版本。
 *
 * `idempotencyKey` 由调用方持有：同一个包的重发必须沿用它，服务端据此返回首次
 * 发布结果而不是再建一版（契约：同键不同包返回 409 `IDEMPOTENCY_CONFLICT`）。
 */
export function publishMaterial(zip: File, idempotencyKey: string): Promise<AssessmentMaterial> {
  const form = new FormData();
  form.append("file", zip);
  return postForm<AssessmentMaterial>("/admin/assessment-materials", form, {
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

/** 停用一个版本：禁止新选，历史引用不受影响；重复停用幂等返回当前行。 */
export function disableMaterial(id: number): Promise<AssessmentMaterial> {
  return post<AssessmentMaterial>(`/admin/assessment-materials/${id}/disable`);
}
