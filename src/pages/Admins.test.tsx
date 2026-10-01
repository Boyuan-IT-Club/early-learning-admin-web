// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fail, header, mockApi, ok, stubDialogs } from "../test/mockApi";
import { Admins } from "./Admins";

function adminDTO(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    username: "ops_admin",
    status: "ACTIVE",
    created_at: "2026-09-30T02:00:00.000Z",
    updated_at: "2026-09-30T02:00:00.000Z",
    ...overrides,
  };
}

function page(items: unknown[]) {
  return ok({ items, page: 1, page_size: 20, total: items.length });
}

beforeEach(() => {
  stubDialogs();
  sessionStorage.clear();
  sessionStorage.setItem("early-learning-admin-id", "1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("管理员", () => {
  it("按完整用户名查找：输入不合法时不带该条件", async () => {
    const params: unknown[] = [];
    mockApi({
      "GET /admin/accounts": (config) => {
        params.push(config.params);
        return page([adminDTO()]);
      },
    });
    render(<Admins onSessionEnded={vi.fn()} />);
    expect(await screen.findByText("ops_admin")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("按完整用户名查找"), { target: { value: "op" } });
    await vi.waitFor(() => expect(params.at(-1)).toMatchObject({ username: undefined }));
    fireEvent.change(screen.getByLabelText("按完整用户名查找"), { target: { value: "ops_admin" } });
    await vi.waitFor(() => expect(params.at(-1)).toMatchObject({ username: "ops_admin" }));
  });

  it("新建管理员带幂等键提交，原样重试沿用同一个键", async () => {
    let attempts = 0;
    const calls = mockApi({
      "GET /admin/accounts": () => page([]),
      "POST /admin/accounts": () => {
        attempts += 1;
        return attempts === 1
          ? fail(503, "DEPENDENCY_UNAVAILABLE", "依赖暂不可用")
          : ok(adminDTO({ id: 3, username: "new_admin" }), 201);
      },
    });
    render(<Admins onSessionEnded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /新建管理员/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/用户名/), { target: { value: "New_Admin" } });
    fireEvent.change(within(dialog).getByLabelText("初始密码"), { target: { value: "Pass-word-01" } });
    fireEvent.change(within(dialog).getByLabelText("再次输入"), { target: { value: "Pass-word-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }));
    await within(dialog).findByRole("alert");
    fireEvent.click(within(dialog).getByRole("button", { name: "重试" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const creates = calls.filter((call) => call.method === "POST");
    expect(creates[0].data).toEqual({ username: "New_Admin", password: "Pass-word-01" });
    expect(header(creates[1], "Idempotency-Key")).toBe(header(creates[0], "Idempotency-Key"));
  });

  it("密码不足 8 个字符或两次不一致时不能提交", () => {
    mockApi({ "GET /admin/accounts": () => page([]) });
    render(<Admins onSessionEnded={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /新建管理员/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/用户名/), { target: { value: "new_admin" } });
    fireEvent.change(within(dialog).getByLabelText("初始密码"), { target: { value: "short" } });
    fireEvent.change(within(dialog).getByLabelText("再次输入"), { target: { value: "short" } });
    expect(within(dialog).getByRole("button", { name: "创建" })).toBeDisabled();
    expect(dialog).toHaveTextContent("8–128 个字符");

    fireEvent.change(within(dialog).getByLabelText("初始密码"), { target: { value: "long-enough-1" } });
    expect(dialog).toHaveTextContent("两次输入的密码不一致");
  });

  it("修改他人密码只发 password，完成后刷新列表", async () => {
    let lists = 0;
    const calls = mockApi({
      "GET /admin/accounts": () => {
        lists += 1;
        return page([adminDTO()]);
      },
      "PATCH /admin/accounts/2": () => ok(adminDTO()),
    });
    const onSessionEnded = vi.fn();
    render(<Admins onSessionEnded={onSessionEnded} />);
    fireEvent.click(await screen.findByRole("button", { name: "改密码" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("新密码"), { target: { value: "Another-pass-1" } });
    fireEvent.change(within(dialog).getByLabelText("再次输入"), { target: { value: "Another-pass-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await vi.waitFor(() => expect(lists).toBe(2));
    expect(calls.find((call) => call.method === "PATCH")?.data).toEqual({ password: "Another-pass-1" });
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it("停用自己会提示并在成功后结束会话", async () => {
    mockApi({
      "GET /admin/accounts": () => page([adminDTO({ id: 1, username: "me_admin" })]),
      "PATCH /admin/accounts/1": () => ok(adminDTO({ id: 1, username: "me_admin", status: "DISABLED" })),
    });
    const onSessionEnded = vi.fn();
    render(<Admins onSessionEnded={onSessionEnded} />);
    expect(await screen.findByText("（当前登录）")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "停用" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("你正在停用自己");
    fireEvent.click(within(dialog).getByRole("button", { name: "确认停用" }));
    await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalledTimes(1));
  });

  it("启用已停用的管理员", async () => {
    const calls = mockApi({
      "GET /admin/accounts": () => page([adminDTO({ status: "DISABLED" })]),
      "PATCH /admin/accounts/2": () => ok(adminDTO()),
    });
    render(<Admins onSessionEnded={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "启用" }));
    await vi.waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls.find((call) => call.method === "PATCH")?.data).toEqual({ status: "ACTIVE" });
  });
});
