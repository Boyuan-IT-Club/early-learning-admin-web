import { get, post } from "./client";
import type { Admin } from "./auth";

/** 管理员维护接口。至少保留一个可用管理员，且不能停用自己（服务端守护）。 */

export function listAdmins(): Promise<Admin[]> {
  return get<Admin[]>("/admin/admins");
}

export function createAdmin(
  username: string,
  initialPassword: string,
  idempotencyKey: string,
): Promise<Admin> {
  return post<Admin>(
    "/admin/admins",
    { username, initial_password: initialPassword },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
}

export function disableAdmin(id: number): Promise<null> {
  return post<null>(`/admin/admins/${id}/disable`);
}

export function enableAdmin(id: number): Promise<null> {
  return post<null>(`/admin/admins/${id}/enable`);
}

/** 重置他人密码；被重置者的全部会话失效。 */
export function resetAdminPassword(id: number, newPassword: string): Promise<null> {
  return post<null>(`/admin/admins/${id}/reset-password`, { new_password: newPassword });
}
