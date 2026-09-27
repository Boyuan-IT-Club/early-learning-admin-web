// @vitest-environment jsdom
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { apiClient } from "../api/client";
import { Files } from "./Files";

/**
 * 官方素材页守的是 M13 的两条验收：真实上传能出现在列表里；删除被引用的文件要给出**原因**。
 */

type Route = { status: number; body: unknown };

let routes: Record<string, Route>;
let calls: Array<{ url: string; method?: string; params?: unknown; data?: unknown }>;
let uploadHappened = false;

function routeKey(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? "";
  if (url === "/admin/files" && config.method === "post") return "upload";
  if (url === "/admin/files") return "list";
  return "delete";
}

function envelope(data: unknown) {
  return { code: "OK", message: "成功", data };
}

function fileDTO(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    file_code: "CF_1",
    file_name: "兔子.png",
    file_kind: "IMAGE",
    mime_type: "image/png",
    size_bytes: 2048,
    duration_ms: null,
    status: "READY",
    sha256: "abc",
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:00:00Z",
    reference_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  calls = [];
  uploadHappened = false;
  routes = {
    list: {
      status: 200,
      body: envelope({ items: [fileDTO({ reference_count: 3 })], page: 1, page_size: 20, total: 1 }),
    },
    delete: { status: 200, body: envelope(fileDTO({ status: "DELETED" })) },
    upload: { status: 201, body: envelope(fileDTO({ file_code: "CF_NEW", file_name: "新图.png" })) },
  };
  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    calls.push({ url: config.url ?? "", method: config.method, params: config.params, data: config.data });
    const key = routeKey(config);
    if (key === "upload") {
      uploadHappened = true;
    }
    if (key === "list" && uploadHappened) {
      // 上传成功后列表里应当真的多一行——让 mock 有状态，断言才有意义
      routes.list = {
        status: 200,
        body: envelope({
          items: [
            fileDTO({ id: 2, file_code: "CF_NEW", file_name: "新图.png" }),
            fileDTO({ reference_count: 3 }),
          ],
          page: 1,
          page_size: 20,
          total: 2,
        }),
      };
    }
    const route = routes[key];
    const response = {
      data: route.body,
      status: route.status,
      statusText: String(route.status),
      headers: {},
      config,
    } as AxiosResponse;
    if (route.status >= 200 && route.status < 300) return response;
    throw new AxiosError("failed", AxiosError.ERR_BAD_REQUEST, config, undefined, response);
  };
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("official files page", () => {
  it("lists files with their reference count", async () => {
    render(<Files />);

    expect(await screen.findByText("兔子.png")).toBeInTheDocument();
    expect(screen.getByText("CF_1")).toBeInTheDocument();
    expect(screen.getByText("共 1 份素材")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("explains why a referenced file cannot be deleted", async () => {
    routes.delete = {
      status: 409,
      body: {
        code: "RESOURCE_IN_USE",
        message: "文件被引用",
        data: null,
        details: { file_code: "CF_1" },
      },
    };
    render(<Files />);
    await screen.findByText("兔子.png");

    fireEvent.click(screen.getByRole("button", { name: /标记删除/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    // 页面要按 code 给出原因，而不是只说"删除失败"
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("RESOURCE_IN_USE");
    expect(alert).toHaveTextContent("已被课程或评估引用");
    // 失败后不刷新列表，弹窗仍开着
    expect(screen.getByRole("button", { name: "确认删除" })).toBeInTheDocument();
  });

  it("uploads a real file and refreshes the list", async () => {
    render(<Files />);
    await screen.findByText("兔子.png");
    const before = calls.length;

    const file = new File(["x"], "新图.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("选择素材文件"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /开始上传/ }));

    await waitFor(() => {
      expect(screen.getByText("上传成功")).toBeInTheDocument();
    });
    const upload = calls.slice(before).find((call) => call.url === "/admin/files" && call.method === "post");
    expect(upload).toBeDefined();
    const form = upload?.data as FormData;
    expect(form.get("file_kind")).toBe("IMAGE");
    // 上传成功后重新拉列表：断言新文件真的出现在**列表里**，而不是数请求次数。
    // 必须限定在表格内：成功结果盒里也有同一个文件名，全局查询会命中多个而抛错（曾因此 flaky）。
    const table = screen.getByRole("table");
    expect(await within(table).findByText("新图.png")).toBeInTheDocument();
    expect(screen.getByText("共 2 份素材")).toBeInTheDocument();
  });

  it("resets to the first page when the keyword changes", async () => {
    routes.list = {
      status: 200,
      body: envelope({ items: [fileDTO()], page: 2, page_size: 20, total: 25 }),
    };
    render(<Files />);
    await screen.findByText("兔子.png");

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() => {
      expect(calls.some((call) => (call.params as { page?: number })?.page === 2)).toBe(true);
    });

    // 在第 2 页搜索：必须回到第 1 页，否则会展示一个空页
    fireEvent.change(screen.getByRole("textbox", { name: "搜索文件名或编号" }), {
      target: { value: "兔子" },
    });
    await waitFor(() => {
      const lastList = [...calls].reverse().find((call) => call.url === "/admin/files" && call.method === "get");
      expect((lastList?.params as { page?: number })?.page).toBe(1);
    });
  });

  it("rejects an unsupported file locally without sending anything", async () => {
    render(<Files />);
    await screen.findByText("兔子.png");
    const before = calls.length;

    fireEvent.change(screen.getByLabelText("选择素材文件"), {
      target: { files: [new File(["x"], "笔记.txt", { type: "text/plain" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("只支持图片");
    expect(calls.length).toBe(before);
    expect(screen.getByRole("button", { name: /开始上传/ })).toBeDisabled();
  });

  it("keeps the upload button disabled until a file is chosen", async () => {
    render(<Files />);
    await act(async () => {});

    expect(screen.getByRole("button", { name: /开始上传/ })).toBeDisabled();
  });
});
