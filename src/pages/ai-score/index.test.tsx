// @vitest-environment jsdom
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { apiClient } from "../../api/client";
import { AiScore } from "./index";

/**
 * AI 试评页守的是三件事：
 * 1. 提交时带齐的字段（字段名写错后端会 400，而页面看不出为什么）；
 * 2. 任务失败不是 HTTP 错误——200 + stage=FAILED，页面必须按 stage 渲染出失败码与下一步；
 * 3. 本地校验没过之前不发请求（图片超限、没勾确认）。
 */

type Route = { status: number; body: unknown };

let routes: Record<string, Route>;
let calls: Array<{ url: string; method?: string; params?: unknown; data?: unknown }>;

function routeKey(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? "";
  if (url === "/api/ai/rubrics") return "rubrics";
  if (url === "/admin/files") return "files";
  if (url === "/api/ai/score" && config.method === "post") return "submit";
  return "task";
}

function envelope(data: unknown, code = "OK", message = "成功") {
  return { code, message, data };
}

function itemDTO(code: string, name?: string) {
  return {
    item_code: code,
    ...(name ? { item_name: name } : {}),
    score: 2,
    max_score: 2,
    reason: `${code} 的理由`,
    evidence: [{ source: "TRANSCRIPT", text: "小狗跑过来了", start_offset: 0, end_offset: 6 }],
  };
}

function storyScoreDTO() {
  return {
    schema_version: 2,
    rubric_version: "narrative-assessment-v1",
    summary: "整体概述",
    macrostructure: {
      dimensions: [itemDTO("EVENT_SEQUENCE", "事件顺序")],
      content_items: [
        { ...itemDTO("NARRATIVE_CONTENT_01"), content_item_id: "G1", rubric_item_code: "NARRATIVE_CONTENT_01" },
      ],
    },
    microstructure: {
      dimensions: [itemDTO("VOCABULARY_DIVERSITY", "词汇丰富度")],
      productivity: {
        mean_c_unit_length: null,
        adjective_count: null,
        adverb_count: null,
        conjunction_count: null,
        score: 1,
        max_score: 2,
        reason: "叙事产生性理由",
        evidence: [],
        item_code: "NARRATIVE_PRODUCTIVITY",
      },
    },
    model_meta: { model: "ecnu-plus", prompt_version: "STORY_SCORING_PROMPT_V1" },
  };
}

function taskBase(stage: string, extra: Record<string, unknown> = {}) {
  return {
    task_id: "T1",
    request_id: "R1",
    input_revision: "V1",
    task_kind: "STORY_SCORING",
    attempt_no: 0,
    rubric_version: "narrative-assessment-v1",
    submitted_at: "2026-09-28T10:00:00Z",
    updated_at: "2026-09-28T10:00:01Z",
    business_type: "ASSESSMENT",
    activity_id: "DEMO-001",
    stage,
    ...extra,
  };
}

