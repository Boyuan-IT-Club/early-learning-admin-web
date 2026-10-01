// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import App from "./App";
import { getAccessToken, setAccessToken } from "./api/auth";

/**
 * 应用壳的验收：未登录进不了后台；登录后落在激活码管理；退出登录清掉会话。
 * 页面自身的验收在各页面的测试里。
 */

vi.mock("./api/files", () => ({
  listFiles: vi.fn().mockResolvedValue({ items: [], page: 1, total: 0 }),
}));
vi.mock("./api/licenses", () => ({
  listLicenses: vi.fn().mockResolvedValue({ items: [], page: 1, page_size: 20, total: 0 }),
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
    window.history.replaceState({}, "", "/licenses");
    render(<App />);
    expect(screen.getByRole("heading", { name: "欢迎来到初芽" })).toBeInTheDocument();
  });

  it("登录后落在激活码管理，导航包含账号管理与内容管理", () => {
    setAccessToken("test-token");
    render(<App />);
    expect(screen.getByRole("heading", { name: "激活码管理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "教师账号" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "管理员" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "官方素材" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI 试评" })).toBeInTheDocument();
  });

  it("退出登录清掉会话回到登录页", () => {
    setAccessToken("test-token");
    window.history.replaceState({}, "", "/files");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(screen.getByRole("heading", { name: "欢迎来到初芽" })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it("未知路径给出 404 且能返回激活码管理", () => {
    setAccessToken("test-token");
    window.history.replaceState({}, "", "/no-such-page");
    render(<App />);
    expect(screen.getByText("这片叶子飘远了")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回激活码管理" })).toHaveAttribute("href", "/licenses");
  });
});
