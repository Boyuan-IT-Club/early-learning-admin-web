/**
 * 服务端契约的唯一镜像：与后端默认值、失败码保持一致的地方只允许写在这一个文件。
 *
 * 这里只是"让用户界面能在提交前给出正确提示"的副本；服务端永远是权威，
 * 以后端配置与错误码为准（见 `easy-learning-server` 的 `application.yaml` 与各错误码枚举）。
 */

/** 与后端 `ai.llm.ecnu.max-image-bytes` 默认值一致；真实限制以服务端为准（它是权威）。 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 契约只接受 jpeg/png/webp（不认 gif，也不能用 files.ts 的 kindOfFile）。 */
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(mime);
}

/** 与服务端默认上限一致（`storage.upload.max-size-bytes`，默认 500MB）；服务端仍为准。 */
export const UPLOAD_MAX_BYTES = 500 * 1024 * 1024;

/** AI 任务失败码 → 人能看懂的下一步；表里没有的码只显示服务端 message。 */
export const AI_FAILURE_HINTS: Record<string, string> = {
  MODEL_TIMEOUT: "模型调用超时。可点「重试」按原输入重试。",
  MODEL_OUTPUT_INVALID: "模型输出未通过校验。重试即可；仍失败请换一组材料。",
  RUBRIC_UNAVAILABLE: "评分标准版本不可用，请确认服务端的评分标准配置。",
  PROCESS_RESTARTED: "服务端重启导致本次结果丢失（任务只在内存里），请重新提交。",
  RESULT_EXPIRED: "结果已过期，请重新提交。",
  TASK_TIMEOUT: "任务排队或执行超时，可重试。",
  TASK_NOT_FOUND: "任务元数据已被清理，请用新的请求标识重新提交。",
};

/** 素材上传失败码 → 人话补充。表里没有的码直接显示服务端 message。 */
export const UPLOAD_ERROR_HINTS: Record<string, string> = {
  PAYLOAD_TOO_LARGE: "文件超过服务端允许的上限，请压缩后再传。",
  UNSUPPORTED_MEDIA_TYPE: "服务端不接受这种类型的素材。",
  CONTENT_TYPE_MISMATCH: "文件内容与它的类型不符——请确认素材本身没有被改过后缀。",
  IDEMPOTENCY_CONFLICT: "同一个请求标识已经提交过别的文件，请重新选择后再传。",
  INVALID_REQUEST: "服务端认为本次请求不合法，请检查文件名与类型。",
  DEPENDENCY_UNAVAILABLE: "服务端依赖暂不可用（对象存储等），请稍后重试。",
};

/** 账号与鉴权失败码 → 人话补充（管理员登录、激活码、教师管理共用）。表里没有的码只显示服务端 message。 */
export const ACCOUNT_ERROR_HINTS: Record<string, string> = {
  INVALID_CREDENTIALS: "账号或密码不正确。",
  ACCOUNT_DISABLED: "该管理员账号已被停用，请联系其他管理员。",
  RATE_LIMITED: "尝试次数过多，请稍后再试（连续输错 5 次会锁定 15 分钟）。",
  LICENSE_UNAVAILABLE: "所选激活码中有不存在或已撤销的，操作已整体取消。",
  SENSITIVE_RESULT_EXPIRED: "生成结果已超过 10 分钟不能再次查看。这批码未交付，请整批撤销后重新生成。",
  ADMIN_LAST_ACTIVE: "不能停用自己，系统中至少要保留一个可用管理员。",
  USERNAME_EXISTS: "用户名已被占用。",
  RESOURCE_NOT_FOUND: "记录已不存在，请刷新列表。",
  DEPENDENCY_UNAVAILABLE: "服务端鉴权存储暂不可用，请稍后重试。",
};

/** 与服务端 `AdminAccount` 的密码规则一致：10–72 字节（BCrypt 只取前 72 字节）。服务端仍为准。 */
export const ADMIN_PASSWORD_MIN = 10;

/** 与服务端一次批量生成的上限一致。 */
export const LICENSE_BATCH_MAX = 200;

/** 与服务端操作原因的长度上限一致。 */
export const REASON_MAX = 200;
