import { get, post } from "./client";

/**
 * AI 评分接口（故事评分 / 单题评分）。
 *
 * 契约来源：`api/早期学习困难儿童筛查与干预系统 HTTP API.openapi.json` 的
 * `/api/ai/score`、`/api/ai/score-answer`、`/api/ai/tasks/{task_id}`、`/api/ai/rubrics`。
 *
 * 三个容易踩的点，先说在前面：
 * 1. **提交只拿任务凭据**（202 + `TaskHandle`），结果要自己轮询；任务失败**不是** HTTP 错误，
 *    而是 200 + `code: "OK"` + `data.stage === "FAILED"`，失败原因在 `data.failure`。
 * 2. **图片三形态都收**：`SERVER_FETCH`（只给编号，服务端取图，故事与单题都支持）、
 *    `INLINE_IMAGE`（内联 base64，**不带 `data:` 前缀**）、`CONFIRMED_DESCRIPTION`（教师确认说明）。
 * 3. **评分标准版本**首次可省略，服务端用当前版本；后续重试要沿用凭据里回的**实际版本**。
 */

export type BusinessType = "ASSESSMENT" | "CLASSROOM";
export type TaskKind = "TRANSCRIPTION" | "STORY_SCORING" | "ANSWER_SCORING";

/** 任务进行中的阶段；`SUCCEEDED` / `FAILED` 是终态。 */
export type TaskStage = "QUEUED" | "TRANSCRIBING" | "SCORING" | "SUCCEEDED" | "FAILED";

export type TaskFailureCode =
  | "ASR_FAILED"
  | "MODEL_TIMEOUT"
  | "MODEL_OUTPUT_INVALID"
  | "RUBRIC_UNAVAILABLE"
  | "PROCESS_RESTARTED"
  | "RESULT_EXPIRED"
  | "TASK_TIMEOUT";

export interface TaskFailure {
  code: TaskFailureCode;
  message: string;
  retryable: boolean;
}

/** 证据：必须与确认文本按偏移截取的内容完全一致（服务端定位，不采信模型给的偏移）。 */
export interface Evidence {
  source: "TRANSCRIPT";
  text: string;
  start_offset: number;
  end_offset: number;
}

export interface ScoreItem {
  item_code: string;
  item_name?: string;
  score: 0 | 1 | 2;
  max_score: 2;
  reason: string;
  evidence: Evidence[];
}

export interface ContentItem {
  content_item_id: string;
  image_file_codes: string[];
  rubric_item_code: string;
}

export interface StoryContentItemScore extends Omit<ScoreItem, "item_name"> {
  content_item_id: string;
  rubric_item_code: string;
}

export interface ProductivityStat {
  mean_c_unit_length: number | null;
  adjective_count: number | null;
  adverb_count: number | null;
  conjunction_count: number | null;
  score: 0 | 1 | 2;
  max_score: 2;
  reason: string;
  evidence: Evidence[];
  item_code: string;
}

export interface ModelMeta {
  model: string;
  prompt_version: string;
}

/** 故事评分的 `ai_score`（契约的 AIScore v2）。 */
export interface AiScore {
  schema_version: 2;
  rubric_version: string;
  summary: string | null;
  macrostructure: { dimensions: ScoreItem[]; content_items: StoryContentItemScore[] };
  microstructure: { dimensions: ScoreItem[]; productivity: ProductivityStat };
  model_meta: ModelMeta;
}

/** 单题评分的 `ai_score`；模型元数据在结果顶层，不在这里。 */
export interface QuestionAiScore {
  rubric_version: string;
  score: 0 | 1 | 2;
  max_score: 2;
  reason: string;
  evidence: Evidence[];
}

export type Attempt = "BEFORE_HINT" | "AFTER_HINT";

export interface InlineImage {
  kind: "INLINE_IMAGE";
  file_code: string;
  /** 契约只接受这三种；服务端还会验魔数。 */
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  content_base64: string;
}

export interface ImageDescription {
  kind: "CONFIRMED_DESCRIPTION";
  file_code: string;
  description: string;
  confirmed: true;
}

