import { useState } from "react";
import { REASON_MAX } from "../api/contract";
import {
  disableTeacher,
  enableTeacher,
  issueRecoveryCode,
  listTeachers,
  unbindTeacherDevice,
} from "../api/teachers";
import type { RecoveryCode, Teacher, TeacherStatus } from "../api/teachers";
import { ErrorNotice } from "../components/ErrorNotice";
import { newIdempotencyKey } from "../utils/idempotency";
import { Pager } from "../components/Pager";
import { usePagedQuery } from "../components/usePagedQuery";
import { Badge, EmptyState, Icon, Modal, PageHeading, SearchInput } from "../components/ui";
import { formatUtcToLocal } from "../utils/format";

/**
 * 教师账号：停用 / 启用、解绑设备、签发恢复码。
 *
 * - 停用立即生效，平板进入受限模式（可查看、导出，不能新建业务）；重新启用后平板自动恢复。
 * - 解绑后原设备再也无法访问云端；教师在新设备上用恢复码重新绑定，业务数据走离线备份恢复。
 * - 恢复码也用于教师忘记平板本地密码：同一台设备上凭恢复码重设。
 *
 * 后台没有教师的姓名等资料——那些只存在平板上（PRD 1.2 数据边界）。
 */

const PAGE_SIZE = 20;

type Action = { kind: "disable" | "unbind"; teacher: Teacher } | { kind: "recovery"; teacher: Teacher };