/** 让页面填满足够开跑的输入：故事依据 + 原话 + 勾确认 + 一张本机图片。 */
function fillStoryForm() {
  const confirmed = screen.getByLabelText(/儿童原话/);
  fireEvent.change(confirmed, { target: { value: "小狗跑过来了。" } });
  fireEvent.change(screen.getByLabelText(/故事依据/), { target: { value: "小狗与主人的故事" } });
  fireEvent.change(screen.getByLabelText("第 1 张图片文件"), {
    target: { files: [new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" })] },
  });
  fireEvent.click(screen.getByLabelText(/教师已确认/));
}

beforeEach(() => {
  calls = [];
  routes = {
    rubrics: {
      status: 200,
      body: envelope({
        rubric_version: "narrative-assessment-v1",
        ai_score_schema_version: 2,
        business_types: ["ASSESSMENT", "CLASSROOM"],
        items: [
          {
            item_code: "NARRATIVE_CONTENT_01",
            item_name: "图1",
            task_kind: "STORY_SCORING",
            applicability: "所有故事通用",
          },
        ],
      }),
    },
    files: { status: 200, body: envelope({ items: [], page: 1, page_size: 50, total: 0 }) },
    submit: {
      status: 202,
      body: envelope({
        task_id: "T1",
        request_id: "R1",
        input_revision: "V1",
        task_kind: "STORY_SCORING",
        attempt_no: 0,
        rubric_version: "narrative-assessment-v1",
        submitted_at: "2026-09-28T10:00:00Z",
        business_type: "ASSESSMENT",
        activity_id: "DEMO-001",
      }),
    },
    task: { status: 200, body: envelope(taskBase("SUCCEEDED", { result: { ai_score: storyScoreDTO() } })) },
  };
  apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    calls.push({ url: config.url ?? "", method: config.method, params: config.params, data: config.data });
    const route = routes[routeKey(config)];
    const response = {
      data: route.body,
      status: route.status,
      statusText: String(route.status),
      headers: {},
      config,
    } as AxiosResponse;
    if (route.status >= 200 && route.status < 300) return response;
    throw new AxiosError("failed", AxiosError.ERR_BAD_REQUEST, config, undefined, response);
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AI 试评页", () => {
  it("未勾选「教师已确认」时不发任何请求，并说明原因", async () => {
    render(<AiScore />);
    await screen.findByText(/故事评分输入/);

    fireEvent.click(screen.getByRole("button", { name: "提交评分" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("教师已确认");
    expect(calls.some((call) => call.url === "/api/ai/score")).toBe(false);
  });

  it("提交时带齐契约字段，且 content_base64 不含 data: 前缀", async () => {
    render(<AiScore />);
    await screen.findByText(/故事评分输入/);
    fillStoryForm();

    fireEvent.click(screen.getByRole("button", { name: "提交评分" }));

    await waitFor(() => expect(calls.some((call) => call.url === "/api/ai/score")).toBe(true));
    const submit = calls.find((call) => call.url === "/api/ai/score");
    expect(submit?.params).toEqual({ retry_attempt: 0 });
    const body = (
      typeof submit?.data === "string" ? JSON.parse(submit.data) : submit?.data
    ) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["activity_id", "business_type", "confirmed_text", "content_items", "images", "input_revision", "request_id", "story_context", "text_confirmed"].sort(),
    );
    expect(body.text_confirmed).toBe(true);
    expect(body.confirmed_text).toBe("小狗跑过来了。");
    const images = body.images as Array<Record<string, unknown>>;
    expect(images).toHaveLength(1);
    expect(images[0].kind).toBe("INLINE_IMAGE");
    expect(images[0].mime_type).toBe("image/png");
    expect(images[0].content_base64).not.toContain("data:");
    const contentItems = body.content_items as Array<Record<string, unknown>>;
    expect(contentItems[0].image_file_codes).toEqual([images[0].file_code]);
  });

  it("任务失败（HTTP 200 + stage=FAILED）时展示失败码与可重试建议", async () => {
    routes.task = {
      status: 200,
      body: envelope(
        taskBase("FAILED", {
          failed_stage: "SCORE",
          failure: { code: "MODEL_OUTPUT_INVALID", message: "任务执行失败", retryable: true },
        }),
      ),
    };
    vi.useFakeTimers();
    render(<AiScore />);
    await act(async () => {});
    fillStoryForm();

    fireEvent.click(screen.getByRole("button", { name: "提交评分" }));
    await act(async () => {});
    // 轮询间隔 2 秒：推进假时钟，让第一次查询落地（真等会让用例变慢且不稳）
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/MODEL_OUTPUT_INVALID/);
    expect(screen.getByRole("button", { name: /重试/ })).toBeInTheDocument();
  });

  it("任务成功时逐项展示分数，并在原话里高亮证据", async () => {
    vi.useFakeTimers();
    render(<AiScore />);
    await act(async () => {});
    fillStoryForm();

    fireEvent.click(screen.getByRole("button", { name: "提交评分" }));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    // 模型与版本来自服务端，页面只展示
    expect(screen.getByText(/ecnu-plus/)).toBeInTheDocument();
    expect(screen.getByText(/STORY_SCORING_PROMPT_V1/)).toBeInTheDocument();
    // 图片分组条目与分数
    expect(screen.getByText("NARRATIVE_CONTENT_01")).toBeInTheDocument();
    const groupTable = within(screen.getAllByRole("table")[0]);
    expect(groupTable.getByText("2 / 2")).toBeInTheDocument();
    // 证据既以引文列出，也在原话里被 <mark> 高亮
    expect(document.querySelector("mark.evidence-mark")).not.toBeNull();
    expect(screen.getAllByText(/小狗跑过来了/).length).toBeGreaterThan(1);
  });
});
