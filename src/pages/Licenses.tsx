import { useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import {
  Badge,
  EmptyState,
  Icon,
  Modal,
  PageHeading,
  SearchInput,
} from "../components/ui";
import type { License } from "../demo/data";
export function Licenses({
  licenses,
  onChange,
}: {
  licenses: License[];
  onChange: Dispatch<SetStateAction<License[]>>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [notice, setNotice] = useState("");
  const [generated, setGenerated] = useState<License[]>([]);
  const rows = licenses.filter(
    (row) =>
      (status === "ALL" || row.status === status) &&
      `${row.code} ${row.teacher ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  function generate(event: FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(count) || count < 1 || count > 20) return;
    const result: License[] = Array.from({ length: count }, (_, index) => ({
      id: `demo-${licenses.length + index + 1}`,
      code: `DEMO-2026-${String(licenses.length + index + 1).padStart(4, "0")}`,
      status: "UNUSED",
      teacher: null,
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    }));
    onChange((previous) => [...result, ...previous]);
    setGenerated(result);
    setNotice(`已生成 ${count} 个示例激活码，仅用于界面演示。`);
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("已复制示例激活码。");
    } catch {
      setNotice("浏览器暂不支持自动复制，请选中激活码文字手动复制。");
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ACCESS & CONNECTION"
        title="激活码管理"
        description="为教师开启一段新的支持旅程。"
        action={
          <button
            className="button primary"
            onClick={() => {
              setGenerated([]);
              setCount(1);
              setOpen(true);
            }}
          >
            <Icon name="plus" size={18} />
            生成激活码
          </button>
        }
      />
      <div className="intro-banner">
        <div className="banner-icon">
          <Icon name="key" size={27} />
        </div>
        <div>
          <strong>一枚激活码，一份成长的支持</strong>
          <p>生成后将激活码交给教师，用于教师端首次注册。</p>
        </div>
        <span className="banner-decoration" aria-hidden="true">
          ✳
        </span>
      </div>
      <div className="stats-row">
        {(
          [
            { key: "ALL", label: "全部激活码", icon: "key" },
            { key: "UNUSED", label: "待使用", icon: "clipboard" },
            { key: "ACTIVE", label: "已激活", icon: "users" },
          ] as const
        ).map((item) => (
          <div
            className={`stat-card stat-${item.key.toLowerCase()}`}
            key={item.key}
          >
            <div>
              <span>{item.label}</span>
              <strong>
                {item.key === "ALL"
                  ? licenses.length
                  : licenses.filter((row) => row.status === item.key).length}
                <small>枚</small>
              </strong>
            </div>
            <span className="stat-icon">
              <Icon name={item.icon} size={23} />
            </span>
          </div>
        ))}
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <section className="panel">
        <div className="panel-toolbar">
          <div className="tabs" aria-label="激活码状态">
            {[
              ["ALL", "全部"],
              ["UNUSED", "待使用"],
              ["ACTIVE", "已激活"],
              ["REVOKED", "已撤销"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={status === value}
                className={status === value ? "selected" : ""}
                onClick={() => setStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="搜索激活码或教师"
          />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>激活码</th>
                <th>状态</th>
                <th>绑定教师</th>
                <th>创建时间</th>
                <th className="align-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="code-text">{row.code}</span>
                  </td>
                  <td>
                    <Badge status={row.status} />
                  </td>
                  <td>
                    {row.teacher ?? <span className="muted">暂未绑定</span>}
                  </td>
                  <td className="muted numeric">{row.createdAt}</td>
                  <td className="align-right">
                    <button
                      className="text-button"
                      aria-label={`复制 ${row.code}`}
                      onClick={() => void copy(row.code)}
                    >
                      <Icon name="copy" size={15} />
                      复制
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState />}
        <div className="table-footer">
          <span>共 {rows.length} 条记录</span>
          <span>所有激活码均为演示示例</span>
        </div>
      </section>
      <p className="page-note">
        <Icon name="leaf" size={16} />
        真实激活码由服务端生成；这里的示例不具备激活能力，刷新页面后重置。
      </p>
      {open && (
        <Modal
          title={generated.length ? "示例激活码已准备好" : "生成示例激活码"}
          onClose={() => setOpen(false)}
        >
          {generated.length ? (
            <>
              <p className="muted">以下内容仅用于体验复制与分发流程。</p>
              <div className="generated-codes">
                {generated.map((row) => (
                  <code key={row.id}>{row.code}</code>
                ))}
              </div>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setOpen(false)}
                >
                  完成
                </button>
                <button
                  className="button primary"
                  onClick={() =>
                    void copy(generated.map((row) => row.code).join("\n"))
                  }
                >
                  <Icon name="copy" size={16} />
                  复制全部
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={generate}>
              <p className="muted">
                体验单个或批量生成，生成结果会加入当前列表。
              </p>
              <label className="form-field">
                生成数量
                <input
                  type="number"
                  min="1"
                  max="20"
                  step="1"
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                  required
                />
                <small>演示范围：1–20 枚；正式规则待接口确定。</small>
              </label>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  取消
                </button>
                <button className="button primary" type="submit">
                  生成示例
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
