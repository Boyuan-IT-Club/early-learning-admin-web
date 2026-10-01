import { post } from "./client";
import type { AdminAccount } from "./admins";

/**
 * 管理员登录态（契约 adminLogin）。
 *
 * Token 存 `sessionStorage`：关掉标签页即失效，不跨标签共享。契约没有管理员刷新接口，也没有登出接口：
 * 过期（`expires_at`）、被改密码或被停用后，任何请求回 401，网络层清掉它并跳回登录页；
 * 主动退出只清本地会话。
 */

const ACCESS_TOKEN_KEY = "early-learning-access-token";
const ADMIN_NAME_KEY = "early-learning-admin-name";
const ADMIN_ID_KEY = "early-learning-admin-id";

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_NAME_KEY);
  sessionStorage.removeItem(ADMIN_ID_KEY);
}

/** 侧边栏展示用的当前管理员用户名；不参与鉴权。 */
export function getAdminName(): string | null {
  return sessionStorage.getItem(ADMIN_NAME_KEY);
}

/** 当前登录的管理员 id：用来提示"改自己的密码或停用自己会结束当前会话"；不参与鉴权。 */
export function getAdminId(): number | null {
  const value = sessionStorage.getItem(ADMIN_ID_KEY);
  return value === null ? null : Number(value);
}

/** 契约 `AdminSession`。 */
export interface AdminSession {
  token: string;
  token_type: "Bearer";
  expires_at: string;
  account: AdminAccount;
}

/** 登录成功即写入会话。失败抛 ApiError：INVALID_CREDENTIALS / ACCOUNT_DISABLED / RATE_LIMITED / INVALID_REQUEST。 */
export async function login(username: string, password: string): Promise<AdminAccount> {
  const session = await post<AdminSession>("/admin/login", { username, password });
  setAccessToken(session.token);
  sessionStorage.setItem(ADMIN_NAME_KEY, session.account.username);
  sessionStorage.setItem(ADMIN_ID_KEY, String(session.account.id));
  return session.account;
}

/** 契约没有登出接口：清掉本地会话即退出，那枚 Token 到 expires_at 自然失效。 */
export function logout(): void {
  clearAccessToken();
}
