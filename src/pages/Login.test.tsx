// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { getAccessToken, getAdminName } from "../api/auth";
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
      "POST /admin/auth/login": () =>
        ok({
          admin_token: "adt_abc",
          expires_at: "2026-09-30T10:00:00Z",
          admin: { id: 1, username: "root_admin", status: "ACTIVE", created_at: "2026-09-30T00:00:00Z" },
        }),
    });
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    fillAndSubmit("root_admin", "Correct-Password-1");

    await vi.waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(getAccessToken()).toBe("adt_abc");
    expect(getAdminName()).toBe("root_admin");
    expect(calls[0].data).toEqual({ username: "root_admin", password: "Correct-Password-1" });
  });

  it("账号或密码错误时提示且不写会话，并清空密码框", async () => {
    mockApi({ "POST /admin/auth/login": () => fail(401, "INVALID_CREDENTIALS", "账号密码不正确") });
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    fillAndSubmit("root_admin", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("INVALID_CREDENTIALS");
    expect(onLogin).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(screen.getByLabelText("密码")).toHaveValue("");
  });

  it("锁定时给出等待提示", async () => {
    mockApi({ "POST /admin/auth/login": () => fail(429, "RATE_LIMITED", "请求过于频繁") });
    render(<Login onLogin={vi.fn()} />);
    fillAndSubmit("root_admin", "whatever");
    expect(await screen.findByRole("alert")).toHaveTextContent("15 分钟");
  });
});
