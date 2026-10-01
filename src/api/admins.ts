import { get, patch, post } from "./client";

/** 管理员维护（契约 createAdminAccount / listAdminAccounts / updateAdminAccount）。所有管理员同权限。 */

export type AdminStatus = "ACTIVE" | "DISABLED";

/** 契约 `AdminAccount`。 */
export interface AdminAccount {
  id: number;
  username: string;
  status: AdminStatus;
  created_at: string;
  updated_at: string;
}

export interface AdminAccountPage {
  items: AdminAccount[];
  page: number;
  page_size: number;
  total: number;
}

export interface ListAdminsQuery {
  page?: number;
  page_size?: number;
  /** 服务端转小写后精确匹配。 */
  username?: string;
  status?: AdminStatus;
}

export function listAdmins(query: ListAdminsQuery = {}): Promise<AdminAccountPage> {
  return get<AdminAccountPage>("/admin/accounts", { params: query });
}

/** 重试沿用同一个 `idempotencyKey`，服务端返回首次结果，不会重复创建。 */
export function createAdmin(
  username: string,
  password: string,
  idempotencyKey: string,
): Promise<AdminAccount> {
  return post<AdminAccount>(
    "/admin/accounts",
    { username, password },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
}

/** 至少传一项。改密码或停用后，该管理员已签发的 Token 全部失效（包括改自己时的当前会话）。 */
export function updateAdmin(
  id: number,
  change: { password?: string; status?: AdminStatus },
): Promise<AdminAccount> {
  return patch<AdminAccount>(`/admin/accounts/${id}`, change);
}
