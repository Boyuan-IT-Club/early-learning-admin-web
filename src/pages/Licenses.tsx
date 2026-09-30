import { useState } from "react";
import { LICENSE_BATCH_MAX, REASON_MAX } from "../api/contract";
import { issueLicenses, listLicenses, lookupLicense, revokeLicenses } from "../api/licenses";
import type { IssuedLicense, License, LicenseStatus } from "../api/licenses";
import { ErrorNotice } from "../components/ErrorNotice";
import { newIdempotencyKey } from "../utils/idempotency";
import { Pager } from "../components/Pager";
import { usePagedQuery } from "../components/usePagedQuery";
import { Badge, EmptyState, Icon, Modal, PageHeading, SearchInput } from "../components/ui";
import { formatUtcToLocal } from "../utils/format";

/**
 * 激活码管理：批量生成（明文只展示一次）、按状态与关键词查看、按完整码查询、撤销。
 *
 * 撤销不可恢复：撤销一枚已激活的码会永久终止对应教师的云端访问。临时停用请去"教师账号"页。
 */

const PAGE_SIZE = 20;

const STATUS_TABS: Array<[LicenseStatus | "", string]> = [
  ["", "全部"],
  ["UNUSED", "待使用"],
  ["ACTIVE", "已激活"],
  ["REVOKED", "已撤销"],
];

