import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { clearAccessToken, getAccessToken } from "./auth";

/**
 * 服务端统一响应包络，对应服务端 `common/web/ApiResponse`。
 *
 * `code` / `message` / `data` 恒在；`details` 只在失败时出现。
 */
export interface ApiEnvelope<T> {
  code: string;
  message: string;
  data: T | null;
  details?: ApiErrorDetails;
}

/** 服务端 `common/error/ApiErrorDetails`：错误定位信息，非敏感。 */
export interface ApiErrorDetails {
  field_path?: string;
  file_code?: string;
  rubric_item_code?: string;
  current_version?: number;
  limit?: { name: string; maximum: number };
  license_ids?: number[];
  file_name?: string;
}

/**
 * 网络层自己产生的错误码。
 *
 * 服务端不可达、超时、或回了一个不是包络的响应时，没有业务 `code` 可用，
 * 但**页面仍然需要一个稳定值来分支**——所以这几条在这里定义，并以 `CLIENT_` 前缀
 * 与服务端业务码区分开。
 */
export const CLIENT_ERROR_CODES = {
  NETWORK: "CLIENT_NETWORK_ERROR",
  TIMEOUT: "CLIENT_TIMEOUT",
  MALFORMED_RESPONSE: "CLIENT_MALFORMED_RESPONSE",
  UNAUTHORIZED: "CLIENT_UNAUTHORIZED",
} as const;

export type ClientErrorCode =
  (typeof CLIENT_ERROR_CODES)[keyof typeof CLIENT_ERROR_CODES];

/** 成功响应的 `code` 固定值。 */
export const OK_CODE = "OK";

const LOGIN_PATH = "/login";

const CLIENT_ERROR_MESSAGES: Record<ClientErrorCode, string> = {
  CLIENT_NETWORK_ERROR: "网络不可用，请检查连接后重试。",
  CLIENT_TIMEOUT: "请求超时，请稍后重试。",
  CLIENT_MALFORMED_RESPONSE: "服务端返回了无法识别的内容。",
  CLIENT_UNAUTHORIZED: "登录状态已失效，请重新登录。",
};

/**
 * 页面拿到的唯一错误类型。
 *
 * **`code` 原样来自服务端**（网络层不翻译、不改写、不按 HTTP 状态码另造一个）；
 * 页面按 `code` 分支，需要定位时看 `details`。`httpStatus` 只用于诊断与日志。
 */
export class ApiError extends Error {
  readonly code: string;
  readonly details?: ApiErrorDetails;
  readonly httpStatus?: number;

  constructor(
    code: string,
    message: string,
    httpStatus?: number,
    details?: ApiErrorDetails,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

let unauthorizedHandler: () => void = () => {
  if (typeof window !== "undefined" && window.location.pathname !== LOGIN_PATH) {
    window.location.assign(LOGIN_PATH);
  }
};

/**
 * 替换 401 时的跳转实现。
 *
 * 默认整页跳到登录页（本模块在 React 之外，拿不到 router）。留出这个口子是因为
 * 跳转在单测里无法观察——真实的 `location.assign` 在 jsdom 里不可替换。
 */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 只挂错误拦截器：把任何失败统一成 ApiError。
// 解包放在下面类型化的请求入口里——在那里做，类型是准的；
// 在拦截器里把返回值换成 data 会让 axios 的类型对不上，得靠断言压过去。
apiClient.interceptors.response.use(undefined, (error: unknown) => {
  throw toApiError(error);
});

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (!axios.isAxiosError(error)) {
    return new ApiError(
      CLIENT_ERROR_CODES.NETWORK,
      CLIENT_ERROR_MESSAGES.CLIENT_NETWORK_ERROR,
    );
  }

  const status = error.response?.status;
  const envelope = readEnvelope(error.response?.data);

  if (status === 401) {
    // 服务端的安全层可能直接回 401 而不带包络（例如 Spring Security 的入口点），
    // 所以这里按**状态码**判断，而不是等业务码。
    clearAccessToken();
    unauthorizedHandler();
    return envelope
      ? new ApiError(envelope.code, envelope.message, status, envelope.details)
      : new ApiError(
          CLIENT_ERROR_CODES.UNAUTHORIZED,
          CLIENT_ERROR_MESSAGES.CLIENT_UNAUTHORIZED,
          status,
        );
  }

  if (envelope) {
    return new ApiError(
      envelope.code,
      envelope.message,
      status,
      envelope.details,
    );
  }

  if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
    return new ApiError(
      CLIENT_ERROR_CODES.TIMEOUT,
      CLIENT_ERROR_MESSAGES.CLIENT_TIMEOUT,
    );
  }

  if (status === undefined) {
    return new ApiError(
      CLIENT_ERROR_CODES.NETWORK,
      CLIENT_ERROR_MESSAGES.CLIENT_NETWORK_ERROR,
    );
  }

  // 有响应、但内容不是包络：多半是网关或代理返回的页面
  return new ApiError(
    CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
    CLIENT_ERROR_MESSAGES.CLIENT_MALFORMED_RESPONSE,
    status,
  );
}

/** 只有形如包络的对象才认，避免把网关的 HTML/字符串当成业务响应。 */
function readEnvelope(payload: unknown): ApiEnvelope<unknown> | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.code !== "string" || typeof candidate.message !== "string") {
    return undefined;
  }
  return candidate as unknown as ApiEnvelope<unknown>;
}

/**
 * 统一请求入口：解包包络后返回 `data`，失败一律抛 {@link ApiError}。
 *
 * 契约要求「`code === "OK"` 才解包」，所以这里按 `code` 判断，**不看 HTTP 状态码**：
 * 200 也可能带业务失败码。
 */
async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.request<ApiEnvelope<T>>(config);
  const envelope = readEnvelope(response.data);
  if (!envelope) {
    throw new ApiError(
      CLIENT_ERROR_CODES.MALFORMED_RESPONSE,
      CLIENT_ERROR_MESSAGES.CLIENT_MALFORMED_RESPONSE,
      response.status,
    );
  }
  if (envelope.code !== OK_CODE) {
    throw new ApiError(
      envelope.code,
      envelope.message,
      response.status,
      envelope.details,
    );
  }
  // 成功包络的 data 可以是 null（无返回内容的操作），由调用方的 T 决定怎么用
  return envelope.data as T;
}

export function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return request<T>({ ...config, url, method: "GET" });
}

export function post<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  return request<T>({ ...config, url, method: "POST", data: body });
}

/** multipart 上传；不要手写 Content-Type，浏览器要自己带 boundary。 */
export function postForm<T>(
  url: string,
  form: FormData,
  config?: AxiosRequestConfig,
): Promise<T> {
  return request<T>({ ...config, url, method: "POST", data: form });
}