export interface ServerFetchedImage {
  kind: "SERVER_FETCH";
  file_code: string;
}

export type ImageContext = InlineImage | ImageDescription | ServerFetchedImage;

export interface StoryScoringRequest {
  request_id: string;
  input_revision: string;
  business_type: BusinessType;
  activity_id: string;
  rubric_version?: string;
  /** 空字符串表示"已确认无回应"，不是缺失。 */
  confirmed_text: string;
  text_confirmed: true;
  story_context: string;
  content_items: ContentItem[];
  images: ImageContext[];
}

export interface ScoringQuestion {
  question_id: string;
  text: string;
  hint: string;
}

export interface AnswerScoringRequest {
  request_id: string;
  input_revision: string;
  business_type: BusinessType;
  activity_id: string;
  rubric_version?: string;
  confirmed_text: string;
  text_confirmed: true;
  story_context: string;
  question: ScoringQuestion;
  attempt: Attempt;
  images: ImageContext[];
}

/** 202 受理后返回的任务凭据。 */
export interface TaskHandle {
  task_id: string;
  request_id: string;
  input_revision: string;
  task_kind: TaskKind;
  attempt_no: number;
  rubric_version: string | null;
  submitted_at: string;
  business_type: BusinessType;
  activity_id: string;
}

interface TaskBase extends TaskHandle {
  updated_at: string;
}

export interface PendingTask extends TaskBase {
  stage: "QUEUED" | "TRANSCRIBING" | "SCORING";
  result: null;
  failure: null;
}

export interface FailedTask extends TaskBase {
  stage: "FAILED";
  result: null;
  failure: TaskFailure;
}

export interface StorySucceededTask extends TaskBase {
  stage: "SUCCEEDED";
  result_expires_at: string;
  result: { ai_score: AiScore };
}

export interface AnswerSucceededTask extends TaskBase {
  stage: "SUCCEEDED";
  result_expires_at: string;
  result: {
    question_id: string;
    attempt: Attempt;
    ai_score: QuestionAiScore;
    model_meta: ModelMeta;
  };
}

export interface SucceededTask extends TaskBase {
  stage: "SUCCEEDED";
  result_expires_at: string;
  result: Record<string, unknown>;
}

export type AiTask = PendingTask | FailedTask | SucceededTask;

export interface RubricCatalogItem {
  item_code: string;
  item_name: string;
  task_kind: TaskKind;
  applicability: string;
}

export interface RubricCatalog {
  rubric_version: string;
  ai_score_schema_version: number;
  business_types: BusinessType[];
  items: RubricCatalogItem[];
}

/** 图片分组可选用的规则：契约里固定的五条叙事图片条目（`NARRATIVE_CONTENT_01..05`）。 */
export const CONTENT_ITEM_PREFIX = "NARRATIVE_CONTENT_";

/** 提交故事评分；202 受理，结果靠 {@link getAiTask} 轮询。 */
export function submitStoryScoring(body: StoryScoringRequest, retryAttempt = 0): Promise<TaskHandle> {
  return post<TaskHandle>("/api/ai/score", body, {
    params: { retry_attempt: retryAttempt },
    // 评分要等模型，客户端默认 15s 太短
    timeout: 120000,
  });
}

/** 提交单题评分；语义同 {@link submitStoryScoring}。 */
export function submitAnswerScoring(body: AnswerScoringRequest, retryAttempt = 0): Promise<TaskHandle> {
  return post<TaskHandle>("/api/ai/score-answer", body, {
    params: { retry_attempt: retryAttempt },
    timeout: 120000,
  });
}

/** 查询任务状态。任务失败仍是 HTTP 200，看 `stage` 与 `failure`。 */
export function getAiTask(taskId: string): Promise<AiTask> {
  return get<AiTask>(`/api/ai/tasks/${encodeURIComponent(taskId)}`);
}

/** 服务端评分标准目录：条目与可选业务类型都来自这里，前端不写死。 */
export function getRubricCatalog(): Promise<RubricCatalog> {
  return get<RubricCatalog>("/api/ai/rubrics");
}
