// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import { getAccessToken, setAccessToken } from "./api/auth";

/**
 * 应用壳的验收：未登录进不了后台；登录闸门放行后落在官方素材；
 * 退出登录清掉会话。页面自身的验收在各页面的测试里。
 */

vi.mock("./api/files", () => ({
  listFiles: vi.fn().mockResolvedValue({ items: [], page: 1, total: 0 }),
}));

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("应用壳", () => {
  it("未登录访问任何页面都会被弹回登录页", () => {
    window.history.replaceState({}, "", "/files");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "欢迎来到初芽" }),
    ).toBeInTheDocument();
  });

  it("登录后落在官方素材页，且导航只有真实功能", () => {
    setAccessToken("test-token");
    window.history.replaceState({}, "", "/");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "官方素材" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI 试评" })).toBeInTheDocument();
    // 演示路由已删：不存在激活码/教师账号入口
    expect(screen.queryByText("激活码管理")).not.toBeInTheDocument();
    expect(screen.queryByText("教师账号")).not.toBeInTheDocument();
  });

  it("退出登录清掉会话回到登录页", () => {
    setAccessToken("test-token");
    window.history.replaceState({}, "", "/files");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(
      screen.getByRole("heading", { name: "欢迎来到初芽" }),
    ).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it("未知路径给出 404 且能返回官方素材", () => {
    setAccessToken("test-token");
    window.history.replaceState({}, "", "/no-such-page");
    render(<App />);
    expect(screen.getByText("这片叶子飘远了")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回官方素材" })).toHaveAttribute(
      "href",
      "/files",
    );
  });
});