export function Licenses() {
  const [status, setStatus] = useState<LicenseStatus | "">("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const { data, failure, loading, reload } = usePagedQuery(
    `${status}|${keyword.trim()}|${page}`,
    () =>
      listLicenses({
        page,
        page_size: PAGE_SIZE,
        status: status || undefined,
        keyword: keyword.trim() || undefined,
      }),
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState<License[] | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);

  const items = data?.items ?? [];
  const counts = data?.counts;
  const revocable = items.filter((row) => row.status !== "REVOKED");

  function toggle(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
    setSelected([]);
  }

  return (
    <>
      <PageHeading
        eyebrow="ACCESS & CONNECTION"
        title="激活码管理"
        description="为教师开启一段新的支持旅程。一枚激活码注册一个教师账号。"
        action={
          <button className="button primary" onClick={() => setGenerating(true)}>
            <Icon name="plus" size={18} />
            生成激活码
          </button>
        }
      />
      <div className="stats-row">
        {(
          [
            { key: "UNUSED", label: "待使用", icon: "clipboard" },
            { key: "ACTIVE", label: "已激活", icon: "users" },
            { key: "REVOKED", label: "已撤销", icon: "key" },
          ] as const
        ).map((item) => (
          <div className={`stat-card stat-${item.key.toLowerCase()}`} key={item.key}>
            <div>
              <span>{item.label}</span>
              <strong>
                {counts ? counts[item.key] : "—"}
                <small>枚</small>
              </strong>
            </div>
            <span className="stat-icon">
              <Icon name={item.icon} size={23} />
            </span>
          </div>
        ))}
      </div>
      <ErrorNotice error={failure} />

      <section className="panel">
        <div className="panel-toolbar">
          <div className="tabs" aria-label="激活码状态">
            {STATUS_TABS.map(([value, label]) => (
              <button
                key={value || "ALL"}
                aria-pressed={status === value}
                className={status === value ? "selected" : ""}
                onClick={() => changeFilter(() => setStatus(value))}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchInput
            value={keyword}
            onChange={(value) => changeFilter(() => setKeyword(value))}
            placeholder="搜索尾号、备注或教师"
          />
          <button className="text-button" onClick={() => setLookupOpen(true)}>
            <Icon name="search" size={15} />
            按完整码查询
          </button>
          <button
            className="text-button"
            disabled={selected.length === 0}
            onClick={() => setRevoking(items.filter((row) => selected.includes(row.id)))}
          >
            <Icon name="close" size={15} />
            撤销所选（{selected.length}）
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="全选可撤销的激活码"
                    checked={revocable.length > 0 && revocable.every((row) => selected.includes(row.id))}
                    onChange={(event) =>
                      setSelected(event.target.checked ? revocable.map((row) => row.id) : [])
                    }
                  />
                </th>
                <th>激活码</th>
                <th>状态</th>
                <th>备注</th>
                <th>绑定教师</th>
                <th className="muted">生成时间</th>
                <th className="muted">激活时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`选择尾号 ${row.code_hint}`}
                      disabled={row.status === "REVOKED"}
                      checked={selected.includes(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </td>
                  <td className="code-text">****-****-****-{row.code_hint}</td>
                  <td>
                    <Badge status={row.status} />
                    {row.revoke_reason && <small className="muted"> {row.revoke_reason}</small>}
                  </td>
                  <td>{row.remark ?? <span className="muted">—</span>}</td>
                  <td>{row.username ?? <span className="muted">暂未绑定</span>}</td>
                  <td className="muted numeric">{formatUtcToLocal(row.created_at)}</td>
                  <td className="muted numeric">{formatUtcToLocal(row.activated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !failure && items.length === 0 && (
          <EmptyState text="没有匹配的激活码" hint="点右上角「生成激活码」发放第一批。" />
        )}
        <Pager
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          loading={loading}
          unit="枚激活码"
          onChange={(value) => {
            setPage(value);
            setSelected([]);
          }}
        />
      </section>
      <p className="page-note">
        <Icon name="leaf" size={16} />
        服务端只保存激活码的哈希与末 4 位，明文只在生成时出现一次，请当场复制或下载交给教师。
      </p>

      {generating && (
        <GenerateModal
          onClose={() => setGenerating(false)}
          onGenerated={() => {
            reload();
          }}
        />
      )}
      {revoking && (
        <RevokeModal
          licenses={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={() => {
            setRevoking(null);
            setSelected([]);
            reload();
          }}
        />
      )}
      {lookupOpen && <LookupModal onClose={() => setLookupOpen(false)} />}
    </>
  );
}

function GenerateModal({ onClose, onGenerated }: { onClose: () => void; onGenerated: () => void }) {
  const [count, setCount] = useState(10);
  const [remark, setRemark] = useState("");
  // 一次生成对应一个键：失败后点重试沿用它，服务端不会重复生成
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [issued, setIssued] = useState<IssuedLicense[] | null>(null);
  const [copied, setCopied] = useState(false);

  const validCount = Number.isInteger(count) && count >= 1 && count <= LICENSE_BATCH_MAX;

  async function submit() {
    if (!validCount || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      setIssued(await issueLicenses(count, remark, idempotencyKey));
      onGenerated();
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  const plainText = issued?.map((row) => row.activation_code).join("\n") ?? "";

  async function copyAll() {
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
  }

  function download() {
    const blob = new Blob([plainText + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `激活码-${new Date().toISOString().slice(0, 10)}-${issued?.length ?? 0}枚.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function close() {
    if (issued && !window.confirm("关闭后将无法再次查看这批激活码的明文。确认已复制或下载？")) return;
    onClose();
  }

  return (
    <Modal title={issued ? "激活码已生成" : "生成激活码"} onClose={close}>
      {!issued ? (
        <>
          <label className="form-field">
            生成数量（1–{LICENSE_BATCH_MAX}）
            <input
              type="number"
              min={1}
              max={LICENSE_BATCH_MAX}
              value={Number.isNaN(count) ? "" : count}
              onChange={(event) => setCount(event.target.valueAsNumber)}
            />
          </label>
          <label className="form-field">
            备注（可选，如发给哪位老师）
            <input maxLength={100} value={remark} onChange={(event) => setRemark(event.target.value)} />
          </label>
          <ErrorNotice error={failure} />
          <div className="modal-actions">
            <button className="button secondary" disabled={submitting} onClick={onClose}>
              取消
            </button>
            <button className="button primary" disabled={!validCount || submitting} onClick={submit}>
              {submitting ? "生成中…" : failure ? "重试" : `生成 ${validCount ? count : ""} 枚`}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="notice" role="status">
            明文只显示这一次，关闭后无法再次查看。请复制或下载后交给教师。
          </p>
          <ul className="code-list" aria-label="新生成的激活码">
            {issued.map((row) => (
              <li key={row.id} className="code-text">
                {row.activation_code}
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button className="button secondary" onClick={download}>
              下载 txt
            </button>
            <button className="button secondary" onClick={() => void copyAll()}>
              <Icon name={copied ? "check" : "copy"} size={16} />
              {copied ? "已复制" : "复制全部"}
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

function RevokeModal({
  licenses,
  onClose,
  onRevoked,
}: {
  licenses: License[];
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const activeCount = licenses.filter((row) => row.status === "ACTIVE").length;
  const trimmed = reason.trim();

  async function submit() {
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await revokeLicenses(
        licenses.map((row) => row.id),
        trimmed,
      );
      onRevoked();
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`撤销 ${licenses.length} 枚激活码`} onClose={onClose}>
      <p>
        尾号：{licenses.map((row) => row.code_hint).join("、")}。撤销后<strong>不可恢复</strong>。
      </p>
      {activeCount > 0 && (
        <p className="notice" role="status">
          其中 {activeCount} 枚已激活：撤销会永久终止对应教师的云端访问。只想临时停用，请去「教师账号」页。
        </p>
      )}
      <label className="form-field">
        撤销原因（必填）
        <input maxLength={REASON_MAX} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <ErrorNotice error={failure} />
      <div className="modal-actions">
        <button className="button secondary" disabled={submitting} onClick={onClose}>
          取消
        </button>
        <button className="button primary" disabled={!trimmed || submitting} onClick={submit}>
          {submitting ? "处理中…" : "确认撤销"}
        </button>
      </div>
    </Modal>
  );
}

function LookupModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<License | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setFailure(null);
    setResult(null);
    try {
      setResult(await lookupLicense(code.trim()));
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="按完整激活码查询" onClose={onClose}>
      <label className="form-field">
        激活码
        <input
          placeholder="XXXX-XXXX-XXXX-XXXX"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
      </label>
      <ErrorNotice error={failure} />
      {result && (
        <div className="material-result">
          <p>
            尾号 <span className="code-text">{result.code_hint}</span> <Badge status={result.status} />
          </p>
          <p className="muted">
            {result.username ? `绑定教师：${result.username}` : "暂未绑定教师"} · 生成于{" "}
            {formatUtcToLocal(result.created_at)}
          </p>
        </div>
      )}
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          关闭
        </button>
        <button className="button primary" disabled={!code.trim() || submitting} onClick={submit}>
          {submitting ? "查询中…" : "查询"}
        </button>
      </div>
    </Modal>
  );
}
