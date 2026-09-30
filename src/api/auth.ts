import { get, post } from "./client";

/**
 * 管理员登录态与会话接口。
 *
 * Token 存 `sessionStorage`：关掉标签页即失效，不跨标签共享；管理员 Token 服务端 8 小时绝对过期、没有刷新，
 * 过期后任何请求回 401，网络层会清掉它并跳回登录页。
 */

const ACCESS_TOKEN_KEY = "early-learning-access-token";
const ADMIN_NAME_KEY = "early-learning-admin-name";

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_NAME_KEY);
}

/** 侧边栏展示用的当前管理员用户名；不参与鉴权。 */
export function getAdminName(): string | null {
  return sessionStorage.getItem(ADMIN_NAME_KEY);
}

export type AdminStatus = "ACTIVE" | "DISABLED";

export interface Admin {
  id: number;
  username: string;
  status: AdminStatus;
  created_at: string;
}

export interface LoginResult {
  admin_token: string;
  expires_at: string;
  admin: Admin;
}

/** 登录成功即写入会话。失败抛 ApiError：INVALID_CREDENTIALS / ACCOUNT_DISABLED / RATE_LIMITED。 */
export async function login(username: string, password: string): Promise<Admin> {
  const result = await post<LoginResult>("/admin/auth/login", { username, password });
  setAccessToken(result.admin_token);
  sessionStorage.setItem(ADMIN_NAME_KEY, result.admin.username);
  return result.admin;
}

/**
 * 通知服务端吊销当前 Token；无论成败本地都清掉会话。
 *
 * 服务端失败（断网、Token 早已过期）不影响退出：本地会话清掉就等于退出了，
 * 那枚 Token 最多再活到 8 小时后过期。
 */
export async function logout(): Promise<void> {
  try {
    await post<null>("/admin/auth/logout");
  } catch {
    // 尽力而为，见上
  } finally {
    clearAccessToken();
  }
}

export function me(): Promise<Admin> {
  return get<Admin>("/admin/auth/me");
}

/** 修改自己的密码；成功后该管理员的其他会话全部失效，当前会话保留。 */
export function changePassword(oldPassword: string, newPassword: string): Promise<null> {
  return post<null>("/admin/auth/password", {
    old_password: oldPassword,
    new_password: newPassword,
  });
}
