// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fail, header, mockApi, ok, stubDialogs } from "../test/mockApi";
import { Licenses } from "./Licenses";

/**
 * 激活码页的验收：列表按契约字段展示；生成结果的原码只展示一次且原样重试沿用同一个幂等键；
 * 结果过期时给出这批码的 id；撤销逐个进行并讲清已激活码的后果。
 */

function licenseDTO(overrides: Record<string, unknown> = {}) {
  return { id: 1, user_id: null, status: "UNUSED", activated_at: null, ...overrides };
}

function page(items: unknown[]) {
  return ok({ items, page: 1, page_size: 20, total: items.length });
}

function renderPage(path = "/licenses") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Licenses />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  stubDialogs();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("激活码管理", () => {
  it("列表展示状态与绑定教师，筛选条件按契约参数发出", async () => {
    const params: unknown[] = [];
    mockApi({
      "GET /admin/licenses": (config) => {
        params.push(config.params);
        return page([
          licenseDTO(),
          licenseDTO({ id: 2, status: "ACTIVE", user_id: 42, activated_at: "2026-09-30T02:00:00.000Z" }),
        ]);
      },
    });
    renderPage();
    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("暂未绑定")).toBeInTheDocument();
    expect(screen.getByText("共 2 枚激活码")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "已激活" }));
    await vi.waitFor(() =>
      expect(params.at(-1)).toEqual({ page: 1, page_size: 20, status: "ACTIVE", user_id: undefined }),
    );
  });

  it("从教师页带 user_id 进来时直接按该教师筛选", async () => {
    const params: unknown[] = [];
    mockApi({
      "GET /admin/licenses": (config) => {
        params.push(config.params);
        return page([]);
      },
    });
    renderPage("/licenses?user_id=42");
    await vi.waitFor(() => expect(params[0]).toMatchObject({ user_id: 42 }));
    expect(screen.getByLabelText("按绑定教师 ID 筛选")).toHaveValue("42");
  });

  it("生成后原码只展示一次；失败原样重试沿用同一个幂等键", async () => {
    let attempts = 0;
    const calls = mockApi({
      "GET /admin/licenses": () => page([]),
      "POST /admin/licenses": () => {
        attempts += 1;
        if (attempts === 1) return fail(503, "DEPENDENCY_UNAVAILABLE", "依赖暂不可用");
        return ok({ items: [{ id: 9, activation_code: "7K2QM9XD4TPA8H3N", status: "UNUSED" }] }, 201);
      },
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /生成激活码/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/生成数量/), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "生成 1 枚" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("DEPENDENCY_UNAVAILABLE");

    fireEvent.click(within(dialog).getByRole("button", { name: "重试" }));
    expect(await within(dialog).findByText("7K2QM9XD4TPA8H3N")).toBeInTheDocument();

    const createCalls = calls.filter((call) => call.method === "POST" && call.url === "/admin/licenses");
    expect(createCalls).toHaveLength(2);
    expect(createCalls[0].data).toEqual({ count: 1 });
    expect(header(createCalls[0], "Idempotency-Key")).toBeTruthy();
    expect(header(createCalls[1], "Idempotency-Key")).toBe(header(createCalls[0], "Idempotency-Key"));

    fireEvent.click(within(dialog).getByRole("button", { name: "完成" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.queryByText("7K2QM9XD4TPA8H3N")).not.toBeInTheDocument();
  });

  it("改了数量再提交就换一个新的幂等键", async () => {
    const calls = mockApi({
      "GET /admin/licenses": () => page([]),
      "POST /admin/licenses": () => fail(503, "DEPENDENCY_UNAVAILABLE", "依赖暂不可用"),
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /生成激活码/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "生成 10 枚" }));
    await within(dialog).findByRole("alert");
    fireEvent.change(within(dialog).getByLabelText(/生成数量/), { target: { value: "5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "重试" }));
    await vi.waitFor(() => expect(calls.filter((call) => call.method === "POST")).toHaveLength(2));

    const [first, second] = calls.filter((call) => call.method === "POST");
    expect(header(second, "Idempotency-Key")).not.toBe(header(first, "Idempotency-Key"));
  });

  it("数量超出 1–100 时不能提交", () => {
    mockApi({ "GET /admin/licenses": () => page([]) });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /生成激活码/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/生成数量/), { target: { value: "101" } });
    expect(within(dialog).getByRole("button", { name: /生成/ })).toBeDisabled();
  });

  it("结果过期时列出这批码的 id，提示逐个撤销", async () => {
    mockApi({
      "GET /admin/licenses": () => page([]),
      "POST /admin/licenses": () =>
        fail(409, "SENSITIVE_RESULT_EXPIRED", "敏感结果已失效", { license_ids: [9, 10] }),
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /生成激活码/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "生成 10 枚" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("涉及激活码 id：9、10");
    expect(alert).toHaveTextContent("逐个撤销");
  });

  it("撤销已激活的码前提示会停用教师，确认后调用单个撤销接口", async () => {
    const calls = mockApi({
      "GET /admin/licenses": () => page([licenseDTO({ id: 3, status: "ACTIVE", user_id: 42 })]),
      "POST /admin/licenses/3/revoke": () => ok(licenseDTO({ id: 3, status: "REVOKED", user_id: 42 })),
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "撤销" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("教师 #42");

    fireEvent.click(within(dialog).getByRole("button", { name: "确认撤销" }));
    await vi.waitFor(() => expect(calls.some((call) => call.url === "/admin/licenses/3/revoke")).toBe(true));
    expect(calls.find((call) => call.url === "/admin/licenses/3/revoke")?.data).toBeUndefined();
  });

  it("已撤销的码不再提供撤销按钮", async () => {
    mockApi({ "GET /admin/licenses": () => page([licenseDTO({ status: "REVOKED" })]) });
    renderPage();
    expect(await screen.findByText("已撤销", { selector: ".badge" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "撤销" })).not.toBeInTheDocument();
  });
});
