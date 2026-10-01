import { useState } from "react";
import { Link } from "react-router-dom";
import { listTeachers, updateTeacherStatus } from "../api/teachers";
import type { Teacher, TeacherStatus } from "../api/teachers";
import { ErrorNotice } from "../components/ErrorNotice";
import { Pager } from "../components/Pager";
import { usePagedQuery } from "../components/usePagedQuery";
import { Badge, EmptyState, Icon, Modal, PageHeading, SearchInput } from "../components/ui";
import { formatUtcToLocal } from "../utils/format";

/**
 * 教师账号（契约 listTeachers / updateTeacherStatus）：查看、停用、启用。
 *
 * - 停用只影响云端访问（AI 转写评分、资源下载等），不影响平板本地登录；凭证不吊销，重新启用后恢复可用。
 * - 启用要求绑定的激活码仍为 ACTIVE；激活码被撤销的教师不能再启用。
 *
 * 后台没有教师的密码与资料——那些只存在平板上。
 */

const PAGE_SIZE = 20;

const STATUS_TABS: Array<[TeacherStatus | "", string]> = [
  ["", "全部"],
  [1, "启用中"],
  [0, "已停用"],
];

export function Teachers() {
  const [status, setStatus] = useState<TeacherStatus | "">("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const { data, failure, loading, reload } = usePagedQuery(`${status}|${keyword.trim()}|${page}`, () =>
    listTeachers({
      page,
      page_size: PAGE_SIZE,
      status: status === "" ? undefined : status,
      username: keyword.trim() || undefined,
    }),
  );
  const [disabling, setDisabling] = useState<Teacher | null>(null);
  const [rowFailure, setRowFailure] = useState<unknown>(null);

  const items = data?.items ?? [];

  async function enable(teacher: Teacher) {
    setRowFailure(null);
    try {
      await updateTeacherStatus(teacher.id, 1);
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
        description="查看教师的云端账号，处理停用与恢复。"
      />
      <ErrorNotice error={failure ?? rowFailure} />
      <section className="panel">
        <div className="panel-toolbar">
          <div className="tabs" aria-label="账号状态">
            {STATUS_TABS.map(([value, label]) => (
              <button
                key={String(value) || "ALL"}
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
            placeholder="搜索用户名"
          />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>状态</th>
                <th className="muted">注册时间</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((teacher) => (
                <tr key={teacher.id}>
                  <td className="numeric">{teacher.id}</td>
                  <td>
                    <strong>{teacher.username}</strong>
                  </td>
                  <td>
                    <Badge status={teacher.status === 1 ? "ACTIVE" : "DISABLED"} />
                  </td>
                  <td className="muted numeric">{formatUtcToLocal(teacher.created_at)}</td>
                  <td className="align-right">
                    <span className="row-actions">
                      <Link className="text-button" to={`/licenses?user_id=${teacher.id}`}>
                        激活码
                      </Link>
                      {teacher.status === 1 ? (
                        <button className="text-button" onClick={() => setDisabling(teacher)}>
                          停用
                        </button>
                      ) : (
                        <button className="text-button" onClick={() => void enable(teacher)}>
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
        {!loading && !failure && items.length === 0 && (
          <EmptyState text="没有匹配的教师" hint="教师用激活码在平板上注册后会出现在这里。" />
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
      <p className="page-note">
        <Icon name="leaf" size={16} />
        停用只拦截云端访问，教师仍可在平板上离线登录和查看本地数据。
      </p>

      {disabling && (
        <DisableModal
          teacher={disabling}
          onClose={() => setDisabling(null)}
          onDone={() => {
            setDisabling(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function DisableModal({
  teacher,
  onClose,
  onDone,
}: {
  teacher: Teacher;
  onClose: () => void;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await updateTeacherStatus(teacher.id, 0);
      onDone();
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`停用 ${teacher.username}`} onClose={onClose}>
      <p>
        停用后该教师立即无法使用云端能力（AI 转写与评分、资源下载等），平板本地登录不受影响。可随时重新启用。
      </p>
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
