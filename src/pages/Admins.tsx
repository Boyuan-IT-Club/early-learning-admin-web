import { useState } from "react";
import type { FormEvent } from "react";
import { createAdmin, listAdmins, updateAdmin } from "../api/admins";
import type { AdminAccount, AdminStatus } from "../api/admins";
import { getAdminId } from "../api/auth";
import { ADMIN_PASSWORD_MAX, ADMIN_PASSWORD_MIN, USERNAME_PATTERN, charLength } from "../api/contract";
import { ErrorNotice } from "../components/ErrorNotice";
import { Pager } from "../components/Pager";
import { usePagedQuery } from "../components/usePagedQuery";
import { Badge, EmptyState, Icon, Modal, PageHeading, SearchInput } from "../components/ui";
import { formatUtcToLocal } from "../utils/format";
import { newIdempotencyKey } from "../utils/idempotency";

/**
 * 管理员（契约 createAdminAccount / listAdminAccounts / updateAdminAccount）：新建、改密码、停用 / 启用。
 *
 * 所有管理员同权限。改密码或停用后，该管理员已签发的 Token 全部失效——改的是自己时，当前会话随之结束。
 */

const PAGE_SIZE = 20;

const STATUS_TABS: Array<[AdminStatus | "", string]> = [
  ["", "全部"],
  ["ACTIVE", "启用中"],
  ["DISABLED", "已停用"],
];

type Dialog = { kind: "create" } | { kind: "password" | "disable"; admin: AdminAccount };

