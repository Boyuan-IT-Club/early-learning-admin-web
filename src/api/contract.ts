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
