import { get, post } from "./client";

/**
 * 激活码（契约 createLicenses / listLicenses / revokeLicense）。
 * 激活码原文只出现在生成结果里；列表只有 id、状态、绑定教师与激活时间。
 */

export type LicenseStatus = "UNUSED" | "ACTIVE" | "REVOKED";

/** 契约 `License`。 */
export interface License {
  id: number;
  user_id: number | null;
  status: LicenseStatus;
  activated_at: string | null;
}

export interface LicensePage {
  items: License[];
  page: number;
  page_size: number;
  total: number;
}

/** 契约 `IssuedLicense`。 */
export interface IssuedLicense {
  id: number;
  /** 原文；关闭结果后无法再次查看。 */
  activation_code: string;
  status: "UNUSED";
}

export interface ListLicensesQuery {
  page?: number;
  page_size?: number;
  status?: LicenseStatus;
  user_id?: number;
}

export function listLicenses(query: ListLicensesQuery = {}): Promise<LicensePage> {
  return get<LicensePage>("/admin/licenses", { params: query });
}

/**
 * 单个或批量生成。`idempotencyKey` 由调用方持有：同一次生成的重试沿用它，短时内服务端返回同一批码；
 * 过期后回 409 SENSITIVE_RESULT_EXPIRED，details.license_ids 给出这批码的 id，需逐个撤销后重新生成。
 */
export async function createLicenses(count: number, idempotencyKey: string): Promise<IssuedLicense[]> {
  const result = await post<{ items: IssuedLicense[] }>(
    "/admin/licenses",
    { count },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return result.items;
}

/** 撤销，不可恢复；撤销已激活的码会同时停用绑定教师。已撤销的再撤销直接返回当前状态。 */
export function revokeLicense(id: number): Promise<License> {
  return post<License>(`/admin/licenses/${id}/revoke`);
}
