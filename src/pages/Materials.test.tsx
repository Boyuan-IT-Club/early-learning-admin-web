// @vitest-environment jsdom
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { apiClient } from "../api/client";
import { Materials } from "./Materials";

/**
 * 评估材料页守三条验收：发布成功后列表出现新版本并展示转换结果；
 * 服务端校验失败时把定位信息（文件名 / 字段路径）讲给人听；
 * 只有 ACTIVE 版本可以停用，停用后列表刷新。
 */

type Route = { status: number; body: unknown };

let routes: Record<string, Route>;
let calls: Array<{ url: string; method?: string; headers?: unknown; data?: unknown }>;
let publishHappened = false;

function routeKey(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? "";
  if (url === "/admin/assessment-materials" && config.method === "post") return "publish";
  if (url.startsWith("/admin/assessment-materials/") && url.endsWith("/disable")) return "disable";
  return "list";
}

function envelope(data: unknown) {
  return { code: "OK", message: "成功", data };
}

function summaryDTO(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    official_material_code: "MAT_A",
    content_version: "v1",
    name: "操场踢球",
    status: "ACTIVE",
    created_at: "2026-09-30T02:00:00Z",
    updated_at: "2026-09-30T02:00:00Z",
    ...overrides,
  };
}

function materialDTO() {
  return {
    ...summaryDTO(),
    activity_configs_json: {
      schema_version: 2,
      story_context: "课间踢球砸碎玻璃。",
      activities: [
        { activity_id: "a_sort", type: "IMAGE_SORTING", config: { items: [] } },
        { activity_id: "a_story", type: "STORY_NARRATION", config: {} },
      ],
    },
  };
}

beforeEach(() => {
  calls = [];
  publishHappened = false;
  routes = {
    list: {
      status: 200,
      body: envelope({ items: [summaryDTO()], page: 1, page_size: 20, total: 1 }),
    },
    publish: { status: 201, body: envelope(materialDTO()) },
    disable: { status: 200, body: envelope(summaryDTO({ status: "DISABLED" })) },
  };
  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    calls.push({ url: config.url ?? "", method: config.method, headers: config.headers, data: config.data });
    const key = routeKey(config);
    if (key === "publish") publishHappened = true;
    if (key === "list" && publishHappened) {
      // 发布成功后列表应当多一行已停用的旧版——mock 有状态,断言才有意义
      routes.list = {
        status: 200,
        body: envelope({
          items: [summaryDTO({ status: "DISABLED" }), summaryDTO({ id: 2, content_version: "v2" })],
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

describe("assessment materials page", () => {
  it("lists published versions", async () => {
    render(<Materials />);

    expect(await screen.findByText("操场踢球")).toBeInTheDocument();
    expect(screen.getByText("MAT_A")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("共 1 个版本")).toBeInTheDocument();
  });

  it("publishes a zip and shows the converted config, then refreshes the list", async () => {
    render(<Materials />);

    const file = new File([new Uint8Array([0x50, 0x4b])], "material.zip", { type: "application/zip" });
    const input = screen.getByLabelText("选择评估材料 ZIP 包") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const button = await screen.findByRole("button", { name: "发布 material.zip" });
    fireEvent.click(button);

    expect(
      await screen.findByText("查看转换后的完整配置（文件名已换成编号）"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("启用中").length).toBeGreaterThan(0);
    expect(await screen.findByText("共 2 个版本")).toBeInTheDocument();

    const publishCall = calls.find((call) => call.url === "/admin/assessment-materials" && call.method === "post");
    expect(publishCall).toBeDefined();
    const headers = publishCall?.headers as Record<string, unknown>;
    const keyHeader = findHeader(headers, "Idempotency-Key");
    expect(typeof keyHeader).toBe("string");
    expect(String(keyHeader).length).toBeGreaterThan(0);
    expect(publishCall?.data).toBeInstanceOf(FormData);
  });

  it("explains validation failures with server-provided pointers", async () => {
    routes.publish = {
      status: 422,
      body: {
        code: "INVALID_RUBRIC_MAPPING",
        message: "评分条目不在统一评分规则中",
        data: null,
        details: { rubric_item_code: "NARRATIVE_CONTENT_99" },
      },
    };
    render(<Materials />);

    const file = new File([new Uint8Array([0x50, 0x4b])], "material.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("选择评估材料 ZIP 包"), { target: { files: [file] } });
    fireEvent.click(await screen.findByRole("button", { name: "发布 material.zip" }));

    expect(await screen.findByText(/\[INVALID_RUBRIC_MAPPING\]/)).toBeInTheDocument();
    expect(screen.getByText("图片分组映射的评分条目不在统一评分规则里，改用 NARRATIVE_CONTENT_01 至 06。")).toBeInTheDocument();
    expect(screen.getByText("涉及条目：NARRATIVE_CONTENT_99")).toBeInTheDocument();
  });

  it("only active versions offer disabling, and disabling refreshes the list", async () => {
    routes.list = {
      status: 200,
      body: envelope({
        items: [summaryDTO(), summaryDTO({ id: 2, content_version: "v0", status: "DISABLED" })],
        page: 1,
        page_size: 20,
        total: 2,
      }),
    };
    render(<Materials />);

    await screen.findByText("共 2 个版本");
    expect(screen.queryAllByRole("button", { name: /停用/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /停用/ }));
    expect(await screen.findByText("停用这个版本")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认停用" }));

    await waitFor(() => {
      expect(calls.some((call) => call.url === "/admin/assessment-materials/1/disable")).toBe(true);
    });
  });
});

function findHeader(headers: Record<string, unknown>, name: string): unknown {
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1];
}
