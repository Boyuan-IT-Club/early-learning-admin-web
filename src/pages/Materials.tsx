import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { disableMaterial, listMaterials, publishMaterial } from "../api/materials";
import type { AssessmentMaterial, ContentStatus, MaterialSummary } from "../api/materials";
import { Badge, EmptyState, Icon, Modal, PageHeading, SearchInput } from "../components/ui";
import { formatUtcToLocal } from "../utils/format";

/**
 * 评估材料页：ZIP 整包发布成内容版本，列表与停用。
 *
 * 发布是同步的：服务端解包、校验、上传媒体并提交版本后才返回 201，
 * 所以这里的「上传中」等价于「发布中」，失败原因直接来自服务端校验。
 */

const PAGE_SIZE = 20;

/** 发布失败的常见错误码给一句人话定位；其余直接展示服务端 message。 */
const PUBLISH_HINTS: Record<string, string> = {
  CONTENT_VERSION_EXISTS: "这个编号下该内容版本已经发布过；请修改 config.json 里的 content_version。",
  INVALID_REQUEST: "包结构或 config.json 不合法；需要平铺根目录、恰好一个 config.json。",
  INVALID_ACTIVITY_CONFIG: "活动配置不满足契约，定位见错误详情里的字段路径。",
  STORY_NARRATION_REQUIRED: "缺少故事叙述活动；一份材料必须恰好包含一项 STORY_NARRATION。",
  INVALID_RESOURCE_REFERENCE: "配置引用的文件不在包内；引用必须与包内文件名完全一致（区分大小写）。",
  INVALID_RUBRIC_MAPPING: "图片分组映射的评分条目不在统一评分规则里，改用 NARRATIVE_CONTENT_01 至 06。",
  INVALID_GRAMMAR_REFERENCE: "题目引用的语法编号不存在。",
  UNSUPPORTED_MEDIA_TYPE: "包内媒体格式不支持：图片收 JPEG/PNG/WebP，录音收 m4a/mp3/wav。",
  PAYLOAD_TOO_LARGE: "压缩包超出部署上限。",
};

const DELETE_HINTS: Record<string, string> = {
  RESOURCE_NOT_FOUND: "这一版已经不在了，刷新列表即可。",
};

