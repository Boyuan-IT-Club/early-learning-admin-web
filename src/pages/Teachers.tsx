import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  EmptyState,
  Icon,
  PageHeading,
  SearchInput,
} from "../components/ui";
import { teachers } from "../demo/data";
export function Teachers() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const rows = teachers.filter(
    (row) =>
      `${row.name} ${row.id}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (status === "ALL" || row.status === status),
  );
  return (
    <>
      <PageHeading
        eyebrow="PEOPLE WHO MAKE A DIFFERENCE"
        title="教师账号"
        description="连接每一位用心的教师，让支持持续发生。"
      />
      <div className="section-caption">
        <span>
          <strong>{teachers.length}</strong> 位教师已加入演示工作台
        </span>
        <span className="muted">账号信息与使用情况一目了然</span>
      </div>
      <section className="panel">
        <div className="panel-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="搜索教师姓名或账号"
          />
          <select
            aria-label="激活状态"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="ALL">全部激活状态</option>
            <option value="ACTIVE">已激活</option>
            <option value="INACTIVE">未激活</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>教师</th>
                <th>激活状态</th>
                <th>加入时间</th>
                <th>API 调用次数</th>
                <th>最近调用</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>
                    <div className="person-cell">
                      <span className={`avatar avatar-${index % 3}`}>
                        {row.name.slice(0, 1)}
                      </span>
                      <div>
                        <strong>{row.name}</strong>
                        <small>{row.id}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge status={row.status} />
                  </td>
                  <td className="muted numeric">{row.joined}</td>
                  <td className="numeric">
                    {row.calls}
                    <span className="muted"> 次</span>
                  </td>
                  <td className="muted numeric">{row.last}</td>
                  <td className="align-right">
                    <Link
                      className="text-button"
                      to={`/api-usage?teacher=${row.id}`}
                    >
                      查看用量
                      <Icon name="arrow" size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState />}
        <div className="table-footer">
          <span>共 {rows.length} 位教师</span>
          <span>示例账号，无真实个人信息</span>
        </div>
      </section>
      <p className="page-note">
        <Icon name="users" size={16} />
        教师通过教师端完成注册与激活，这里集中查看账号信息。
      </p>
    </>
  );
}
