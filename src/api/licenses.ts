import { get, post } from "./client";

/**
 * 激活码接口。明文激活码只出现在批量生成的响应里，列表与查询只给末 4 位。
 */

export type LicenseStatus = "UNUSED" | "ACTIVE" | "REVOKED";

export interface License {
  id: number;
  code_hint: string;
  status: LicenseStatus;
  remark: string | null;
  user_id: number | null;
  username: string | null;
  created_at: string;
  activated_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
}

export interface LicensePage {
  items: License[];
  page: number;
  page_size: number;
  total: number;
  /** 各状态总数，不受筛选影响。 */
  counts: Record<LicenseStatus, number>;
}

export interface IssuedLicense {
  id: number;
  /** 明文，格式 XXXX-XXXX-XXXX-XXXX；关闭结果后无法再次查看。 */
  activation_code: string;
  code_hint: string;
  status: LicenseStatus;
  remark: string | null;
  created_at: string;
}

export interface ListLicensesQuery {
  page?: number;
  page_size?: number;
  status?: LicenseStatus;
  keyword?: string;
}

export function listLicenses(query: ListLicensesQuery = {}): Promise<LicensePage> {
  return get<LicensePage>("/admin/licenses", { params: query });
}

/**
 * 批量生成。`idempotencyKey` 由调用方持有：同一次生成的重试沿用它，10 分钟内服务端返回同一批码；
 * 超时后回 409 SENSITIVE_RESULT_EXPIRED，details.license_ids 给出这批码，需整批撤销后重新生成。
 */
export async function issueLicenses(
  count: number,
  remark: string,
  idempotencyKey: string,
): Promise<IssuedLicense[]> {
  const result = await post<{ licenses: IssuedLicense[] }>(
    "/admin/licenses/batch",
    { count, remark: remark.trim() || undefined },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return result.licenses;
}

/** 按完整码查询；用 POST 传码，完整码不进 URL 与访问日志。 */
export function lookupLicense(activationCode: string): Promise<License> {
  return post<License>("/admin/licenses/lookup", { activation_code: activationCode });
}

/** 撤销：全部成功或全部失败，失败时 details.license_ids 列出有问题的 id。不可恢复。 */
export function revokeLicenses(licenseIds: number[], reason: string): Promise<null> {
  return post<null>("/admin/licenses/revoke", { license_ids: licenseIds, reason });
}
