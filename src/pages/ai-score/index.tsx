import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { AI_FAILURE_HINTS } from "../../api/contract";
import {
  CONTENT_ITEM_PREFIX,
  getRubricCatalog,
  submitAnswerScoring,
  submitStoryScoring,
} from "../../api/aiScore";
import type {
  AnswerScoringRequest,
  Attempt,
  BusinessType,
  RubricCatalog,
  StoryScoringRequest,
} from "../../api/aiScore";
import { listFiles } from "../../api/files";
import type { AdminFile } from "../../api/files";
import { Icon, PageHeading } from "../../components/ui";
import { buildStoryPayload, toImageContext } from "./images";
import { useAiTask } from "./useAiTask";
import { ImageDraftRow } from "./ImageDraftRow";
import { StoryResult } from "./StoryResult";
import { AnswerResult } from "./AnswerResult";
import { emptyImage, newKey } from "./types";
import type { DraftGroup, DraftImage, DraftQuestion } from "./types";

/**
 * AI 试评页:把故事评分与单题评分各跑一遍真任务,用来验证模型行为(不是正式教学流程的一部分)。
 *
 * 组成:
 * - {@link useAiTask} — 提交 / 轮询 / 重试的生命周期(任务失败不是 HTTP 错误,按 stage 渲染);
 * - images.ts — 草稿到契约载荷的转换(base64、MIME 白名单、分组编号);
 * - 图片三形态都收:本机选图走 INLINE_IMAGE,选已上传素材走 SERVER_FETCH(只给编号,服务端取图);
 * - 每次提交生成新的 `request_id` / `input_revision`:复用会命中幂等、拿到旧任务;
 *   「失败后重试」是另一回事:沿用同一对标识 + `retry_attempt + 1`(契约如此规定)。
 */
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

  const aiTask = useAiTask();
  const { submitting, submitFailure, localError, setLocalError, handle, task, pollFailure, timedOut, submit, retry } = aiTask;

  /** 目录与可选素材:进页面取一次;素材是"按编号取图"模式的下拉来源。 */
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
        // 素材取不到只影响"按编号取图"这一种输入方式,不影响本机选图;静默降级为「暂无可选素材」
        if (!cancelled) setMaterials([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const contentItemRules = (catalog?.items ?? []).filter((item) =>
    item.item_code.startsWith(CONTENT_ITEM_PREFIX),
  );

  function validate(): string | null {
    if (!teacherConfirmed) return "请先勾选「教师已确认」——契约里 text_confirmed 只能是 true。";
    if (storyContext.trim() === "") return "故事依据不能为空。";
    if (!noResponse && confirmedText.trim() === "") {
      return "儿童原话为空时,请勾选「确认无回应」,或填写原话。";
    }
    if (tab === "story") {
      if (groups.length === 0) return "至少需要一个图片分组。";
      if (groups.some((group) => group.images.length === 0)) return "每个图片分组至少要有一张图片。";
    } else {
      if (question.text.trim() === "") return "题目不能为空。";
      if (answerImages.length === 0) return "至少要有一张图片(单题评分也允许为空数组,这里先要求给出)。";
    }
    return null;
  }

  async function submitAll() {
    const invalid = validate();
    if (invalid) {
      setLocalError(invalid);
      return;
    }
    // 载荷构建(base64 编码、图片校验)也可能抛错,和提交一样归入本地错误提示
    try {
      await submitPayload();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "提交失败");
    }
  }

  async function submitPayload() {
    if (tab === "story") {
      const { images, contentItems } = await buildStoryPayload(groups);
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
      await submit({ resubmit: (attemptNo) => submitStoryScoring(body, attemptNo) });
      return;
    }
    const images = [] as StoryScoringRequest["images"];
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
    await submit({ resubmit: (attemptNo) => submitAnswerScoring(body, attemptNo) });
  }

  const running =
    task === null ? handle !== null : task.stage === "QUEUED" || task.stage === "SCORING" || task.stage === "TRANSCRIBING";
  const busy = submitting || running;
  const failure = submitFailure ?? pollFailure;
  const effectiveText = noResponse ? "" : confirmedText;

  return (
    <>
      <PageHeading
        eyebrow="AI SCORING SANDBOX"
        title="AI 试评"
        description="提交一次真实的评分任务,看模型逐项给出的分数、理由与原文证据。任务只存在服务端内存里,不写入任何业务数据。"
      />

      {loadFailure && (
        <p className="error-message" role="alert">
          [{loadFailure.code}] 取评分标准失败:{loadFailure.message}
          {AI_FAILURE_HINTS[loadFailure.code] ? ` ${AI_FAILURE_HINTS[loadFailure.code]}` : ""}
        </p>
      )}

      <div className="tabs ai-tabs" aria-label="评分类型">
        <button className={tab === "story" ? "selected" : ""} disabled={busy} onClick={() => setTab("story")}>
          故事评分(18 项)
        </button>
        <button className={tab === "answer" ? "selected" : ""} disabled={busy} onClick={() => setTab("answer")}>
          单题评分(1 项)
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
          故事依据(story_context)
          <textarea
            rows={3}
            value={storyContext}
            placeholder="与图片一致的完整故事文本"
            onChange={(event) => setStoryContext(event.target.value)}
          />
        </label>

        <label className="form-field">
          儿童原话(confirmed_text)
          <textarea
            rows={3}
            value={confirmedText}
            disabled={noResponse}
            placeholder="教师确认后的原话;勾选下面的「确认无回应」可留空"
            onChange={(event) => setConfirmedText(event.target.value)}
          />
          <small>空字符串表示"已确认无回应",与缺失或转写失败不同。</small>
        </label>

        <label className="checkbox-field">
          <input type="checkbox" checked={noResponse} onChange={(event) => setNoResponse(event.target.checked)} />
          确认无回应(提交空原话)
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={teacherConfirmed}
            onChange={(event) => setTeacherConfirmed(event.target.checked)}
          />
          教师已确认(text_confirmed,契约里只能是 true)
        </label>

        {tab === "story" ? (
          <>
            <h3 className="section-title">图片分组(每组各自适用一条规则)</h3>
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
                        {item.item_code}({item.item_name})
                      </option>
                    ))}
                  </select>
                </label>
                {group.images.map((draft, imageIndex) => (
                  <ImageDraftRow
                    key={draft.key}
                    draft={draft}
                    index={imageIndex}
                    materials={materials}
                    busy={busy}
                    onChange={(next) =>
                      setGroups(
                        groups.map((item) =>
                          item.key === group.key
                            ? {
                                ...item,
                                images: item.images.map((img) => (img.key === draft.key ? next : img)),
                              }
                            : item,
                        ),
                      )
                    }
                    onRemove={() =>
                      setGroups(
                        groups.map((item) =>
                          item.key === group.key
                            ? { ...item, images: item.images.filter((img) => img.key !== draft.key) }
                            : item,
                        ),
                      )
                    }
                  />
                ))}
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
              题号(question_id)
              <input value={question.question_id} onChange={(event) => setQuestion({ ...question, question_id: event.target.value })} />
            </label>
            <label className="form-field">
              题目(text)
              <input value={question.text} onChange={(event) => setQuestion({ ...question, text: event.target.value })} />
            </label>
            <label className="form-field">
              提示(hint)
              <input value={question.hint} onChange={(event) => setQuestion({ ...question, hint: event.target.value })} />
              <small>这道题不设提示时留空即可。</small>
            </label>
            <label className="form-field">
              作答时机(attempt)
              <select value={attempt} onChange={(event) => setAttempt(event.target.value as Attempt)}>
                <option value="BEFORE_HINT">提示前(BEFORE_HINT)</option>
                <option value="AFTER_HINT">提示后(AFTER_HINT)</option>
              </select>
            </label>
            <h3 className="section-title">图片</h3>
            {answerImages.map((draft, index) => (
              <ImageDraftRow
                key={draft.key}
                draft={draft}
                index={index}
                materials={materials}
                busy={busy}
                onChange={(next) => setAnswerImages(answerImages.map((item) => (item.key === draft.key ? next : item)))}
                onRemove={() => setAnswerImages(answerImages.filter((item) => item.key !== draft.key))}
              />
            ))}
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
            评分标准版本(可留空)
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
            {AI_FAILURE_HINTS[failure.code] ? ` ${AI_FAILURE_HINTS[failure.code]}` : ""}
          </p>
        )}

        <div className="ai-actions">
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => {
              void submitAll();
            }}
          >
            {submitting ? "提交中…" : running ? "评分中…" : "提交评分"}
          </button>
          {task?.stage === "FAILED" && task.failure.retryable && (
            <button type="button" className="button secondary" disabled={busy} onClick={() => void retry()}>
              按原输入重试(retry_attempt +1)
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
              |实际评分标准版本:{handle.rubric_version ?? "(服务端未返回)"}
            </span>
          </p>
          {task && (
            <p>
              阶段 <span className="badge">{task.stage}</span>
              <span className="muted"> |第 {task.attempt_no + 1} 次提交</span>
            </p>
          )}
          {!task && !pollFailure && <p className="muted">正在轮询任务结果…</p>}
          {timedOut && (
            <p className="error-message" role="alert">
              轮询超时({aiTask.pollTimeoutSeconds} 秒);任务可能已结束,可刷新后重试。
            </p>
          )}
        </section>
      )}

      {task?.stage === "FAILED" && (
        <section className="panel ai-panel">
          <h2 className="section-title">任务失败</h2>
          <div className="result-box error-result" role="alert">
            <p>
              <span className="code-text">{task.failure.code}</span> | 可重试:
              {task.failure.retryable ? "是" : "否"}
            </p>
            <p>{AI_FAILURE_HINTS[task.failure.code] ?? task.failure.message}</p>
            <p className="muted">失败阶段:{String((task as unknown as { failed_stage?: string }).failed_stage ?? "—")}</p>
          </div>
        </section>
      )}

      {task?.stage === "SUCCEEDED" && tab === "story" && <StoryResult task={task} confirmedText={effectiveText} />}

      {task?.stage === "SUCCEEDED" && tab === "answer" && <AnswerResult task={task} />}
    </>
  );
}
