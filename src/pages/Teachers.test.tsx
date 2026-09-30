// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { header, mockApi, ok, stubDialogs } from "../test/mockApi";
import { Teachers } from "./Teachers";

function teacherDTO(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    username: "zhang_li",
    status: "ACTIVE",
    license: { id: 3, code_hint: "8H3N", status: "ACTIVE", remark: "第一批" },
    device_bound: true,
    device_bound_at: "2026-09-30T02:00:00Z",
    last_refresh_at: "2026-09-30T03:00:00Z",
    created_at: "2026-09-30T02:00:00Z",
    ...overrides,
  };
}

function page(items: unknown[]) {
  return ok({ items, page: 1, page_size: 20, total: items.length });
}

beforeEach(() => {
  stubDialogs();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("教师账号", () => {
  it("列表显示设备绑定与激活码尾号，不显示任何教师资料", async () => {
    mockApi({ "GET /admin/teachers": () => page([teacherDTO()]) });
    render(<Teachers />);
    expect(await screen.findByText("zhang_li")).toBeInTheDocument();
    expect(screen.getByText("8H3N")).toBeInTheDocument();
    expect(screen.getByText(/已绑定/)).toBeInTheDocument();
  });

  it("停用必须填原因", async () => {
    const calls = mockApi({
      "GET /admin/teachers": () => page([teacherDTO()]),
      "POST /admin/teachers/7/disable": () => ok(null),
    });
    render(<Teachers />);
    fireEvent.click(await screen.findByRole("button", { name: "停用" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "确认停用" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/原因/), { target: { value: "离职" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认停用" }));
    await vi.waitFor(() =>
      expect(calls.find((call) => call.url === "/admin/teachers/7/disable")?.data).toEqual({ reason: "离职" }),
    );
  });

  it("签发恢复码：带幂等键，明文只展示一次，并提醒仍绑定设备的限制", async () => {
    const calls = mockApi({
      "GET /admin/teachers": () => page([teacherDTO()]),
      "POST /admin/teachers/7/recovery-code": () =>
        ok({ recovery_code: "Q4ZM-7TK2", expires_at: "2026-10-01T02:00:00Z" }, 201),
    });
    render(<Teachers />);
    fireEvent.click(await screen.findByRole("button", { name: "签发恢复码" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("请先「解绑设备」");
    fireEvent.click(within(dialog).getByRole("button", { name: "签发" }));
    expect(await within(dialog).findByText("Q4ZM-7TK2")).toBeInTheDocument();
    const call = calls.find((item) => item.url === "/admin/teachers/7/recovery-code");
    expect(call && header(call, "Idempotency-Key")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "完成" }));
    expect(screen.queryByText("Q4ZM-7TK2")).not.toBeInTheDocument();
  });

  it("已停用的教师显示启用按钮", async () => {
    const calls = mockApi({
      "GET /admin/teachers": () => page([teacherDTO({ status: "DISABLED" })]),
      "POST /admin/teachers/7/enable": () => ok(null),
    });
    render(<Teachers />);
    fireEvent.click(await screen.findByRole("button", { name: "启用" }));
    await vi.waitFor(() => expect(calls.some((call) => call.url === "/admin/teachers/7/enable")).toBe(true));
  });
});
