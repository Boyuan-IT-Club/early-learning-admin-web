import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import {
  CONTENT_ITEM_PREFIX,
  getAiTask,
  getRubricCatalog,
  submitAnswerScoring,
  submitStoryScoring,
} from "../api/aiScore";
import type {
  AiScore,
  AiTask,
  AnswerScoringRequest,
  Attempt,
  BusinessType,
  ContentItem,
  Evidence,
  ImageContext,
  QuestionAiScore,
  RubricCatalog,
  ScoreItem,
  StoryContentItemScore,
  StoryScoringRequest,
} from "../api/aiScore";
import { listFiles } from "../api/files";
import type { AdminFile } from "../api/files";
import { EmptyState, Icon, PageHeading } from "../components/ui";
import { formatFileSize } from "../utils/format";

/**
 * AI 试评页：把故事评分与单题评分各跑一遍真任务，用来验证模型行为（不是正式教学流程的一部分）。
 *
 * 三条与后端语义对齐的约定，写在最前面：
 * - 提交只拿任务凭据（202），结果要轮询；**任务失败不是 HTTP 错误**——HTTP 200 + code OK +
 *   `stage: "FAILED"`，所以要按 stage 渲染，而不是等 catch。
 * - 每次提交生成**新的** `request_id` / `input_revision`：复用会命中幂等、拿到旧任务。
 *   「失败后重试」是另一回事：沿用同一对标识 + `retry_attempt + 1`（契约如此规定）。
 * - 图片三形态都收：本机选图走 INLINE_IMAGE（浏览器里转 base64），选已上传素材走 SERVER_FETCH
 *   （只给编号，服务端取图）。故事与单题都支持这两种。
 */

/** 任务失败码 → 人能看懂的下一步；表里没有的码只显示服务端 message。 */
const FAILURE_HINTS: Record<string, string> = {
  MODEL_TIMEOUT: "模型调用超时。可点「重试」按原输入重试。",
  MODEL_OUTPUT_INVALID: "模型输出未通过校验。重试即可；仍失败请换一组材料。",
  RUBRIC_UNAVAILABLE: "评分标准版本不可用，请确认服务端的评分标准配置。",
  PROCESS_RESTARTED: "服务端重启导致本次结果丢失（任务只在内存里），请重新提交。",
  RESULT_EXPIRED: "结果已过期，请重新提交。",
  TASK_TIMEOUT: "任务排队或执行超时，可重试。",
  TASK_NOT_FOUND: "任务元数据已被清理，请用新的请求标识重新提交。",
};

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180000;
/** 与后端 `ai.llm.ecnu.max-image-bytes` 默认值一致；真实限制以服务端为准（它是权威）。 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedMime = (typeof ALLOWED_MIME)[number];

type ImageMode = "local" | "material";

interface DraftImage {
  key: string;
  mode: ImageMode;
  file: File | null;
  material: AdminFile | null;
}

interface DraftGroup {
  key: string;
  rule: string;
  images: DraftImage[];
}

interface DraftQuestion {
  question_id: string;
  text: string;
  hint: string;
}

interface LastSubmission {
  kind: "story" | "answer";
  body: StoryScoringRequest | AnswerScoringRequest;
  attempt: number;
}

function newKey(): string {
  return crypto.randomUUID();
}

function emptyImage(mode: ImageMode = "local"): DraftImage {
  return { key: newKey(), mode, file: null, material: null };
}

/**
 * 读成 base64。契约要求 `content_base64` **不含** `data:*;base64,` 前缀，所以不走 readAsDataURL。
 *
 * 分块编码：`String.fromCharCode(...bytes)` 一次性展开大数组会爆栈，按 32KB 一段拼。
 */
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/** 契约只接受 jpeg/png/webp（不认 gif，也不能用 files.ts 的 kindOfFile）。 */
function mimeOf(file: File): AllowedMime | null {
  const found = ALLOWED_MIME.find((mime) => mime === file.type);
  return found ?? null;
}

