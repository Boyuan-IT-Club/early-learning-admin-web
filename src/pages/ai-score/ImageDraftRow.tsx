import type { AdminFile } from "../../api/files";
import type { DraftImage } from "./types";

/**
 * 一张图片草稿的输入行:本机选图(浏览器内转 base64)或选已上传素材(按编号取图)。
 */
export function ImageDraftRow({
  draft, onChange, onRemove, index, materials, busy,
}: {
  draft: DraftImage;
  onChange: (next: DraftImage) => void;
  onRemove: () => void;
  index: number;
  materials: AdminFile[];
  busy: boolean;
}) {
  const fileInputId = `ai-file-${draft.key}`;
  return (
    <div className="ai-image-row" key={draft.key}>
      <select
        aria-label={`第 ${index + 1} 张图片的来源`}
        value={draft.mode}
        onChange={(event) =>
          onChange({ ...draft, mode: event.target.value as DraftImage["mode"], file: null, material: null })
        }
      >
        <option value="local">本机图片(浏览器内转 base64)</option>
        <option value="material">已上传素材(按编号取图)</option>
      </select>
      {draft.mode === "local" ? (
        <>
          {/* 原生 input 直接露出来会和后台其余控件不是一套;沿用素材上传页的做法:藏起来 + 一个按钮触发 */}
          <input
            id={fileInputId}
            type="file"
            className="visually-hidden"
            tabIndex={-1}
            accept="image/jpeg,image/png,image/webp"
            aria-label={`第 ${index + 1} 张图片文件`}
            onChange={(event) => {
              onChange({ ...draft, file: event.target.files?.[0] ?? null });
              event.target.value = "";
            }}
          />
          <label className="button secondary" htmlFor={fileInputId}>
            选择图片
          </label>
          <span className="muted">{draft.file ? draft.file.name : "未选择文件"}</span>
        </>
      ) : (
        <select
          aria-label={`第 ${index + 1} 张图片素材`}
          value={draft.material?.file_code ?? ""}
          onChange={(event) =>
            onChange({
              ...draft,
              material: materials.find((item) => item.file_code === event.target.value) ?? null,
            })
          }
        >
          <option value="">
            {materials.length === 0 ? "暂无可用素材(先到「官方素材」上传)" : "选择已上传的图片"}
          </option>
          {materials.map((item) => (
            <option key={item.file_code} value={item.file_code}>
              {item.file_name}({item.file_code})
            </option>
          ))}
        </select>
      )}
      <button type="button" className="button text-button" disabled={busy} onClick={onRemove}>
        移除
      </button>
    </div>
  );
}
