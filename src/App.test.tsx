// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import App from "./App";

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  // jsdom has no native modal implementation; real-browser checks cover the dialog.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function enter(path = "/licenses") {
  sessionStorage.setItem("early-learning-demo", "yes");
  window.history.replaceState({}, "", path);
  render(<App />);
}

describe("demo workbench", () => {
  it("protects routes, enters the demo, and clears the session on logout", () => {
    window.history.replaceState({}, "", "/teachers");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "欢迎来到初芽" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /进入演示后台/ }));
    expect(
      screen.getByRole("heading", { name: "激活码管理" }),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("early-learning-demo")).toBe("yes");
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(
      screen.getByRole("heading", { name: "欢迎来到初芽" }),
    ).toBeInTheDocument();
    expect(sessionStorage.getItem("early-learning-demo")).toBeNull();
  });

  it("generates a batch, copies it, and filters the resulting records", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    enter();
    fireEvent.click(screen.getByRole("button", { name: "生成激活码" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /生成数量/ }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成示例" }));
    fireEvent.click(screen.getByRole("button", { name: "复制全部" }));
    expect(writeText).toHaveBeenCalledWith(
      "DEMO-2026-0008\nDEMO-2026-0009\nDEMO-2026-0010",
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    expect(screen.getByText("共 10 条记录")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "搜索激活码或教师" }),
      { target: { value: "0010" } },
    );
    expect(screen.getByText("共 1 条记录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "已激活" }));
    expect(screen.getByText("没有找到匹配的记录")).toBeInTheDocument();
  });

  it("links teacher usage and supports empty and reset states", () => {
    enter("/teachers");
    const row = screen.getByText("林晓").closest("tr")!;
    fireEvent.click(within(row).getByRole("link", { name: /查看用量/ }));
    expect(screen.getByRole("combobox", { name: "教师账号" })).toHaveValue(
      "linxiao",
    );
    expect(screen.getByText("共 3 条记录")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "教师账号" }), {
      target: { value: "wangyue" },
    });
    expect(screen.getByText("暂无调用记录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));
    expect(screen.getByText("共 9 条记录")).toBeInTheDocument();
  });

  it("rejects invalid files without sending any requests", () => {
    const fetchSpy = vi.spyOn(window, "fetch");
    enter("/content/courses");
    fireEvent.change(screen.getByLabelText("选择材料文件"), {
      target: { files: [new File(["hello"], "bad.txt")] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("仅接受 ZIP 或 JSON");
    expect(screen.getByRole("button", { name: "模拟上传" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("选择材料文件"), {
      target: { files: [new File([], "empty.zip")] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("非空");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["success", "导入成功 · 演示结果"],
    ["error", "导入失败 · 演示结果"],
  ])(
    "runs the %s upload example through transfer and processing",
    async (outcome, result) => {
      vi.useFakeTimers();
      enter("/content/assessments");
      fireEvent.click(screen.getByRole("button", { name: /使用示例材料/ }));
      fireEvent.change(screen.getByRole("combobox", { name: "演示结果" }), {
        target: { value: outcome },
      });
      fireEvent.click(screen.getByRole("button", { name: "模拟上传" }));
      expect(screen.getByRole("button", { name: "选择文件" })).toBeDisabled();
      await act(async () => {
        vi.advanceTimersByTime(750);
      });
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByText("模拟后端处理中")).toBeInTheDocument();
      expect(screen.queryByText(result)).not.toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(800);
      });
      expect(screen.getByText(result)).toBeInTheDocument();
      if (outcome === "error")
        expect(
          screen.getByText("activities[2].image_file_code"),
        ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("link", { name: "字典材料" }));
      expect(
        screen.getByRole("heading", { name: "字典材料", level: 1 }),
      ).toBeInTheDocument();
      expect(screen.queryByText(result)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "模拟上传" })).toBeDisabled();
    },
  );
});
