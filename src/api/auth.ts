/**
 * 登录态存取。
 *
 * 目前只放 token 的读写：登录请求本身是下一步（开发优先级第 5 项），
 * 本模块只保证网络层能拿到 token、401 时能把它清掉。
 *
 * 存 `sessionStorage` 而不是 `localStorage`：与现有演示登录态一致，
 * 且关掉标签页即失效。等登录流程定下来若需要长期登录，再连同 refresh token 一起改。
 */

const ACCESS_TOKEN_KEY = "early-learning-access-token";

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}
