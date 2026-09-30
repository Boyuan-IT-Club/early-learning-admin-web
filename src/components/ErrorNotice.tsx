import { ApiError } from "../api/client";
import { ACCOUNT_ERROR_HINTS } from "../api/contract";

/**
 * 服务端错误的统一展示：错误码 + 服务端 message + 一句人话补充（有的话）。
 *
 * 不自行推断业务错误（AGENTS.md 第 5 节）；非 ApiError 的异常显示通用文案。
 */
export function ErrorNotice({
  error,
  hints = ACCOUNT_ERROR_HINTS,
}: {
  error: unknown;
  hints?: Record<string, string>;
}) {
  if (!error) return null;
  if (!(error instanceof ApiError)) {
    return (
      <p className="error-message" role="alert">
        操作失败，请稍后重试。
      </p>
    );
  }
  const hint = hints[error.code];
  return (
    <div className="error-message" role="alert">
      <p>
        [{error.code}] {error.message}
      </p>
      {hint && hint !== error.message && <p>{hint}</p>}
      {error.details?.field_path && <p>定位：{error.details.field_path}</p>}
      {error.details?.license_ids && <p>涉及激活码 id：{error.details.license_ids.join("、")}</p>}
    </div>
  );
}
