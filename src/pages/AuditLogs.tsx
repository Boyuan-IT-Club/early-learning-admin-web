import { useState } from "react";
import { listAuditLogs } from "../api/audit";
import { ErrorNotice } from "../components/ErrorNotice";
import { Pager } from "../components/Pager";
import { usePagedQuery } from "../components/usePagedQuery";
import { EmptyState, PageHeading } from "../components/ui";
import { formatUtcToLocal } from "../utils/format";

/**
 * 管控审计（PRD 12.1）：只读。记录谁在何时对什么做了什么；不含激活码、Token、密码与业务正文。
 */

const PAGE_SIZE = 50;

/** 动作代码 → 中文。服务端新增动作时这里没有的代码直接显示原文。 */
const ACTION_LABELS: Record<string, string> = {
  ADMIN_BOOTSTRAPPED: "创建初始管理员",
  ADMIN_LOGIN: "管理员登录",
  ADMIN_LOGIN_FAILED: "管理员登录失败",
  ADMIN_PASSWORD_CHANGED: "修改密码",
  ADMIN_CREATED: "新建管理员",
  ADMIN_DISABLED: "停用管理员",
  ADMIN_ENABLED: "启用管理员",
  ADMIN_PASSWORD_RESET: "重置管理员密码",
  LICENSE_BATCH_CREATED: "生成激活码",
  LICENSE_REVOKED: "撤销激活码",
  TEACHER_REGISTERED: "教师注册",
  TEACHER_DISABLED: "停用教师",
  TEACHER_ENABLED: "启用教师",
  TEACHER_DEVICE_UNBOUND: "解绑设备",
  TEACHER_RECOVERY_CODE_ISSUED: "签发恢复码",
  TEACHER_RECOVERED: "教师恢复账号",
  TEACHER_RECOVERY_FAILED: "恢复码错误",
};

const ACTOR_LABELS: Record<string, string> = { ADMIN: "管理员", TEACHER: "教师", SYSTEM: "系统" };
const TARGET_LABELS: Record<string, string> = { ADMIN: "管理员", TEACHER: "教师", LICENSE: "激活码" };

export function AuditLogs() {
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const [page, setPage] = useState(1);
  const { data, failure, loading } = usePagedQuery(`${action}|${targetType}|${targetId.trim()}|${page}`, () =>
    listAuditLogs({
      page,
      page_size: PAGE_SIZE,
      action: action || undefined,
      target_type: targetType || undefined,
      target_id: targetId.trim() || undefined,
    }),
  );
  const items = data?.items ?? [];

  return (
    <>
      <PageHeading
        eyebrow="AUDIT TRAIL"
        title="管控审计"
        description="账号、激活码与管理员操作的留痕。只读，不能修改或删除。"
      />
      <ErrorNotice error={failure} />
      <section className="panel">
        <div className="panel-toolbar">
          <select
            aria-label="动作"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          >
            <option value="">全部动作</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="对象类型"
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">全部对象</option>
            <option value="TEACHER">教师</option>
            <option value="LICENSE">激活码</option>
            <option value="ADMIN">管理员</option>
          </select>
          <input
            aria-label="对象 id"
            placeholder="对象 id"
            value={targetId}
            onChange={(event) => {
              setTargetId(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="muted">时间</th>
                <th>动作</th>
                <th>操作者</th>
                <th>对象</th>
                <th>原因 / 补充</th>
                <th>结果</th>
                <th className="muted">来源</th>
              </tr>
            </thead>
            <tbody>
              {items.map((log) => (
                <tr key={log.id}>
                  <td className="muted numeric">{formatUtcToLocal(log.created_at)}</td>
                  <td>{ACTION_LABELS[log.action] ?? log.action}</td>
                  <td>
                    {ACTOR_LABELS[log.actor_type] ?? log.actor_type}
                    {log.actor_id !== null && <small className="muted"> #{log.actor_id}</small>}
                  </td>
                  <td>
                    {log.target_type ? (
                      <>
                        {TARGET_LABELS[log.target_type] ?? log.target_type}
                        {log.target_id && <small className="muted"> #{log.target_id}</small>}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {log.reason ?? ""}
                    {log.detail && <small className="muted code-text"> {log.detail}</small>}
                  </td>
                  <td>{log.result === "SUCCESS" ? "成功" : <strong>失败</strong>}</td>
                  <td className="muted">{log.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !failure && items.length === 0 && <EmptyState text="没有匹配的审计记录" />}
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          loading={loading}
          unit="条记录"
          onChange={setPage}
        />
      </section>
    </>
  );
}