export function Materials() {
  const [keyword, setKeyword] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<ContentStatus | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: MaterialSummary[]; total: number } | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${page}|${keyword.trim()}|${code.trim()}|${status}|${reloadToken}`;
  const loading = loadedKey !== requestKey;

  const [zip, setZip] = useState<File | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishFailure, setPublishFailure] = useState<ApiError | null>(null);
  const [published, setPublished] = useState<AssessmentMaterial | null>(null);

  const [pendingDisable, setPendingDisable] = useState<MaterialSummary | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [disableFailure, setDisableFailure] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMaterials({
      page,
      page_size: PAGE_SIZE,
      keyword: keyword.trim() || undefined,
      official_material_code: code.trim() || undefined,
      status: status || undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setFailure(null);
        setLoadedKey(requestKey);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFailure(error instanceof ApiError ? error : null);
        setData(null);
        setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, page, keyword, code, status]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pickZip(file: File | null) {
    setZip(file);
    setPublished(null);
    setPublishFailure(null);
    // 换包就是一次新操作，换键；重试沿用当前键（在 publish 里不再生成）
    setIdempotencyKey(file ? crypto.randomUUID() : "");
  }

  async function publish() {
    if (!zip || publishing) return;
    setPublishing(true);
    setPublishFailure(null);
    setPublished(null);
    try {
      const material = await publishMaterial(zip, idempotencyKey);
      setPublished(material);
      setReloadToken((value) => value + 1);
    } catch (error) {
      setPublishFailure(error instanceof ApiError ? error : null);
    } finally {
      setPublishing(false);
    }
  }

  async function confirmDisable() {
    if (!pendingDisable) return;
    setDisabling(true);
    setDisableFailure(null);
    try {
      await disableMaterial(pendingDisable.id);
      setPendingDisable(null);
      setReloadToken((value) => value + 1);
    } catch (error) {
      setDisableFailure(error instanceof ApiError ? error : null);
    } finally {
      setDisabling(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="ASSESSMENT MATERIALS"
        title="评估材料"
        description="把 config.json 与图片、音频打包成 ZIP 发布成版本；平板端按版本目录同步。"
      />
      {failure && (
        <p className="error-message" role="alert">
          [{failure.code}] {failure.message}
        </p>
      )}

      <div className="content-grid">
        <section className="panel upload-panel">
          <div className="section-title">
            <span className="section-icon">
              <Icon name="upload" />
            </span>
            <div>
              <h2>发布新版本</h2>
              <p>一个 ZIP、一次提交；服务端校验并转换文件编号后立即返回发布结果。</p>
            </div>
          </div>
          <div className="material-publish">
            <input
              type="file"
              accept=".zip,application/zip"
              aria-label="选择评估材料 ZIP 包"
              onChange={(event) => pickZip(event.target.files?.[0] ?? null)}
            />
            <button
              className="button primary"
              disabled={!zip || publishing}
              onClick={publish}
            >
              {publishing ? "发布中…" : zip ? `发布 ${zip.name}` : "选择 ZIP 后发布"}
            </button>
          </div>
          {publishFailure && (
            <div className="error-message" role="alert">
              <p>
                [{publishFailure.code}] {publishFailure.message}
              </p>
              {PUBLISH_HINTS[publishFailure.code] && <p>{PUBLISH_HINTS[publishFailure.code]}</p>}
              {publishFailure.details?.file_name && (
                <p>涉及文件：{publishFailure.details.file_name}</p>
              )}
              {publishFailure.details?.rubric_item_code && (
                <p>涉及条目：{publishFailure.details.rubric_item_code}</p>
              )}
              {publishFailure.details?.field_path && (
                <p>定位：config.json{publishFailure.details.field_path}</p>
              )}
            </div>
          )}
          {published && (
            <div className="material-result">
              <p>
                <strong>{published.name}</strong> 已发布为{" "}
                <Badge status={published.status} />
              </p>
              <p className="muted">
                {published.official_material_code} · {published.content_version} · 故事活动 1 项、
                共 {published.activity_configs_json.activities.length} 个活动
              </p>
              <details>
                <summary className="muted">查看转换后的完整配置（文件名已换成编号）</summary>
                <pre>{JSON.stringify(published.activity_configs_json, null, 2)}</pre>
              </details>
            </div>
          )}
        </section>
        <aside className="resource-guide">
          <div className="guide-illustration" aria-hidden="true">
            <span>M</span>
            <Icon name="book" size={45} />
            <i />
          </div>
          <span className="eyebrow">A SMALL GUIDE</span>
          <h2>
            整包发布，
            <br />
            版本可追溯。
          </h2>
          <ol>
            <li>
              <strong>打包</strong>
              <p>根目录平铺：一个 config.json 加若干图片与音频，文件名不重复。</p>
            </li>
            <li>
              <strong>发布</strong>
              <p>服务端校验配置与媒体，把文件名转换成编号并冻结配置。</p>
            </li>
            <li>
              <strong>同步</strong>
              <p>同编号新版本发布后，旧版本自动停用；历史评估仍可读旧版。</p>
            </li>
          </ol>
        </aside>
      </div>

      <section className="panel resource-list">
        <div className="panel-toolbar">
          <SearchInput
            value={keyword}
            onChange={(value) => {
              setKeyword(value);
              setPage(1);
            }}
            placeholder="搜索材料名称"
          />
          <input
            aria-label="按稳定编号精确筛选"
            placeholder="稳定编号精确筛选"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="版本状态"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ContentStatus | "");
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            <option value="ACTIVE">启用中</option>
            <option value="DISABLED">已停用</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>材料</th>
                <th>版本</th>
                <th>状态</th>
                <th className="muted">发布时间</th>
                <th className="muted">更新时间</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="resource-name">
                      <strong>{row.name}</strong>
                      <small>{row.official_material_code}</small>
                    </div>
                  </td>
                  <td className="code-text">{row.content_version}</td>
                  <td>
                    <Badge status={row.status} />
                  </td>
                  <td className="muted numeric">{formatUtcToLocal(row.created_at)}</td>
                  <td className="muted numeric">{formatUtcToLocal(row.updated_at)}</td>
                  <td className="align-right">
                    {row.status === "ACTIVE" ? (
                      <button
                        className="text-button"
                        onClick={() => {
                          setDisableFailure(null);
                          setPendingDisable(row);
                        }}
                      >
                        停用
                        <Icon name="close" size={15} />
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !failure && items.length === 0 && (
          <EmptyState text="还没有评估材料版本" hint="打包一个 ZIP，在上方发布第一版。" />
        )}
        <div className="table-footer">
          <span>{loading ? "加载中…" : `共 ${total} 个版本`}</span>
          <span className="page-controls">
            <button
              className="text-button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              上一页
            </button>
            <span className="muted">
              第 {page} / {lastPage} 页
            </span>
            <button
              className="text-button"
              disabled={page >= lastPage || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </button>
          </span>
        </div>
      </section>

      {pendingDisable && (
        <Modal title="停用这个版本" onClose={() => setPendingDisable(null)}>
          <p>
            <strong>{pendingDisable.name}</strong>（{pendingDisable.official_material_code}{" "}
            {pendingDisable.content_version}）停用后不能再被新下载选择，历史评估与课堂不受影响。
          </p>
          {disableFailure && (
            <p className="error-message" role="alert">
              [{disableFailure.code}] {disableFailure.message}
              {DELETE_HINTS[disableFailure.code] && ` ${DELETE_HINTS[disableFailure.code]}`}
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" disabled={disabling} onClick={() => setPendingDisable(null)}>
              取消
            </button>
            <button className="button primary" disabled={disabling} onClick={confirmDisable}>
              {disabling ? "处理中…" : "确认停用"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
