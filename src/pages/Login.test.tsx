// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { getAccessToken, getAdminId, getAdminName } from "../api/auth";
import { setUnauthorizedHandler } from "../api/client";
import { fail, mockApi, ok } from "../test/mockApi";
import { Login } from "./Login";

beforeEach(() => {
  sessionStorage.clear();
  setUnauthorizedHandler(() => {});
});
afterEach(() => cleanup());

function fillAndSubmit(username: string, password: string) {
  fireEvent.change(screen.getByLabelText("管理员账号"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /登录/ }));
}

describe("管理员登录", () => {
  it("登录成功写入会话并通知外层", async () => {
    const calls = mockApi({
      "POST /admin/login": () =>
        ok({
          token: "adt_abc",
          token_type: "Bearer",
          expires_at: "2026-09-30T10:00:00.000Z",
          account: {
            id: 7,
            username: "root_admin",
            status: "ACTIVE",
            created_at: "2026-09-30T00:00:00.000Z",
            updated_at: "2026-09-30T00:00:00.000Z",
          },
        }),
    });
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    fillAndSubmit("Root_Admin", "Correct-Password-1");

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(getAccessToken()).toBe("adt_abc");
    expect(getAdminName()).toBe("root_admin");
    expect(getAdminId()).toBe(7);
    expect(calls[0].data).toEqual({ username: "Root_Admin", password: "Correct-Password-1" });
  });

  it("密码原样提交，不裁剪首尾空格", async () => {
    const calls = mockApi({ "POST /admin/login": () => fail(401, "INVALID_CREDENTIALS", "账号密码不正确") });
    render(<Login onLogin={vi.fn()} />);
    fillAndSubmit("root_admin", " padded-password ");
    await screen.findByRole("alert");
    expect(calls[0].data).toEqual({ username: "root_admin", password: " padded-password " });
  });

  it("账号或密码错误时提示且不写会话，并清空密码框", async () => {
    mockApi({ "POST /admin/login": () => fail(401, "INVALID_CREDENTIALS", "账号密码不正确") });
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    fillAndSubmit("root_admin", "wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("INVALID_CREDENTIALS");
    expect(onLogin).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(screen.getByLabelText("密码")).toHaveValue("");
  });

  it("锁定时给出等待提示", async () => {
    mockApi({ "POST /admin/login": () => fail(429, "RATE_LIMITED", "请求过于频繁") });
    render(<Login onLogin={vi.fn()} />);
    fillAndSubmit("root_admin", "whatever-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("15 分钟");
  });
});