/** 把若干证据偏移合并成不重叠的区间，用来在原文里高亮。 */
function highlightRanges(text: string, evidence: Evidence[]): Array<[number, number]> {
  const ranges = evidence
    .map((item) => [item.start_offset, item.end_offset] as [number, number])
    .filter(([start, end]) => start >= 0 && end > start && end <= text.length)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

function HighlightedText({ text, evidence }: { text: string; evidence: Evidence[] }) {
  const ranges = highlightRanges(text, evidence);
  if (ranges.length === 0) {
    return <span>{text}</span>;
  }
  const parts: Array<string | { mark: string }> = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push({ mark: text.slice(start, end) });
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return (
    <span>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : (
          <mark key={index} className="evidence-mark">
            {part.mark}
          </mark>
        ),
      )}
    </span>
  );
}

/** 一条证据：引文 + 偏移（服务端定位的结果，客户端只展示）。 */
function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) {
    return <p className="muted">没有引用原文片段（服务端允许空证据）。</p>;
  }
  return (
    <ul className="evidence-list">
      {evidence.map((item, index) => (
        <li key={index}>
          「{item.text}」<span className="muted">[{item.start_offset}, {item.end_offset})</span>
        </li>
      ))}
    </ul>
  );
}

function ScoreRow({ item, confirmedText }: { item: ScoreItem; confirmedText: string }) {
  return (
    <tr>
      <td>
        <span className="code-text">{item.item_code}</span>
        {item.item_name ? <div className="muted">{item.item_name}</div> : null}
      </td>
      <td className="numeric">{item.score} / {item.max_score}</td>
      <td>
        {item.reason}
        <EvidenceList evidence={item.evidence} />
        <details>
          <summary className="muted">在原话里的位置</summary>
          <p className="evidence-quote">
            <HighlightedText text={confirmedText} evidence={item.evidence} />
          </p>
        </details>
      </td>
    </tr>
  );
}