export function Teachers() {
  const [status, setStatus] = useState<TeacherStatus | "">("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const { data, failure, loading, reload } = usePagedQuery(`${status}|${keyword.trim()}|${page}`, () =>
    listTeachers({
      page,
      page_size: PAGE_SIZE,
      status: status || undefined,
      keyword: keyword.trim() || undefined,
    }),
  );
  const [action, setAction] = useState<Action | null>(null);
  const [rowFailure, setRowFailure] = useState<unknown>(null);

  const items = data?.items ?? [];

  async function enable(teacher: Teacher) {
    setRowFailure(null);
    try {
      await enableTeacher(teacher.id);
      reload();
    } catch (error) {
      setRowFailure(error);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="TEACHER ACCOUNTS"
        title="教师账号"
        description="查看教师账号与设备绑定，处理停用、换机和找回。"
      />
      <ErrorNotice error={failure ?? rowFailure} />
      <section className="panel">
        <div className="panel-toolbar">
          <div className="tabs" aria-label="账号状态">
            {(
              [
                ["", "全部"],
                ["ACTIVE", "启用中"],
                ["DISABLED", "已停用"],
              ] as Array<[TeacherStatus | "", string]>
            ).map(([value, label]) => (
              <button
                key={value || "ALL"}
                aria-pressed={status === value}
                className={status === value ? "selected" : ""}
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchInput
            value={keyword}
            onChange={(value) => {
              setKeyword(value);
              setPage(1);
            }}
            placeholder="搜索用户名、激活码尾号或备注"
          />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>教师</th>
                <th>状态</th>
                <th>激活码</th>
                <th>设备</th>
                <th className="muted">最近联网</th>
                <th className="muted">注册时间</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((teacher) => (
                <tr key={teacher.id}>
                  <td>
                    <strong>{teacher.username}</strong>
                  </td>
                  <td>
                    <Badge status={teacher.status} />
                  </td>
                  <td>
                    {teacher.license ? (
                      <>
                        <span className="code-text">{teacher.license.code_hint}</span>{" "}
                        {teacher.license.status !== "ACTIVE" && <Badge status={teacher.license.status} />}
                        {teacher.license.remark && <small className="muted"> {teacher.license.remark}</small>}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {teacher.device_bound ? (
                      <span>已绑定 <small className="muted">{formatUtcToLocal(teacher.device_bound_at)}</small></span>
                    ) : (
                      <span className="muted">未绑定</span>
                    )}
                  </td>
                  <td className="muted numeric">{formatUtcToLocal(teacher.last_refresh_at)}</td>
                  <td className="muted numeric">{formatUtcToLocal(teacher.created_at)}</td>
                  <td className="align-right">
                    <span className="row-actions">
                      {teacher.status === "ACTIVE" ? (
                        <button className="text-button" onClick={() => setAction({ kind: "disable", teacher })}>
                          停用
                        </button>
                      ) : (
                        <button className="text-button" onClick={() => void enable(teacher)}>
                          启用
                        </button>
                      )}
                      {teacher.device_bound && (
                        <button className="text-button" onClick={() => setAction({ kind: "unbind", teacher })}>
                          解绑设备
                        </button>
                      )}
                      <button className="text-button" onClick={() => setAction({ kind: "recovery", teacher })}>
                        签发恢复码
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !failure && items.length === 0 && (
          <EmptyState text="没有匹配的教师账号" hint="教师用激活码在平板上注册后会出现在这里。" />
        )}
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          loading={loading}
          unit="位教师"
          onChange={setPage}
        />
      </section>

      {action && action.kind !== "recovery" && (
        <ReasonModal
          action={action.kind}
          teacher={action.teacher}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            reload();
          }}
        />
      )}
      {action?.kind === "recovery" && (
        <RecoveryCodeModal teacher={action.teacher} onClose={() => setAction(null)} />
      )}
    </>
  );
}

const REASON_COPY = {
  disable: {
    title: "停用教师账号",
    body: "停用立即生效：平板在下次联网时进入受限模式（仍可查看与导出，不能新建业务）。之后可以随时重新启用。",
    confirm: "确认停用",
  },
  unbind: {
    title: "解绑设备",
    body: "原设备将无法再访问云端（包括刷新凭证），平板上的数据不会被删除。教师换到新设备后，需要你签发恢复码完成重新绑定；原设备的数据请用离线备份导入。",
    confirm: "确认解绑",
  },
} as const;

function ReasonModal({
  action,
  teacher,
  onClose,
  onDone,
}: {
  action: "disable" | "unbind";
  teacher: Teacher;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const copy = REASON_COPY[action];
  const trimmed = reason.trim();

  async function submit() {
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      if (action === "disable") await disableTeacher(teacher.id, trimmed);
      else await unbindTeacherDevice(teacher.id, trimmed);
      onDone();
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`${copy.title}：${teacher.username}`} onClose={onClose}>
      <p>{copy.body}</p>
      <label className="form-field">
        原因（必填，记入审计）
        <input maxLength={REASON_MAX} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <ErrorNotice error={failure} />
      <div className="modal-actions">
        <button className="button secondary" disabled={submitting} onClick={onClose}>
          取消
        </button>
        <button className="button primary" disabled={!trimmed || submitting} onClick={submit}>
          {submitting ? "处理中…" : copy.confirm}
        </button>
      </div>
    </Modal>
  );
}

function RecoveryCodeModal({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [issued, setIssued] = useState<RecoveryCode | null>(null);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      setIssued(await issueRecoveryCode(teacher.id, idempotencyKey));
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    if (issued && !window.confirm("关闭后将无法再次查看这枚恢复码。确认已告知教师？")) return;
    onClose();
  }

  return (
    <Modal title={`签发恢复码：${teacher.username}`} onClose={close}>
      {!issued ? (
        <>
          <p>
            恢复码用于：教师忘记平板本地密码、重装 App、或换新设备。24 小时内有效，只能用一次，
            输错 5 次作废。再次签发会使旧码失效。
          </p>
          {teacher.device_bound && (
            <p className="notice" role="status">
              该账号仍绑定在一台设备上：恢复码只能在这台设备上使用。若教师要换新设备，请先「解绑设备」。
            </p>
          )}
          <ErrorNotice error={failure} />
          <div className="modal-actions">
            <button className="button secondary" disabled={submitting} onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={submitting} onClick={submit}>
              {submitting ? "签发中…" : failure ? "重试" : "签发"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="notice" role="status">
            只显示这一次。请当面或通过可信渠道告知教师，并提醒在 {formatUtcToLocal(issued.expires_at)} 前使用。
          </p>
          <ul className="code-list" aria-label="恢复码">
            <li className="code-text">{issued.recovery_code}</li>
          </ul>
          <p className="muted">
            教师在平板「账号恢复」页输入用户名 <strong>{teacher.username}</strong>、恢复码与新密码即可。
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => void navigator.clipboard.writeText(issued.recovery_code)}>
              <Icon name="copy" size={16} />
              复制
            </button>
            <button className="button primary" onClick={close}>
              完成
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
