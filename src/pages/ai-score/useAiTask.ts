import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";
import { getAiTask } from "../../api/aiScore";
import type { AiTask } from "../../api/aiScore";

/**
 * AI 任务的提交-轮询-重试生命周期。
 *
 * 两条与后端语义对齐的约定:
 * - 提交只拿任务凭据(202),结果要轮询;任务失败不是 HTTP 错误——HTTP 200 + code OK +
 *   `stage: "FAILED"`,所以要按 stage 渲染,而不是等 catch。
 * - 「失败后重试」沿用同一次提交的载荷,只把 `retry_attempt` 加一(契约如此规定)。
 */

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180000;

export interface AiTaskHandle {
  task_id: string;
  rubric_version: string | null;
}

/** 一次提交的再提交方式:同一载荷、按序号重发。 */
export interface SubmissionWork {
  resubmit: (attempt: number) => Promise<AiTaskHandle>;
}

export function useAiTask() {
  const [submitting, setSubmitting] = useState(false);
  const [submitFailure, setSubmitFailure] = useState<ApiError | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [handle, setHandle] = useState<AiTaskHandle | null>(null);
  const [task, setTask] = useState<AiTask | null>(null);
  const [pollFailure, setPollFailure] = useState<ApiError | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const lastSubmission = useRef<({ attempt: number } & SubmissionWork) | null>(null);

  /** 轮询任务;到终态或超时自停。 */
  useEffect(() => {
    if (!handle) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        window.clearInterval(timer);
        setTimedOut(true);
        return;
      }
      getAiTask(handle.task_id)
        .then((state) => {
          setTask(state);
          setPollFailure(null);
          if (state.stage === "SUCCEEDED" || state.stage === "FAILED") window.clearInterval(timer);
        })
        .catch((error: unknown) => {
          // 404 TASK_NOT_FOUND 之类不再空转
          setPollFailure(error instanceof ApiError ? error : null);
          window.clearInterval(timer);
        });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [handle]);

  /** 新提交:每次都用调用方给的工作(新的 request_id / input_revision 在闭包里生成)。 */
  async function submit(work: SubmissionWork) {
    if (submitting) return;
    setLocalError(null);
    setSubmitFailure(null);
    setPollFailure(null);
    setTimedOut(false);
    setTask(null);
    setSubmitting(true);
    try {
      const taskHandle = await work.resubmit(0);
      lastSubmission.current = { ...work, attempt: 0 };
      setHandle(taskHandle);
    } catch (error) {
      if (error instanceof ApiError) setSubmitFailure(error);
      else setLocalError(error instanceof Error ? error.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  /** 失败且可重试:沿用同一载荷,只把 retry_attempt 加一。 */
  async function retry() {
    const last = lastSubmission.current;
    if (!last || submitting) return;
    setSubmitting(true);
    setSubmitFailure(null);
    setPollFailure(null);
    setTimedOut(false);
    setTask(null);
    try {
      const nextAttempt = last.attempt + 1;
      const taskHandle = await last.resubmit(nextAttempt);
      lastSubmission.current = { ...last, attempt: nextAttempt };
      setHandle(taskHandle);
    } catch (error) {
      if (error instanceof ApiError) setSubmitFailure(error);
      else setLocalError(error instanceof Error ? error.message : "重试失败");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    submitting, submitFailure, localError, setLocalError,
    handle, task, pollFailure, timedOut,
    submit, retry,
    pollTimeoutSeconds: Math.round(POLL_TIMEOUT_MS / 1000),
  };
}