export function AiScore() {
  const [tab, setTab] = useState<"story" | "answer">("story");
  const [catalog, setCatalog] = useState<RubricCatalog | null>(null);
  const [materials, setMaterials] = useState<AdminFile[]>([]);
  const [loadFailure, setLoadFailure] = useState<ApiError | null>(null);

  // 两个标签共用的输入
  const [storyContext, setStoryContext] = useState("");
  const [confirmedText, setConfirmedText] = useState("");
  const [noResponse, setNoResponse] = useState(false);
  const [teacherConfirmed, setTeacherConfirmed] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>("ASSESSMENT");
  const [activityId, setActivityId] = useState("DEMO-001");
  const [rubricVersion, setRubricVersion] = useState("");

  // 故事标签
  const [groups, setGroups] = useState<DraftGroup[]>([
    { key: newKey(), rule: `${CONTENT_ITEM_PREFIX}01`, images: [emptyImage()] },
  ]);

  // 单题标签
  const [question, setQuestion] = useState<DraftQuestion>({ question_id: "Q1", text: "", hint: "" });
  const [attempt, setAttempt] = useState<Attempt>("BEFORE_HINT");
  const [answerImages, setAnswerImages] = useState<DraftImage[]>([emptyImage()]);

  // 提交与轮询
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitFailure, setSubmitFailure] = useState<ApiError | null>(null);
  const [handle, setHandle] = useState<{ task_id: string; rubric_version: string | null } | null>(null);
  const [task, setTask] = useState<AiTask | null>(null);
  const [pollFailure, setPollFailure] = useState<ApiError | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const lastSubmission = useRef<LastSubmission | null>(null);

  /** 目录与可选素材：进页面取一次；素材是"按编号取图"模式的下拉来源。 */
  useEffect(() => {
    let cancelled = false;
    getRubricCatalog()
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setLoadFailure(null);
        if (data.business_types.length > 0) setBusinessType(data.business_types[0]);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCatalog(null);
        setLoadFailure(error instanceof ApiError ? error : null);
      });
    listFiles({ file_kind: "IMAGE", status: "READY", page_size: 50 })
      .then((page) => {
        if (!cancelled) setMaterials(page.items);
      })
      .catch(() => {
        // 素材取不到只影响"按编号取图"这一种输入方式，不影响本机选图；静默降级为「暂无可选素材」
        if (!cancelled) setMaterials([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 轮询任务；到终态或超时自停。 */
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

  const contentItemRules = (catalog?.items ?? []).filter((item) =>
    item.item_code.startsWith(CONTENT_ITEM_PREFIX),
  );

  /** 一张草稿 → 一个 ImageContext。编号由调用方给定：素材用它自己的编号，内联的自造一个。 */
  async function toImageContext(draft: DraftImage, fileCode: string, where: string): Promise<ImageContext> {
    if (draft.mode === "material") {
      if (!draft.material) throw new Error(`${where}：还没选素材`);
      return { kind: "SERVER_FETCH", file_code: draft.material.file_code };
    }
    if (!draft.file) throw new Error(`${where}：还没选图片文件`);
    const mime = mimeOf(draft.file);
    if (!mime) throw new Error(`${where}：只支持 JPEG / PNG / WebP（服务端还会再验魔数）`);
    if (draft.file.size === 0 || draft.file.size > MAX_IMAGE_BYTES) {
      throw new Error(`${where}：单张图片不能超过 ${formatFileSize(MAX_IMAGE_BYTES)}`);
    }
    return { kind: "INLINE_IMAGE", file_code: fileCode, mime_type: mime, content_base64: await toBase64(draft.file) };
  }

  /**
   * 分组草稿 → 契约的 images[] 与 content_items[]。
   *
   * 一趟算出来：`content_items[].image_file_codes` 里的每个编号都必须在 images[] 里出现，
   * 分两处各算一遍迟早对不上。
   */
  async function buildStoryPayload(): Promise<{ images: ImageContext[]; contentItems: ContentItem[] }> {
    const images: ImageContext[] = [];
    const contentItems: ContentItem[] = [];
    for (const [groupIndex, group] of groups.entries()) {
      const fileCodes: string[] = [];
      for (const [imageIndex, draft] of group.images.entries()) {
        const where = `分组 G${groupIndex + 1} 的第 ${imageIndex + 1} 张图`;
        const fileCode = draft.mode === "material" && draft.material ? draft.material.file_code : `INLINE_${groupIndex + 1}_${imageIndex + 1}`;
        images.push(await toImageContext(draft, fileCode, where));
        fileCodes.push(fileCode);
      }
      contentItems.push({
        content_item_id: `G${groupIndex + 1}`,
        image_file_codes: fileCodes,
        rubric_item_code: group.rule,
      });
    }
    return { images, contentItems };
  }

  async function submitStory() {
    const { images, contentItems } = await buildStoryPayload();
    const body: StoryScoringRequest = {
      request_id: newKey(),
      input_revision: newKey(),
      business_type: businessType,
      activity_id: activityId,
      confirmed_text: noResponse ? "" : confirmedText,
      text_confirmed: true,
      story_context: storyContext,
      content_items: contentItems,
      images,
    };
    if (rubricVersion.trim()) body.rubric_version = rubricVersion.trim();
    const taskHandle = await submitStoryScoring(body, 0);
    lastSubmission.current = { kind: "story", body, attempt: 0 };
    setHandle(taskHandle);
  }

  async function submitAnswer() {
    const images: ImageContext[] = [];
    for (const [index, draft] of answerImages.entries()) {
      images.push(await toImageContext(draft, `INLINE_${index + 1}`, `第 ${index + 1} 张图`));
    }
    const body: AnswerScoringRequest = {
      request_id: newKey(),
      input_revision: newKey(),
      business_type: businessType,
      activity_id: activityId,
      confirmed_text: noResponse ? "" : confirmedText,
      text_confirmed: true,
      story_context: storyContext,
      question: { ...question },
      attempt,
      images,
    };
    if (rubricVersion.trim()) body.rubric_version = rubricVersion.trim();
    const taskHandle = await submitAnswerScoring(body, 0);
    lastSubmission.current = { kind: "answer", body, attempt: 0 };
    setHandle(taskHandle);
  }

  function validate(): string | null {
    if (!teacherConfirmed) return "请先勾选「教师已确认」——契约里 text_confirmed 只能是 true。";
    if (storyContext.trim() === "") return "故事依据不能为空。";
    if (!noResponse && confirmedText.trim() === "") {
      return "儿童原话为空时，请勾选「确认无回应」，或填写原话。";
    }
    if (tab === "story") {
      if (groups.length === 0) return "至少需要一个图片分组。";
      if (groups.some((group) => group.images.length === 0)) return "每个图片分组至少要有一张图片。";
    } else {
      if (question.text.trim() === "") return "题目不能为空。";
      if (answerImages.length === 0) return "至少要有一张图片（单题评分也允许为空数组，这里先要求给出）。";
    }
    return null;
  }

  async function submit() {
    if (submitting) return;
    setLocalError(null);
    const invalid = validate();
    if (invalid) {
      setLocalError(invalid);
      return;
    }
    setSubmitting(true);
    setSubmitFailure(null);
    setPollFailure(null);
    setTimedOut(false);
    setTask(null);
    try {
      if (tab === "story") await submitStory();
      else await submitAnswer();
    } catch (error) {
      if (error instanceof ApiError) setSubmitFailure(error);
      else setLocalError(error instanceof Error ? error.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  /** 失败且可重试：沿用同一对 request_id / input_revision，只把 retry_attempt 加一（契约规定）。 */
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
      const taskHandle =
        last.kind === "story"
          ? await submitStoryScoring(last.body as StoryScoringRequest, nextAttempt)
          : await submitAnswerScoring(last.body as AnswerScoringRequest, nextAttempt);
      lastSubmission.current = { ...last, attempt: nextAttempt };
      setHandle(taskHandle);
    } catch (error) {
      if (error instanceof ApiError) setSubmitFailure(error);
      else setLocalError(error instanceof Error ? error.message : "重试失败");
    } finally {
      setSubmitting(false);
    }
  }

  const running = task === null ? handle !== null : task.stage === "QUEUED" || task.stage === "SCORING" || task.stage === "TRANSCRIBING";
  const busy = submitting || running;
  const failure = submitFailure ?? pollFailure;
  const effectiveText = noResponse ? "" : confirmedText;

  function renderImageDraft(
    draft: DraftImage,
    onChange: (next: DraftImage) => void,
    onRemove: () => void,
    index: number,
  ) {
    const fileInputId = `ai-file-${draft.key}`;
    return (
      <div className="ai-image-row" key={draft.key}>
        <select
          aria-label={`第 ${index + 1} 张图片的来源`}
          value={draft.mode}
          onChange={(event) =>
            onChange({ ...draft, mode: event.target.value as ImageMode, file: null, material: null })
          }
        >
          <option value="local">本机图片（浏览器内转 base64）</option>
          <option value="material">已上传素材（按编号取图）</option>
        </select>
        {draft.mode === "local" ? (
          <>
            {/* 原生 input 直接露出来会和后台其余控件不是一套；沿用素材上传页的做法：藏起来 + 一个按钮触发 */}
            <input
              id={fileInputId}
              type="file"
              className="visually-hidden"
              tabIndex={-1}
              accept="image/jpeg,image/png,image/webp"
              aria-label={`第 ${index + 1} 张图片文件`}
              onChange={(event) => {
                onChange({ ...draft, file: event.target.files?.[0] ?? null });
                event.target.value = "";
              }}
            />
            <label className="button secondary" htmlFor={fileInputId}>
              选择图片
            </label>
            <span className="muted">{draft.file ? draft.file.name : "未选择文件"}</span>
          </>
        ) : (
          <select
            aria-label={`第 ${index + 1} 张图片素材`}
            value={draft.material?.file_code ?? ""}
            onChange={(event) =>
              onChange({
                ...draft,
                material: materials.find((item) => item.file_code === event.target.value) ?? null,
              })
            }
          >
            <option value="">
              {materials.length === 0 ? "暂无可用素材（先到「官方素材」上传）" : "选择已上传的图片"}
            </option>
            {materials.map((item) => (
              <option key={item.file_code} value={item.file_code}>
                {item.file_name}（{item.file_code}）
              </option>
            ))}
          </select>
        )}
        <button type="button" className="button text-button" disabled={busy} onClick={onRemove}>
          移除
        </button>
      </div>
    );
  }

  return (
    <>
      <PageHeading
        eyebrow="AI SCORING SANDBOX"
        title="AI 试评"
        description="提交一次真实的评分任务，看模型逐项给出的分数、理由与原文证据。任务只存在服务端内存里，不写入任何业务数据。"
      />

      {loadFailure && (
        <p className="error-message" role="alert">
          [{loadFailure.code}] 取评分标准失败：{loadFailure.message}
          {FAILURE_HINTS[loadFailure.code] ? ` ${FAILURE_HINTS[loadFailure.code]}` : ""}
        </p>
      )}

      <div className="tabs ai-tabs" aria-label="评分类型">
        <button className={tab === "story" ? "selected" : ""} disabled={busy} onClick={() => setTab("story")}>
          故事评分（18 项）
        </button>
        <button className={tab === "answer" ? "selected" : ""} disabled={busy} onClick={() => setTab("answer")}>
          单题评分（1 项）
        </button>
      </div>

      <section className="panel ai-panel">
        <h2 className="section-title">
          <span className="section-icon">
            <Icon name="clipboard" />
          </span>
          {tab === "story" ? "故事评分输入" : "单题评分输入"}
        </h2>

        <label className="form-field">
          故事依据（story_context）
          <textarea
            rows={3}
            value={storyContext}
            placeholder="与图片一致的完整故事文本"
            onChange={(event) => setStoryContext(event.target.value)}
          />
        </label>

        <label className="form-field">
          儿童原话（confirmed_text）
          <textarea
            rows={3}
            value={confirmedText}
            disabled={noResponse}
            placeholder="教师确认后的原话；勾选下面的「确认无回应」可留空"
            onChange={(event) => setConfirmedText(event.target.value)}
          />
          <small>空字符串表示"已确认无回应"，与缺失或转写失败不同。</small>
        </label>

        <label className="checkbox-field">
          <input type="checkbox" checked={noResponse} onChange={(event) => setNoResponse(event.target.checked)} />
          确认无回应（提交空原话）
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={teacherConfirmed}
            onChange={(event) => setTeacherConfirmed(event.target.checked)}
          />
          教师已确认（text_confirmed，契约里只能是 true）
        </label>

        {tab === "story" ? (
          <>
            <h3 className="section-title">图片分组（每组各自适用一条规则）</h3>
            {groups.map((group, groupIndex) => (
              <div className="ai-group" key={group.key}>
                <div className="ai-group-head">
                  <strong>分组 G{groupIndex + 1}</strong>
                  <button
                    type="button"
                    className="button text-button"
                    disabled={busy || groups.length <= 1}
                    onClick={() => setGroups(groups.filter((item) => item.key !== group.key))}
                  >
                    删除分组
                  </button>
                </div>
                <label className="form-field">
                  适用规则
                  <select
                    value={group.rule}
                    onChange={(event) =>
                      setGroups(
                        groups.map((item) =>
                          item.key === group.key ? { ...item, rule: event.target.value } : item,
                        ),
                      )
                    }
                  >
                    {(contentItemRules.length > 0
                      ? contentItemRules
                      : [
                          {
                            item_code: group.rule,
                            item_name: group.rule,
                            task_kind: "STORY_SCORING" as const,
                            applicability: "",
                          },
                        ]
                    ).map((item) => (
                      <option key={item.item_code} value={item.item_code}>
                        {item.item_code}（{item.item_name}）
                      </option>
                    ))}
                  </select>
                </label>
                {group.images.map((draft, imageIndex) =>
                  renderImageDraft(
                    draft,
                    (next) =>
                      setGroups(
                        groups.map((item) =>
                          item.key === group.key
                            ? {
                                ...item,
                                images: item.images.map((img) => (img.key === draft.key ? next : img)),
                              }
                            : item,
                        ),
                      ),
                    () =>
                      setGroups(
                        groups.map((item) =>
                          item.key === group.key
                            ? { ...item, images: item.images.filter((img) => img.key !== draft.key) }
                            : item,
                        ),
                      ),
                    imageIndex,
                  ),
                )}
                <div className="ai-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      setGroups(
                        groups.map((item) =>
                          item.key === group.key ? { ...item, images: [...item.images, emptyImage()] } : item,
                        ),
                      )
                    }
                  >
                    加一张图片
                  </button>
                </div>
              </div>
            ))}
            <div className="ai-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  setGroups([
                    ...groups,
                    { key: newKey(), rule: `${CONTENT_ITEM_PREFIX}01`, images: [emptyImage()] },
                  ])
                }
              >
                加一个分组
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="form-field">
              题号（question_id）
              <input value={question.question_id} onChange={(event) => setQuestion({ ...question, question_id: event.target.value })} />
            </label>
            <label className="form-field">
              题目（text）
              <input value={question.text} onChange={(event) => setQuestion({ ...question, text: event.target.value })} />
            </label>
            <label className="form-field">
              提示（hint）
              <input value={question.hint} onChange={(event) => setQuestion({ ...question, hint: event.target.value })} />
              <small>这道题不设提示时留空即可。</small>
            </label>
            <label className="form-field">
              作答时机（attempt）
              <select value={attempt} onChange={(event) => setAttempt(event.target.value as Attempt)}>
                <option value="BEFORE_HINT">提示前（BEFORE_HINT）</option>
                <option value="AFTER_HINT">提示后（AFTER_HINT）</option>
              </select>
            </label>
            <h3 className="section-title">图片</h3>
            {answerImages.map((draft, index) =>
              renderImageDraft(
                draft,
                (next) => setAnswerImages(answerImages.map((item) => (item.key === draft.key ? next : item))),
                () => setAnswerImages(answerImages.filter((item) => item.key !== draft.key)),
                index,
              ),
            )}
            <div className="ai-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setAnswerImages([...answerImages, emptyImage()])}
              >
                加一张图片
              </button>
            </div>
          </>
        )}

        <div className="ai-fields">
          <label className="form-field">
            业务类型
            <select value={businessType} onChange={(event) => setBusinessType(event.target.value as BusinessType)}>
              {(catalog?.business_types ?? ["ASSESSMENT", "CLASSROOM"]).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            活动编号
            <input value={activityId} onChange={(event) => setActivityId(event.target.value)} />
          </label>
          <label className="form-field">
            评分标准版本（可留空）
            <input
              value={rubricVersion}
              placeholder={catalog ? `留空 = ${catalog.rubric_version}` : "留空 = 服务端当前版本"}
              onChange={(event) => setRubricVersion(event.target.value)}
            />
          </label>
        </div>

        {localError && (
          <p className="error-message" role="alert">
            {localError}
          </p>
        )}
        {failure && (
          <p className="error-message" role="alert">
            [{failure.code}] {failure.message}
            {FAILURE_HINTS[failure.code] ? ` ${FAILURE_HINTS[failure.code]}` : ""}
          </p>
        )}

        <div className="ai-actions">
          <button type="button" className="button primary" disabled={busy} onClick={submit}>
            {submitting ? "提交中…" : running ? "评分中…" : "提交评分"}
          </button>
          {task?.stage === "FAILED" && task.failure.retryable && (
            <button type="button" className="button secondary" disabled={busy} onClick={retry}>
              按原输入重试（retry_attempt +1）
            </button>
          )}
        </div>
      </section>

      {handle && (
        <section className="panel ai-panel">
          <h2 className="section-title">
            <span className="section-icon">
              <Icon name="usage" />
            </span>
            任务
          </h2>
          <p>
            任务号 <span className="code-text">{handle.task_id}</span>
            <span className="muted">
              {" "}
              ｜实际评分标准版本：{handle.rubric_version ?? "（服务端未返回）"}
            </span>
          </p>
          {task && (
            <p>
              阶段 <span className="badge">{task.stage}</span>
              <span className="muted"> ｜第 {task.attempt_no + 1} 次提交</span>
            </p>
          )}
          {!task && !pollFailure && <p className="muted">正在轮询任务结果…</p>}
          {timedOut && (
            <p className="error-message" role="alert">
              轮询超时（{Math.round(POLL_TIMEOUT_MS / 1000)} 秒）；任务可能已结束，可刷新后重试。
            </p>
          )}
        </section>
      )}

      {task?.stage === "FAILED" && (
        <section className="panel ai-panel">
          <h2 className="section-title">任务失败</h2>
          <div className="result-box error-result" role="alert">
            <p>
              <span className="code-text">{task.failure.code}</span> ｜ 可重试：
              {task.failure.retryable ? "是" : "否"}
            </p>
            <p>{FAILURE_HINTS[task.failure.code] ?? task.failure.message}</p>
            <p className="muted">失败阶段：{String((task as unknown as { failed_stage?: string }).failed_stage ?? "—")}</p>
          </div>
        </section>
      )}

      {task?.stage === "SUCCEEDED" && tab === "story" && renderStoryResult(task, effectiveText)}

      {task?.stage === "SUCCEEDED" && tab === "answer" && renderAnswerResult(task)}
    </>
  );
}

