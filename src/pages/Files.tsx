import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { deleteOfficialFile, listFiles } from "../api/files";
import type { AdminFile, AdminFilePage, CloudFileKind, CloudFileStatus } from "../api/files";
import { OfficialFileUpload } from "../components/OfficialFileUpload";
import { Badge, EmptyState, Icon, Modal, PageHeading, SearchInput } from "../components/ui";
import { formatFileSize } from "../utils/format";

/** 删除失败的两种 409 要分别解释，其余直接显示服务端 message。 */
const DELETE_HINTS: Record<string, string> = {
  RESOURCE_IN_USE: "这份素材已被课程或评估引用，先解除引用才能删除。",
  RESOURCE_NOT_READY: "只有状态为「可用」的素材能删除。",
  RESOURCE_NOT_FOUND: "这份素材已经不在了，刷新列表即可。",
};

const PAGE_SIZE = 20;

export function Files() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<CloudFileKind | "">("");
  const [status, setStatus] = useState<CloudFileStatus | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminFilePage | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  /** 加载态由「已完成的请求键」派生，避免在 effect 里同步 setState。 */
  const requestKey = `${page}|${query.trim()}|${kind}|${status}|${reloadToken}`;
  const loading = loadedKey !== requestKey;
  const [pendingDelete, setPendingDelete] = useState<AdminFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    listFiles({
      page,
      page_size: PAGE_SIZE,
      keyword: query.trim() || undefined,
      file_kind: kind || undefined,
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
  }, [requestKey, page, query, kind, status]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.ceil(total / PAGE_SIZE);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteFailure(null);
    try {
      await deleteOfficialFile(pendingDelete.file_code);
      setPendingDelete(null);
      setReloadToken((value) => value + 1);
    } catch (error) {
      setDeleteFailure(error instanceof ApiError ? error : null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="OFFICIAL RESOURCES"
        title="官方素材"
        description="上传图片、音频与 PDF，登记为官方文件后供课程与评估引用。"
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
              <h2>上传素材</h2>
              <p>一次一个文件，登记成功后会出现在下方的列表里。</p>
            </div>
          </div>
          <OfficialFileUpload onUploaded={() => setReloadToken((value) => value + 1)} />
        </section>
        <aside className="resource-guide">
          <div className="guide-illustration" aria-hidden="true">
            <span>F</span>
            <Icon name="file" size={45} />
            <i />
          </div>
          <span className="eyebrow">A SMALL GUIDE</span>
          <h2>
            零散素材，
            <br />
            也有编号可循。
          </h2>
          <ol>
            <li>
              <strong>上传</strong>
              <p>图片、音频或 PDF，单文件不超过 500 MB。</p>
            </li>
            <li>
              <strong>登记</strong>
              <p>服务端嗅探真实类型后登记，得到唯一编号。</p>
            </li>
            <li>
              <strong>引用</strong>
              <p>被课程或评估引用后，删除会被拒绝并说明原因。</p>
            </li>
          </ol>
          <p className="guide-note">
            课程与评估材料整包发布，不走这里——它们有自己的导入流程。
          </p>
        </aside>
      </div>

      <section className="panel resource-list">
        <div className="panel-toolbar">
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="搜索文件名或编号"
          />
          <select
            aria-label="素材类型"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as CloudFileKind | "");
              setPage(1);
            }}
          >
            <option value="">全部类型</option>
            <option value="IMAGE">图片</option>
            <option value="AUDIO">音频</option>
            <option value="PDF">PDF</option>
          </select>
          <select
            aria-label="文件状态"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as CloudFileStatus | "");
              setPage(1);
            }}
          >
            <option value="">全部状态</option>
            <option value="READY">可用</option>
            <option value="UPLOADING">上传中</option>
            <option value="INVALID">无效</option>
            <option value="DELETED">已删除</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>文件</th>
                <th>类型</th>
                <th>大小</th>
                <th>状态</th>
                <th className="numeric">引用</th>
                <th className="muted">登记时间</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="resource-name">
                      <strong>{row.file_name}</strong>
                      <small>{row.file_code}</small>
                    </div>
                  </td>
                  <td>{row.file_kind}</td>
                  <td className="muted numeric">{formatFileSize(row.size_bytes)}</td>
                  <td>
                    <Badge status={row.status} />
                  </td>
                  <td className="numeric">
                    {row.reference_count}
                    <span className="muted"> 处</span>
                  </td>
                  <td className="muted numeric">{row.created_at.replace("T", " ").slice(0, 16)}</td>
                  <td className="align-right">
                    <button
                      className="text-button"
                      onClick={() => {
                        setDeleteFailure(null);
                        setPendingDelete(row);
                      }}
                    >
                      标记删除
                      <Icon name="close" size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !failure && items.length === 0 && (
          <EmptyState text="没有找到匹配的素材" hint="换个关键词，或先上传一个。" />
        )}
        <div className="table-footer">
          <span>
            {loading ? "加载中…" : `共 ${total} 份素材`}
          </span>
          <span className="page-controls">
            {lastPage > 0 && (
              <>
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
              </>
            )}
            {failure && (
              <button
                className="text-button"
                onClick={() => setReloadToken((value) => value + 1)}
              >
                重试
              </button>
            )}
          </span>
        </div>
      </section>

      {pendingDelete && (
        <Modal title="标记删除这份素材？" onClose={() => setPendingDelete(null)}>
          <p>
            <strong>{pendingDelete.file_name}</strong>（{pendingDelete.file_code}）
            {pendingDelete.reference_count > 0
              ? `已被 ${pendingDelete.reference_count} 处引用，服务端会拒绝这次删除。`
              : "当前没有引用，可以删除。"}
          </p>
          <p className="muted">
            删除是标记：记录状态改为已删除，对象本身不会被立刻抹掉。
          </p>
          {deleteFailure && (
            <p className="error-message" role="alert">
              [{deleteFailure.code}] {deleteFailure.message}
              {DELETE_HINTS[deleteFailure.code] ? ` ${DELETE_HINTS[deleteFailure.code]}` : ""}
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" disabled={deleting} onClick={() => setPendingDelete(null)}>
              取消
            </button>
            <button className="button primary" disabled={deleting} onClick={confirmDelete}>
              {deleting ? "处理中…" : "确认删除"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
