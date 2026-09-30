// @vitest-environment jsdom
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  CLIENT_ERROR_CODES,
  apiClient,
  get,
  post,
  setUnauthorizedHandler,
} from "./client";
import { clearAccessToken, setAccessToken } from "./auth";

/**
 * 网络层守的是契约里那句话：页面按 `code` 分支，不按 HTTP 状态码。
 * 所以这里逐条验证「任意失败都能拿到稳定的 code」，包括服务端没给包络的情况。
 */

/**
 * 用自定义 adapter 代替真实网络：axios 支持的官方扩展点，不需要额外依赖。
 *
 * 注意：自定义 adapter 不经过 axios 的 `validateStatus`，非 2xx 必须自己抛，
 * 否则响应会走成功分支。这里按内置 adapter 的行为抛，测试才代表真实运行。
 */
function respondWith(status: number, data: unknown) {
  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const response = {
      data,
      status,
      statusText: String(status),
      headers: {},
      config,
    } as AxiosResponse;
    if (status >= 200 && status < 300) {
      return response;
    }
    throw new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_REQUEST,
      config,
      undefined,
      response,
    );
  };
}

function failWith(error: Partial<AxiosError>) {
  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError(
      error.message ?? "boom",
      error.code,
      config,
      undefined,
      error.response,
    );
  };
}

function envelope(code: string, message: string, details?: unknown) {
  return { code, message, data: null, ...(details ? { details } : {}) };
}

const unauthorized = vi.fn();

beforeEach(() => {
  sessionStorage.clear();
  unauthorized.mockReset();
  setUnauthorizedHandler(unauthorized);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api client", () => {
  it("unwraps the payload when code is OK", async () => {
    respondWith(200, { code: "OK", message: "成功", data: { items: [1, 2] } });

    await expect(get<{ items: number[] }>("/admin/files")).resolves.toEqual({
      items: [1, 2],
    });
  });

  it("sends the bearer token when one is stored, and nothing when it is not", async () => {
    const seen: Array<Record<string, unknown>> = [];
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      seen.push(config.headers as Record<string, unknown>);
      return {
        data: { code: "OK", message: "成功", data: null },
        status: 200,
        statusText: "200",
        headers: {},
        config,
      } as AxiosResponse;
    };

    await get("/admin/files");
    setAccessToken("token-abc");
    await get("/admin/files");

    expect(seen[0].Authorization).toBeUndefined();
    expect(seen[1].Authorization).toBe("Bearer token-abc");
  });

  it("treats a non-OK code on a 200 response as a failure", async () => {
    respondWith(200, envelope("RUBRIC_UNAVAILABLE", "评分标准版本不可用"));

    await expect(get("/api/ai/rubrics")).rejects.toMatchObject({
      code: "RUBRIC_UNAVAILABLE",
      message: "评分标准版本不可用",
      httpStatus: 200,
    });
  });

  it("keeps the server code and details on a 4xx, instead of inventing one", async () => {
    respondWith(
      409,
      envelope("RESOURCE_IN_USE", "文件被引用，无法删除", {
        file_code: "CF_ABC",
      }),
    );

    const error = await get("/admin/files").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("RESOURCE_IN_USE");
    expect((error as ApiError).httpStatus).toBe(409);
    expect((error as ApiError).details).toEqual({ file_code: "CF_ABC" });
  });

  it("clears the token and leaves the page when the server answers 401 without an envelope", async () => {
    setAccessToken("token-abc");
    respondWith(401, "");

    const error = await post("/admin/files").catch((e: unknown) => e);

    expect((error as ApiError).code).toBe(CLIENT_ERROR_CODES.UNAUTHORIZED);
    expect(sessionStorage.getItem("early-learning-access-token")).toBeNull();
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it("prefers the server code on a 401 that does carry an envelope", async () => {
    respondWith(401, envelope("TOKEN_EXPIRED", "凭证已过期"));

    const error = await get("/admin/files").catch((e: unknown) => e);

    expect((error as ApiError).code).toBe("TOKEN_EXPIRED");
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when a 401 only means the password was wrong", async () => {
    setAccessToken("token-abc");
    respondWith(401, envelope("INVALID_CREDENTIALS", "账号密码不正确"));

    const error = await post("/admin/auth/password").catch((e: unknown) => e);

    expect((error as ApiError).code).toBe("INVALID_CREDENTIALS");
    expect(sessionStorage.getItem("early-learning-access-token")).toBe("token-abc");
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("ends the session when the admin is disabled mid-session", async () => {
    setAccessToken("token-abc");
    respondWith(403, envelope("ACCOUNT_DISABLED", "账号不可用"));

    await get("/admin/files").catch((e: unknown) => e);

    expect(sessionStorage.getItem("early-learning-access-token")).toBeNull();
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it("maps a timeout to a stable client code", async () => {
    failWith({ code: AxiosError.ECONNABORTED, message: "timeout of 15000ms exceeded" });

    const error = await get("/admin/files").catch((e: unknown) => e);

    expect((error as ApiError).code).toBe(CLIENT_ERROR_CODES.TIMEOUT);
    expect((error as ApiError).httpStatus).toBeUndefined();
  });

  it("maps an unreachable server to a stable client code", async () => {
    failWith({ code: AxiosError.ERR_NETWORK, message: "Network Error" });

    const error = await get("/admin/files").catch((e: unknown) => e);

    expect((error as ApiError).code).toBe(CLIENT_ERROR_CODES.NETWORK);
  });

  it("maps a non-envelope response such as a gateway page to a stable client code", async () => {
    respondWith(502, "<html>Bad Gateway</html>");

    const error = await get("/admin/files").catch((e: unknown) => e);

    expect((error as ApiError).code).toBe(CLIENT_ERROR_CODES.MALFORMED_RESPONSE);
    expect((error as ApiError).httpStatus).toBe(502);
  });
});

describe("auth token store", () => {
  it("round-trips and clears", () => {
    expect(sessionStorage.getItem("early-learning-access-token")).toBeNull();
    setAccessToken("t");
    expect(sessionStorage.getItem("early-learning-access-token")).toBe("t");
    clearAccessToken();
    expect(sessionStorage.getItem("early-learning-access-token")).toBeNull();
  });
});