export function Admins({ onSessionEnded }: { onSessionEnded: () => void }) {
  const [status, setStatus] = useState<AdminStatus | "">("");
  const [username, setUsername] = useState("");
  const [page, setPage] = useState(1);
  const exactName = username.trim();
  const { data, failure, loading, reload } = usePagedQuery(`${status}|${exactName}|${page}`, () =>
    listAdmins({
      page,
      page_size: PAGE_SIZE,
      status: status || undefined,
      // 契约要求合法用户名；输到一半不合法时不带这个条件，避免整页报 400
      username: USERNAME_PATTERN.test(exactName) ? exactName : undefined,
    }),
  );
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [rowFailure, setRowFailure] = useState<unknown>(null);
  const selfId = getAdminId();

  const items = data?.items ?? [];

  /** 改到自己的密码或状态后，服务端已吊销当前 Token：直接回登录页。 */
  function afterChange(admin: AdminAccount, endsOwnSession: boolean) {
    if (endsOwnSession && admin.id === selfId) {
      onSessionEnded();
      return;
    }
    setDialog(null);
    reload();
  }

  async function enable(admin: AdminAccount) {
    setRowFailure(null);
    try {
      await updateAdmin(admin.id, { status: "ACTIVE" });
      reload();
    } catch (error) {
      setRowFailure(error);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRATORS"
        title="管理员"
        description="维护管理后台的登录账号。所有管理员权限相同。"
        action={
          <button className="button primary" onClick={() => setDialog({ kind: "create" })}>
            <Icon name="plus" size={18} />
            新建管理员
          </button>
        }
      />
      <ErrorNotice error={failure ?? rowFailure} />
      <section className="panel">
        <div className="panel-toolbar">
          <div className="tabs" aria-label="账号状态">
            {STATUS_TABS.map(([value, label]) => (
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
            value={username}
            onChange={(value) => {
              setUsername(value);
              setPage(1);
            }}
            placeholder="按完整用户名查找"
          />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>状态</th>
                <th className="muted">创建时间</th>
                <th className="muted">更新时间</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((admin) => (
                <tr key={admin.id}>
                  <td className="numeric">{admin.id}</td>
                  <td>
                    <strong>{admin.username}</strong>
                    {admin.id === selfId && <small className="muted">（当前登录）</small>}
                  </td>
                  <td>
                    <Badge status={admin.status} />
                  </td>
                  <td className="muted numeric">{formatUtcToLocal(admin.created_at)}</td>
                  <td className="muted numeric">{formatUtcToLocal(admin.updated_at)}</td>
                  <td className="align-right">
                    <span className="row-actions">
                      <button className="text-button" onClick={() => setDialog({ kind: "password", admin })}>
                        改密码
                      </button>
                      {admin.status === "ACTIVE" ? (
                        <button className="text-button" onClick={() => setDialog({ kind: "disable", admin })}>
                          停用
                        </button>
                      ) : (
                        <button className="text-button" onClick={() => void enable(admin)}>
                          启用
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !failure && items.length === 0 && <EmptyState text="没有匹配的管理员" />}
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          loading={loading}
          unit="位管理员"
          onChange={setPage}
        />
      </section>

      {dialog?.kind === "create" && (
        <CreateModal
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
      {dialog?.kind === "password" && (
        <PasswordModal
          admin={dialog.admin}
          isSelf={dialog.admin.id === selfId}
          onClose={() => setDialog(null)}
          onChanged={() => afterChange(dialog.admin, true)}
        />
      )}
      {dialog?.kind === "disable" && (
        <DisableModal
          admin={dialog.admin}
          isSelf={dialog.admin.id === selfId}
          onClose={() => setDialog(null)}
          onDisabled={() => afterChange(dialog.admin, true)}
        />
      )}
    </>
  );
}

function passwordProblem(password: string, confirm: string): string | null {
  const length = charLength(password);
  if (length < ADMIN_PASSWORD_MIN || length > ADMIN_PASSWORD_MAX) {
    return `密码需 ${ADMIN_PASSWORD_MIN}–${ADMIN_PASSWORD_MAX} 个字符（首尾空格也算）。`;
  }
  if (password !== confirm) return "两次输入的密码不一致。";
  return null;
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // 同一次新建对应一个键：响应丢失后原样重试不会重复创建；改了输入就是另一次新建，换新键
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const usernameValid = USERNAME_PATTERN.test(username);
  const problem = password || confirm ? passwordProblem(password, confirm) : null;
  const canSubmit = usernameValid && password !== "" && problem === null && !submitting;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await createAdmin(username, password, idempotencyKey);
      onCreated();
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="新建管理员" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="form-field">
          用户名（3–64 位字母、数字、_ . -，不区分大小写）
          <input
            autoComplete="off"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setIdempotencyKey(newIdempotencyKey());
            }}
          />
        </label>
        <label className="form-field">
          初始密码
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setIdempotencyKey(newIdempotencyKey());
            }}
          />
        </label>
        <label className="form-field">
          再次输入
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        {username !== "" && !usernameValid && <p className="error-message">用户名格式不正确。</p>}
        {problem && <p className="error-message">{problem}</p>}
        <ErrorNotice error={failure} />
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={submitting} onClick={onClose}>
            取消
          </button>
          <button className="button primary" disabled={!canSubmit}>
            {submitting ? "创建中…" : failure ? "重试" : "创建"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({
  admin,
  isSelf,
  onClose,
  onChanged,
}: {
  admin: AdminAccount;
  isSelf: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const problem = password || confirm ? passwordProblem(password, confirm) : null;
  const canSubmit = password !== "" && problem === null && !submitting;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await updateAdmin(admin.id, { password });
      onChanged();
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`修改 ${admin.username} 的密码`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="notice" role="status">
          {isSelf
            ? "修改后当前会话会结束，需要用新密码重新登录。"
            : "修改后该管理员所有已登录的会话立即失效。"}
        </p>
        <label className="form-field">
          新密码
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="form-field">
          再次输入
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        {problem && <p className="error-message">{problem}</p>}
        <ErrorNotice error={failure} />
        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={submitting} onClick={onClose}>
            取消
          </button>
          <button className="button primary" disabled={!canSubmit}>
            {submitting ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DisableModal({
  admin,
  isSelf,
  onClose,
  onDisabled,
}: {
  admin: AdminAccount;
  isSelf: boolean;
  onClose: () => void;
  onDisabled: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await updateAdmin(admin.id, { status: "DISABLED" });
      onDisabled();
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`停用 ${admin.username}`} onClose={onClose}>
      <p>停用后该管理员无法登录，已登录的会话立即失效；可由其他管理员重新启用。</p>
      {isSelf && (
        <p className="notice" role="status">
          你正在停用自己：当前会话会立即结束。请先确认还有其他可用的管理员——没有的话，系统里将没人能登录管理后台。
        </p>
      )}
      <ErrorNotice error={failure} />
      <div className="modal-actions">
        <button className="button secondary" disabled={submitting} onClick={onClose}>
          取消
        </button>
        <button className="button primary" disabled={submitting} onClick={submit}>
          {submitting ? "处理中…" : "确认停用"}
        </button>
      </div>
    </Modal>
  );
}
