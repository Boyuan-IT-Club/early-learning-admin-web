import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LICENSE_BATCH_MAX } from "../api/contract";
import { createLicenses, listLicenses, revokeLicense } from "../api/licenses";
import type { IssuedLicense, License, LicenseStatus } from "../api/licenses";
import { ErrorNotice } from "../components/ErrorNotice";
import { Pager } from "../components/Pager";
import { usePagedQuery } from "../components/usePagedQuery";
import { Badge, EmptyState, Icon, Modal, PageHeading, SearchInput } from "../components/ui";
import { formatUtcToLocal } from "../utils/format";
import { newIdempotencyKey } from "../utils/idempotency";

/**
 * 激活码管理（契约 createLicenses / listLicenses / revokeLicense）：生成（原码只展示一次）、按状态与教师查看、撤销。
 *
 * 撤销不可恢复：撤销已激活的码会同时停用对应教师。只想临时停用，请去"教师账号"页。
 */

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<LicenseStatus, string> = { UNUSED: "待使用", ACTIVE: "已激活", REVOKED: "已撤销" };

const STATUS_TABS: Array<[LicenseStatus | "", string]> = [
  ["", "全部"],
  ["UNUSED", "待使用"],
  ["ACTIVE", "已激活"],
  ["REVOKED", "已撤销"],
];

export function Licenses() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<LicenseStatus | "">("");
  // 从"教师账号"页跳过来时带 ?user_id=，直接定位该教师的激活码
  const [userIdText, setUserIdText] = useState(() => searchParams.get("user_id") ?? "");
  const [page, setPage] = useState(1);
  const userId = parseUserId(userIdText);
  const { data, failure, loading, reload } = usePagedQuery(`${status}|${userId ?? ""}|${page}`, () =>
    listLicenses({ page, page_size: PAGE_SIZE, status: status || undefined, user_id: userId }),
  );
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState<License | null>(null);

  const items = data?.items ?? [];

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
      <ErrorNotice error={failure} />

      <section className="panel">
        <div className="panel-toolbar">
          <div className="tabs" aria-label="激活码状态">
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
            value={userIdText}
            onChange={(value) => {
              setUserIdText(value.replace(/\D/g, ""));
              setPage(1);
            }}
            placeholder="按绑定教师 ID 筛选"
          />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>状态</th>
                <th>绑定教师 ID</th>
                <th className="muted">激活时间</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className="numeric">{row.id}</td>
                  <td>
                    <Badge status={row.status} label={STATUS_LABELS[row.status]} />
                  </td>
                  <td className="numeric">{row.user_id ?? <span className="muted">暂未绑定</span>}</td>
                  <td className="muted numeric">{formatUtcToLocal(row.activated_at)}</td>
                  <td className="align-right">
                    {row.status !== "REVOKED" && (
                      <button className="text-button" onClick={() => setRevoking(row)}>
                        撤销
                      </button>
                    )}
                  </td>
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
          onChange={setPage}
        />
      </section>
      <p className="page-note">
        <Icon name="leaf" size={16} />
        服务端只保存激活码的哈希，原码只在生成时出现一次，请当场复制或下载交给教师。
      </p>

      {generating && <GenerateModal onClose={() => setGenerating(false)} onGenerated={reload} />}
      {revoking && (
        <RevokeModal
          license={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={() => {
            setRevoking(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function parseUserId(text: string): number | undefined {
  const value = Number(text);
  return text !== "" && Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

function GenerateModal({ onClose, onGenerated }: { onClose: () => void; onGenerated: () => void }) {
  const [count, setCount] = useState(10);
  // 一次生成对应一个键：失败后原样重试沿用它，服务端不会重复生成；改了数量就是另一次生成，换新键
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
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
      setIssued(await createLicenses(count, idempotencyKey));
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
    if (issued && !window.confirm("关闭后将无法再次查看这批激活码的原码。确认已复制或下载？")) return;
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
              onChange={(event) => {
                setCount(event.target.valueAsNumber);
                setIdempotencyKey(newIdempotencyKey());
              }}
            />
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
            原码只显示这一次，关闭后无法再次查看。请复制或下载后交给教师。
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
  license,
  onClose,
  onRevoked,
}: {
  license: License;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await revokeLicense(license.id);
      onRevoked();
    } catch (error) {
      setFailure(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`撤销激活码 #${license.id}`} onClose={onClose}>
      <p>
        撤销后<strong>不可恢复</strong>。
      </p>
      {license.status === "ACTIVE" && (
        <p className="notice" role="status">
          这枚码已激活：撤销会同时停用教师 #{license.user_id} 的云端访问，且之后不能再启用。
          只想临时停用，请去「教师账号」页。
        </p>
      )}
      <ErrorNotice error={failure} />
      <div className="modal-actions">
        <button className="button secondary" disabled={submitting} onClick={onClose}>
          取消
        </button>
        <button className="button primary" disabled={submitting} onClick={submit}>
          {submitting ? "处理中…" : "确认撤销"}
        </button>
      </div>
    </Modal>
  );
}
