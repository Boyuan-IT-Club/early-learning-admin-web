/** 分页列表的页脚：总数与翻页。 */
export function Pager({
  page,
  pageSize,
  total,
  loading,
  unit,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  unit: string;
  onChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="table-footer">
      <span>{loading ? "加载中…" : `共 ${total} ${unit}`}</span>
      <span className="page-controls">
        <button className="text-button" disabled={page <= 1 || loading} onClick={() => onChange(page - 1)}>
          上一页
        </button>
        <span className="muted">
          第 {page} / {lastPage} 页
        </span>
        <button
          className="text-button"
          disabled={page >= lastPage || loading}
          onClick={() => onChange(page + 1)}
        >
          下一页
        </button>
      </span>
    </div>
  );
}
