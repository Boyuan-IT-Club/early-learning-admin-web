import { useState } from "react";
import { createAdmin, disableAdmin, enableAdmin, listAdmins, resetAdminPassword } from "../api/admins";
import { changePassword, getAdminName } from "../api/auth";
import type { Admin } from "../api/auth";
import { ADMIN_PASSWORD_MIN } from "../api/contract";
import { ErrorNotice } from "../components/ErrorNotice";
import { newIdempotencyKey } from "../utils/idempotency";
import { usePagedQuery } from "../components/usePagedQuery";
import { Badge, Icon, Modal, PageHeading } from "../components/ui";
import { formatUtcToLocal } from "../utils/format";

/**
 * 管理员：修改自己的密码，维护其他管理员（新建、停用、启用、重置密码）。
 *
 * 所有管理员权限相同（PRD 只有"超级管理员"一种角色）。不能停用自己、至少保留一个可用管理员由服务端保证。
 */
export function Admins() {
  const { data, failure, loading, reload } = usePagedQuery("admins", listAdmins);
  const [rowFailure, setRowFailure] = useState<unknown>(null);
  const [modal, setModal] = useState<"password" | "create" | { reset: Admin } | null>(null);
  const me = getAdminName();

  async function toggle(admin: Admin) {
    setRowFailure(null);
    try {
      if (admin.status === "ACTIVE") await disableAdmin(admin.id);
      else await enableAdmin(admin.id);
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
        description="管理后台账号。管理员没有任何读取儿童业务数据的入口。"
        action={
          <span className="row-actions">
            <button className="button secondary" onClick={() => setModal("password")}>
              <Icon name="key" size={18} />
              修改我的密码
            </button>
            <button className="button primary" onClick={() => setModal("create")}>
              <Icon name="plus" size={18} />
              新建管理员
            </button>
          </span>
        }
      />
      <ErrorNotice error={failure ?? rowFailure} />
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>状态</th>
                <th className="muted">创建时间</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((admin) => (
                <tr key={admin.id}>
                  <td>
                    <strong>{admin.username}</strong>
                    {admin.username === me && <small className="muted">（我）</small>}
                  </td>
                  <td>
                    <Badge status={admin.status} />
                  </td>
                  <td className="muted numeric">{formatUtcToLocal(admin.created_at)}</td>
                  <td className="align-right">
                    {admin.username !== me && (
                      <span className="row-actions">
                        <button className="text-button" onClick={() => void toggle(admin)}>
                          {admin.status === "ACTIVE" ? "停用" : "启用"}
                        </button>
                        <button className="text-button" onClick={() => setModal({ reset: admin })}>
                          重置密码
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{loading ? "加载中…" : `共 ${data?.length ?? 0} 位管理员`}</span>
        </div>
      </section>

      {modal === "password" && <ChangePasswordModal onClose={() => setModal(null)} />}
      {modal === "create" && (
        <CreateAdminModal
          onClose={() => setModal(null)}
          onCreated={() => {
            setModal(null);
            reload();
          }}
        />
      )}
      {modal !== null && typeof modal === "object" && (
        <ResetPasswordModal admin={modal.reset} onClose={() => setModal(null)} />
      )}
    </>
  );
}

function PasswordFields({
  value,
  confirm,
  onValue,
  onConfirm,
  label,
}: {
  value: string;
  confirm: string;
  onValue: (value: string) => void;
  onConfirm: (value: string) => void;
  label: string;
}) {
  return (
    <>
      <label className="form-field">
        {label}（至少 {ADMIN_PASSWORD_MIN} 位）
        <input type="password" autoComplete="new-password" value={value} onChange={(e) => onValue(e.target.value)} />
      </label>
      <label className="form-field">
        再输入一次
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
        />
        {confirm && confirm !== value && <small>两次输入不一致</small>}
      </label>
    </>
  );
}

function usePasswordPair() {
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const valid = value.length >= ADMIN_PASSWORD_MIN && value === confirm;
  return { value, confirm, setValue, setConfirm, valid };
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState("");
  const next = usePasswordPair();
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!oldPassword || !next.valid || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await changePassword(oldPassword, next.value);
      setDone(true);
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="修改我的密码" onClose={onClose}>
      {done ? (
        <>
          <p className="notice" role="status">
            密码已修改。你在其他浏览器或设备上的登录已全部失效，当前页面保持登录。
          </p>
          <div className="modal-actions">
            <button className="button primary" onClick={onClose}>
              完成
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="form-field">
            当前密码
            <input
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
          </label>
          <PasswordFields
            label="新密码"
            value={next.value}
            confirm={next.confirm}
            onValue={next.setValue}
            onConfirm={next.setConfirm}
          />
          <ErrorNotice error={failure} />
          <div className="modal-actions">
            <button className="button secondary" disabled={submitting} onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={!oldPassword || !next.valid || submitting} onClick={submit}>
              {submitting ? "提交中…" : "确认修改"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function CreateAdminModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const password = usePasswordPair();
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const validName = /^[A-Za-z0-9_.-]{4,32}$/.test(username);

  async function submit() {
    if (!validName || !password.valid || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await createAdmin(username, password.value, idempotencyKey);
      onCreated();
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="新建管理员" onClose={onClose}>
      <label className="form-field">
        用户名（4–32 位字母、数字、下划线、点、连字符，区分大小写）
        <input autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <PasswordFields
        label="初始密码"
        value={password.value}
        confirm={password.confirm}
        onValue={password.setValue}
        onConfirm={password.setConfirm}
      />
      <ErrorNotice error={failure} />
      <div className="modal-actions">
        <button className="button secondary" disabled={submitting} onClick={onClose}>
          取消
        </button>
        <button className="button primary" disabled={!validName || !password.valid || submitting} onClick={submit}>
          {submitting ? "创建中…" : "创建"}
        </button>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ admin, onClose }: { admin: Admin; onClose: () => void }) {
  const password = usePasswordPair();
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!password.valid || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await resetAdminPassword(admin.id, password.value);
      setDone(true);
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`重置密码：${admin.username}`} onClose={onClose}>
      {done ? (
        <>
          <p className="notice" role="status">
            已重置，{admin.username} 的所有登录已失效，需要用新密码重新登录。
          </p>
          <div className="modal-actions">
            <button className="button primary" onClick={onClose}>
              完成
            </button>
          </div>
        </>
      ) : (
        <>
          <PasswordFields
            label="新密码"
            value={password.value}
            confirm={password.confirm}
            onValue={password.setValue}
            onConfirm={password.setConfirm}
          />
          <ErrorNotice error={failure} />
          <div className="modal-actions">
            <button className="button secondary" disabled={submitting} onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={!password.valid || submitting} onClick={submit}>
              {submitting ? "提交中…" : "确认重置"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
