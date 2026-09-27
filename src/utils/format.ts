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
