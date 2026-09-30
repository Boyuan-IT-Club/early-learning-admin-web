// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fail, header, mockApi, ok, stubDialogs } from "../test/mockApi";
import { Licenses } from "./Licenses";

/**
 * 激活码页的验收：列表只显示尾号；生成结果的明文只展示一次且重试沿用同一个幂等键；
 * 撤销必须填原因、并把服务端给出的问题 id 讲清楚。
 */

function licenseDTO(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    code_hint: "8H3N",
    status: "UNUSED",
    remark: "第一批",
    user_id: null,
    username: null,
    created_at: "2026-09-30T02:00:00Z",
    activated_at: null,
    revoked_at: null,
    revoke_reason: null,
    ...overrides,
  };
}

function page(items: unknown[]) {
  return ok({ items, page: 1, page_size: 20, total: items.length, counts: { UNUSED: 3, ACTIVE: 1, REVOKED: 0 } });
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
  it("列表只显示尾号与绑定教师，顶部给出各状态总数", async () => {
    mockApi({
      "GET /admin/licenses": () =>
        page([licenseDTO(), licenseDTO({ id: 2, code_hint: "Q7ZK", status: "ACTIVE", username: "zhang_li" })]),
    });
    render(<Licenses />);
    expect(await screen.findByText("****-****-****-8H3N")).toBeInTheDocument();
    expect(screen.getByText("zhang_li")).toBeInTheDocument();
    expect(screen.getByText("共 2 枚激活码")).toBeInTheDocument();
    expect(screen.getByText("待使用", { selector: ".stat-card span" }).parentElement).toHaveTextContent("3");
  });

  it("生成后明文只展示一次；失败重试沿用同一个幂等键", async () => {
    let attempts = 0;
    const calls = mockApi({
      "GET /admin/licenses": () => page([]),
      "POST /admin/licenses/batch": () => {
        attempts += 1;
        if (attempts === 1) return fail(503, "DEPENDENCY_UNAVAILABLE", "依赖暂不可用");
        return ok(
          {
            licenses: [
              { id: 9, activation_code: "7K2Q-M9XD-4TPA-8H3N", code_hint: "8H3N", status: "UNUSED", remark: null, created_at: "2026-09-30T02:00:00Z" },
            ],
          },
          201,
        );
      },
    });
    render(<Licenses />);
    fireEvent.click(screen.getByRole("button", { name: /生成激活码/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/生成数量/), { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "生成 1 枚" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("DEPENDENCY_UNAVAILABLE");

    fireEvent.click(within(dialog).getByRole("button", { name: "重试" }));
    expect(await within(dialog).findByText("7K2Q-M9XD-4TPA-8H3N")).toBeInTheDocument();

    const batchCalls = calls.filter((call) => call.url === "/admin/licenses/batch");
    expect(batchCalls).toHaveLength(2);
    expect(header(batchCalls[0], "Idempotency-Key")).toBeTruthy();
    expect(header(batchCalls[1], "Idempotency-Key")).toBe(header(batchCalls[0], "Idempotency-Key"));

    fireEvent.click(within(dialog).getByRole("button", { name: "完成" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.queryByText("7K2Q-M9XD-4TPA-8H3N")).not.toBeInTheDocument();
  });

  it("撤销必须填原因，并提示已激活码的后果", async () => {
    const calls = mockApi({
      "GET /admin/licenses": () => page([licenseDTO({ status: "ACTIVE", username: "zhang_li" })]),
      "POST /admin/licenses/revoke": () => ok(null),
    });
    render(<Licenses />);
    fireEvent.click(await screen.findByLabelText("选择尾号 8H3N"));
    fireEvent.click(screen.getByRole("button", { name: /撤销所选/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("永久终止");
    const confirm = within(dialog).getByRole("button", { name: "确认撤销" });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/撤销原因/), { target: { value: "纸条遗失" } });
    fireEvent.click(confirm);
    await vi.waitFor(() => expect(calls.some((call) => call.url === "/admin/licenses/revoke")).toBe(true));
    const revoke = calls.find((call) => call.url === "/admin/licenses/revoke");
    expect(revoke?.data).toEqual({ license_ids: [1], reason: "纸条遗失" });
  });

  it("撤销失败时列出服务端给出的问题 id", async () => {
    mockApi({
      "GET /admin/licenses": () => page([licenseDTO()]),
      "POST /admin/licenses/revoke": () => fail(409, "LICENSE_UNAVAILABLE", "激活码不可用", { license_ids: [1] }),
    });
    render(<Licenses />);
    fireEvent.click(await screen.findByLabelText("选择尾号 8H3N"));
    fireEvent.click(screen.getByRole("button", { name: /撤销所选/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/撤销原因/), { target: { value: "重复" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认撤销" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("涉及激活码 id：1");
  });
});
