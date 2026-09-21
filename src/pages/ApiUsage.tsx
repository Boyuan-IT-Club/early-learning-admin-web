import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, Icon, PageHeading } from "../components/ui";
import { teachers, usage } from "../demo/data";
export function ApiUsage() {
  const [params, setParams] = useSearchParams();
  const teacher = params.get("teacher") ?? "";
  const [type, setType] = useState("");
  const rows = usage.filter(
    (row) =>
      (!teacher || row.teacherId === teacher) && (!type || row.type === type),
  );
  return (
    <>
      <PageHeading
        eyebrow="USAGE AT A GLANCE"
        title="API 用量"
        description="清晰了解服务使用情况，为教学支持做好准备。"
      />
      <div className="info-strip">
        <Icon name="usage" size={21} />
        <p>按教师与服务类型查看用量。不同服务保留各自计量单位。</p>
        <span className="subtle-tag">示例记录</span>
      </div>
      <section className="panel">
        <div className="panel-toolbar">
          <div className="filter-group">
            <select
              aria-label="教师账号"
              value={teacher}
              onChange={(event) => {
                const next = new URLSearchParams(params);
                if (event.target.value) next.set("teacher", event.target.value);
                else next.delete("teacher");
                setParams(next);
              }}
            >
              <option value="">全部教师</option>
              {teachers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.id}
                </option>
              ))}
            </select>
            <select
              aria-label="API 类型"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">全部 API 类型</option>
              <option>语音转写</option>
              <option>故事评分</option>
              <option>问答评分</option>
            </select>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setParams({});
              setType("");
            }}
          >
            重置筛选
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>教师账号</th>
                <th>API 类型</th>
                <th>调用次数</th>
                <th>使用量</th>
                <th>最近调用时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.teacherId}-${row.type}`}>
                  <td>
                    <div className="person-cell">
                      <span className="avatar">{row.name[0]}</span>
                      <div>
                        <strong>{row.name}</strong>
                        <small>{row.teacherId}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="api-type">{row.type}</span>
                  </td>
                  <td className="numeric">
                    {row.calls} <span className="muted">次</span>
                  </td>
                  <td className="numeric">{row.amount}</td>
                  <td className="muted numeric">{row.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <EmptyState text="暂无调用记录" hint="当前筛选条件下没有示例用量。" />
        )}
        <div className="table-footer">
          <span>共 {rows.length} 条记录</span>
          <span>统计周期与计量口径以正式服务为准</span>
        </div>
      </section>
    </>
  );
}
