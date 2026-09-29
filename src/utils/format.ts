/**
 * 展示层的格式化。
 *
 * 抽出来是因为上传控件与列表都要用：两处各写一份，改一处忘一处迟早对不上。
 */
export function formatFileSize(bytes: number): string {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

/** 服务端的 created_at/updated_at 是 UTC ISO 串;列表展示转为本地时间(年-月-日 时:分)。 */
export function formatUtcToLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