function renderStoryResult(task: AiTask, confirmedText: string) {
  const score = (task.result as { ai_score?: AiScore }).ai_score;
  if (!score) {
    return (
      <section className="panel ai-panel">
        <EmptyState text="任务成功但没有评分结果" hint="这通常是服务端契约变化，请刷新后重试。" />
      </section>
    );
  }
  return (
    <>
      <section className="panel ai-panel">
        <h2 className="section-title">评分结果（AIScore v2）</h2>
        <p className="muted">
          模型 {score.model_meta.model}｜提示词 {score.model_meta.prompt_version}｜评分标准{" "}
          {score.rubric_version}｜结构版本 {score.schema_version}
        </p>
        {score.summary ? <p className="notice">{score.summary}</p> : null}
        <h3 className="section-title">图片分组</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>分组 / 规则</th>
                <th>分数</th>
                <th>理由与证据</th>
              </tr>
            </thead>
            <tbody>
              {score.macrostructure.content_items.map((item: StoryContentItemScore) => (
                <tr key={item.content_item_id}>
                  <td>
                    <span className="code-text">{item.content_item_id}</span>
                    <div className="muted">{item.rubric_item_code}</div>
                  </td>
                  <td className="numeric">
                    {item.score} / {item.max_score}
                  </td>
                  <td>
                    {item.reason}
                    <EvidenceList evidence={item.evidence} />
                    <details>
                      <summary className="muted">在原话里的位置</summary>
                      <p className="evidence-quote">
                        <HighlightedText text={confirmedText} evidence={item.evidence} />
                      </p>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel ai-panel">
        <h3 className="section-title">宏观结构（6 项）</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>条目</th>
                <th>分数</th>
                <th>理由与证据</th>
              </tr>
            </thead>
            <tbody>
              {score.macrostructure.dimensions.map((item) => (
                <ScoreRow key={item.item_code} item={item} confirmedText={confirmedText} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel ai-panel">
        <h3 className="section-title">微观结构（5 项）</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>条目</th>
                <th>分数</th>
                <th>理由与证据</th>
              </tr>
            </thead>
            <tbody>
              {score.microstructure.dimensions.map((item) => (
                <ScoreRow key={item.item_code} item={item} confirmedText={confirmedText} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel ai-panel">
        <h3 className="section-title">叙事产生性</h3>
        <p>
          <span className="code-text">{score.microstructure.productivity.item_code}</span>{" "}
          <strong>
            {score.microstructure.productivity.score} / {score.microstructure.productivity.max_score}
          </strong>
        </p>
        <p>{score.microstructure.productivity.reason}</p>
        <p className="muted">
          四项量化统计（平均小句长度 / 形容词 / 副词 / 连词）由服务端留空：本服务没有分词与词性工具，
          让模型去数又数不准，契约允许这几项为 null，该条目以 AI 判断的 0/1/2 分为值。
        </p>
        <EvidenceList evidence={score.microstructure.productivity.evidence} />
      </section>
    </>
  );
}

function renderAnswerResult(task: AiTask) {
  const result = task.result as
    | {
        question_id?: string;
        attempt?: string;
        ai_score?: QuestionAiScore;
        model_meta?: { model: string; prompt_version: string };
      }
    | undefined;
  const score = result?.ai_score;
  if (!score) {
    return (
      <section className="panel ai-panel">
        <EmptyState text="任务成功但没有评分结果" hint="这通常是服务端契约变化，请刷新后重试。" />
      </section>
    );
  }
  return (
    <section className="panel ai-panel">
      <h2 className="section-title">评分结果（QuestionAIScore）</h2>
      <p className="muted">
        题号 {result?.question_id ?? "—"}｜作答时机 {result?.attempt ?? "—"}｜模型{" "}
        {result?.model_meta?.model ?? "—"}｜提示词 {result?.model_meta?.prompt_version ?? "—"}｜评分标准{" "}
        {score.rubric_version}
      </p>
      <p>
        <strong>
          {score.score} / {score.max_score}
        </strong>
      </p>
      <p>{score.reason}</p>
      <EvidenceList evidence={score.evidence} />
    </section>
  );
}
