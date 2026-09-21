import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
export type IconName =
  | "leaf"
  | "key"
  | "users"
  | "book"
  | "clipboard"
  | "dictionary"
  | "usage"
  | "arrow"
  | "plus"
  | "search"
  | "copy"
  | "upload"
  | "file"
  | "check"
  | "logout"
  | "close"
  | "menu";
const paths: Record<IconName, ReactNode> = {
  leaf: (
    <>
      <path d="M19 4c-7-1-13 2-13 8a6 6 0 0 0 6 6c6 0 8-7 7-14Z" />
      <path d="M4 21 15 10M9 16v-5m0 5h5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="9" r="4" />
      <path d="m11 12 9 9m-5-5 3-3m0 6 3-3" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5" />
    </>
  ),
  book: (
    <path d="M12 6C9 3 4 4 2 5v14c3-1 7-1 10 1 3-2 7-2 10-1V5c-2-1-7-2-10 1Zm0 0v14" />
  ),
  clipboard: (
    <>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <rect x="9" y="2" width="6" height="5" rx="1" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  dictionary: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 3v18m3-7 3-6 3 6m-5-2h4" />
    </>
  ),
  usage: <path d="M4 3v17h17M9 15v-5m5 5V6m5 9v-3" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M15 8V3H3v13h5" />
    </>
  ),
  upload: <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />,
  file: <path d="M14 2H5v20h14V7Zm0 0v5h5M9 12h6m-6 4h6" />,
  check: <path d="m5 12 4 4L19 6" />,
  logout: <path d="M10 3H4v18h6m-1-9h12m-4-4 4 4-4 4" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <Icon name="leaf" size={27} />
      </span>
      <div>
        <strong>初芽</strong>
        <span>早期筛查与干预 · 管理端</span>
      </div>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    UNUSED: "待使用",
    ACTIVE: "已激活",
    REVOKED: "已撤销",
    INACTIVE: "未激活",
    READY: "可用",
  };
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      <i />
      {labels[status] ?? status}
    </span>
  );
}
export function EmptyState({
  text = "没有找到匹配的记录",
  hint = "试试其他关键词或筛选条件。",
}: {
  text?: string;
  hint?: string;
}) {
  return (
    <div className="empty-state">
      <Icon name="search" size={30} />
      <strong>{text}</strong>
      <p>{hint}</p>
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-field">
      <Icon name="search" size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={onClose}
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
