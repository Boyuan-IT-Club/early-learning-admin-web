import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { apiClient } from "../api/client";

/**
 * 页面测试用的假后端：按"方法 路径"匹配，返回包络；记录每次请求，便于断言请求体与请求头。
 *
 * 替换的是 axios adapter，所以请求仍经过真实的拦截器与包络解析，与线上路径一致。
 */

export type Handler = (config: InternalAxiosRequestConfig) => { status: number; body: unknown };

export interface RecordedCall {
  method: string;
  url: string;
  data: unknown;
  headers: Record<string, unknown>;
}

export function ok(data: unknown, status = 200) {
  return { status, body: { code: "OK", message: "成功", data } };
}

export function fail(status: number, code: string, message = "失败", details?: unknown) {
  return { status, body: { code, message, data: null, ...(details ? { details } : {}) } };
}

export function mockApi(routes: Record<string, Handler>): RecordedCall[] {
  const calls: RecordedCall[] = [];
  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const method = (config.method ?? "get").toUpperCase();
    const url = config.url ?? "";
    const data = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    calls.push({ method, url, data, headers: config.headers as unknown as Record<string, unknown> });
    const handler = routes[`${method} ${url}`];
    if (!handler) throw new Error(`没有为 ${method} ${url} 准备假响应`);
    const { status, body } = handler(config);
    const response = { data: body, status, statusText: String(status), headers: {}, config } as AxiosResponse;
    if (status >= 200 && status < 300) return response;
    throw new AxiosError("failed", AxiosError.ERR_BAD_REQUEST, config, undefined, response);
  };
  return calls;
}

/** Idempotency-Key 头的值（axios 头部大小写不固定）。 */
export function header(call: RecordedCall, name: string): unknown {
  const entry = Object.entries(call.headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

export function stubDialogs() {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}
