// @vitest-environment jsdom
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError, apiClient } from "./client";
import { deleteOfficialFile, listFiles, uploadOfficialFile } from "./files";

/**
 * 这些用例守的是**线上形状**：路径、query 参数名、multipart 字段名、必需 header。
 * 字段名写错在浏览器里只会得到一个 400，与其在页面上排查，不如在这里钉住。
 */

let seen: InternalAxiosRequestConfig[] = [];

function setup(status = 200, data: unknown = null) {
  seen = [];
  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    seen.push(config);
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
    throw new AxiosError("failed", AxiosError.ERR_BAD_REQUEST, config, undefined, response);
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  setup(200, null);
});

const okPage = {
  code: "OK",
  message: "成功",
  data: { items: [], page: 1, page_size: 20, total: 0 },
};

describe("files api", () => {
  it("lists with only the query parameters that were actually given", async () => {
    setup(200, okPage);

    await listFiles({ page: 2, file_kind: "IMAGE", keyword: "兔子" });

    expect(seen[0].url).toBe("/admin/files");
    expect(seen[0].params).toEqual({ page: 2, file_kind: "IMAGE", keyword: "兔子" });
  });

  it("uploads as multipart with the contract field names and the idempotency key", async () => {
    setup(201, { code: "OK", message: "成功", data: { file_code: "CF_1" } });
    const file = new File(["binary"], "rabbit.png", { type: "image/png" });

    await uploadOfficialFile(file, "IMAGE", "key-123", "兔子图");

    const config = seen[0];
    expect(config.url).toBe("/admin/files");
    expect(config.headers["Idempotency-Key"]).toBe("key-123");
    const form = config.data as FormData;
    expect(form.get("file_kind")).toBe("IMAGE");
    expect(form.get("file_name")).toBe("兔子图");
    expect((form.get("file") as File).name).toBe("rabbit.png");
    // 这里不断言 Content-Type：jsdom 与 axios 分属不同 realm，`instanceof FormData` 判不出来，
    // axios 会留下它的默认值 application/x-www-form-urlencoded。浏览器里同 realm，行为正常。
    // boundary 是否正确由 M13 的浏览器实测覆盖。
  });

  it("omits file_name when it is not needed", async () => {
    setup(201, { code: "OK", message: "成功", data: {} });

    await uploadOfficialFile(new File(["x"], "a.pdf"), "PDF", "k");

    expect((seen[0].data as FormData).get("file_name")).toBeNull();
  });

  it("deletes through the mark-delete path", async () => {
    setup(200, { code: "OK", message: "成功", data: {} });

    await deleteOfficialFile("CF_A/B");

    expect(seen[0].url).toBe("/admin/files/CF_A%2FB/delete");
    // axios 会把方法名小写
    expect(seen[0].method).toBe("post");
  });

  it("surfaces RESOURCE_IN_USE with its details so the page can explain why", async () => {
    setup(409, {
      code: "RESOURCE_IN_USE",
      message: "文件被引用",
      data: null,
      details: { file_code: "CF_1", license_ids: [3, 7] },
    });

    const error = await deleteOfficialFile("CF_1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("RESOURCE_IN_USE");
    expect((error as ApiError).details).toEqual({ file_code: "CF_1", license_ids: [3, 7] });
  });
});
