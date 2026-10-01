// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fail, mockApi, ok, stubDialogs } from "../test/mockApi";
import { Teachers } from "./Teachers";

function teacherDTO(overrides: Record<string, unknown> = {}) {
  return { id: 5, username: "zhang_li", status: 1, created_at: "2026-09-30T02:00:00.000Z", ...overrides };
}

function page(items: unknown[]) {
  return ok({ items, page: 1, page_size: 20, total: items.length });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Teachers />
    </MemoryRouter>,
  );
}

beforeEach(() => stubDialogs());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("教师账号", () => {
  it("列表展示用户名与状态，搜索与状态筛选按契约参数发出", async () => {
    const params: unknown[] = [];
    mockApi({
      "GET /admin/users": (config) => {
        params.push(config.params);
        return page([teacherDTO(), teacherDTO({ id: 6, username: "wang_fang", status: 0 })]);
      },
    });
    renderPage();
    expect(await screen.findByText("zhang_li")).toBeInTheDocument();
    expect(screen.getByText("已停用", { selector: ".badge" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "激活码" })[0]).toHaveAttribute("href", "/licenses?user_id=5");

    fireEvent.click(screen.getByRole("button", { name: "已停用" }));
    fireEvent.change(screen.getByLabelText("搜索用户名"), { target: { value: " Zhang " } });
    await vi.waitFor(() =>
      expect(params.at(-1)).toEqual({ page: 1, page_size: 20, status: 0, username: "Zhang" }),
    );
  });

  it("停用需确认，提交 status=0", async () => {
    const calls = mockApi({
      "GET /admin/users": () => page([teacherDTO()]),
      "PATCH /admin/users/5/status": () => ok(teacherDTO({ status: 0 })),
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "停用" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("平板本地登录不受影响");
    fireEvent.click(within(dialog).getByRole("button", { name: "确认停用" }));
    await vi.waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls.find((call) => call.method === "PATCH")?.data).toEqual({ status: 0 });
  });

  it("激活码已撤销时启用失败并说明原因", async () => {
    mockApi({
      "GET /admin/users": () => page([teacherDTO({ status: 0 })]),
      "PATCH /admin/users/5/status": () => fail(409, "LICENSE_REVOKED", "激活码已被撤销"),
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "启用" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("LICENSE_REVOKED");
    expect(alert).toHaveTextContent("不能再启用");
  });
});
