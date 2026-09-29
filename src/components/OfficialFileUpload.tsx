import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { kindOfFile, uploadOfficialFile } from "../api/files";
import type { CloudFile, CloudFileKind } from "../api/files";
import { Icon } from "./ui";
import { formatFileSize } from "../utils/format";
import { UPLOAD_ERROR_HINTS, UPLOAD_MAX_BYTES } from "../api/contract";

/**
 * 官方素材的上传控件:支持一次选择/拖入多个文件,排队逐个上传(服务端契约是单文件接口)。
 *
 * 每个文件有自己的阶段:待上传 → 传输(有百分比) → 服务端处理 → 结果。
 * 「服务端处理」是真实存在的等待:文件传完后,服务端还要落盘、嗅探、算 SHA256 并登记。
 * 单个文件失败不影响队列里其余文件;失败项可单独重试(重试沿用同一幂等键,不重复创建)。
 */

type Phase = "ready" | "uploading" | "processing" | "done" | "error";

interface UploadItem {
  key: string;
  file: File;
  kind: CloudFileKind | null;
  phase: Phase;
  progress: number;
  failure: ApiError | Error | null;
  result: CloudFile | null;
  idempotencyKey: string;
}

function validate(selected: File): Error | null {
  if (kindOfFile(selected.name) === null) {
    return new Error("只支持图片(png/jpg/gif/webp)、音频(mp3/wav/m4a/ogg/flac)与 PDF。");
  }
  if (selected.size === 0 || selected.size > UPLOAD_MAX_BYTES) {
    return new Error(`请选择非空且不超过 ${formatFileSize(UPLOAD_MAX_BYTES)} 的文件。`);
  }
  return null;
}

export function OfficialFileUpload({
  onUploaded,
}: {
  onUploaded: (file: CloudFile) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  // 队列读取最新状态:闭包里的 items 是渲染时的快照,在 effect 里同步
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = items.some((item) => item.phase === "uploading" || item.phase === "processing");
  const readyCount = items.filter((item) => item.phase === "ready").length;
  const doneItems = items.filter((item) => item.phase === "done" && item.result);

  function patch(key: string, changes: Partial<UploadItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }

  function addFiles(selected: FileList | File[]) {
    if (busy) return;
    const additions: UploadItem[] = [];
    for (const file of Array.from(selected)) {
      const kind = kindOfFile(file.name);
      const invalid = validate(file);
      additions.push({
        key: crypto.randomUUID(),
        file,
        kind,
        phase: invalid ? "error" : "ready",
        progress: 0,
        failure: invalid,
        result: null,
        // 同一个文件的重试沿用同一个标识,服务端据此不重复创建
        idempotencyKey: crypto.randomUUID(),
      });
    }
    if (additions.length > 0) setItems((current) => [...current, ...additions]);
  }

  async function uploadOne(item: UploadItem) {
    if (!item.kind) return;
    patch(item.key, { phase: "uploading", progress: 0, failure: null });
    try {
      const result = await uploadOfficialFile(
        item.file,
        item.kind,
        item.idempotencyKey,
        undefined,
        (percent) => {
          patch(item.key, {
            progress: percent,
            phase: percent >= 100 ? "processing" : "uploading",
          });
        },
      );
      if (!mounted.current) return;
      patch(item.key, { phase: "done", result });
      onUploaded(result);
    } catch (error) {
      if (!mounted.current) return;
      patch(item.key, {
        phase: "error",
        failure: error instanceof Error ? error : new Error("上传失败"),
      });
    }
  }

  /** 逐个上传:服务端按文件落盘校验,排队比并发更稳,也便于定位哪个文件出问题。 */
  async function startUpload() {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((item) => item.phase === "ready");
        if (!next) break;
        await uploadOne(next);
      }
    } finally {
      running.current = false;
    }
  }

  async function retry(key: string) {
    const item = itemsRef.current.find((entry) => entry.key === key);
    if (!item) return;
    await uploadOne(item);
  }

  function removeItem(key: string) {
    if (busy) return;
    setItems((current) => current.filter((item) => item.key !== key));
  }

  async function copyAllCodes() {
    const text = doneItems
      .map((item) => `${item.result!.file_name}\t${item.result!.file_code}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 剪贴板不可用时静默:编号始终显示在页面上,可手动复制
    }
  }

  function statusOf(item: UploadItem): string {
    switch (item.phase) {
      case "ready":
        return "待上传";
      case "uploading":
        return `传输中 ${item.progress}%`;
      case "processing":
        return "服务端处理中";
      case "done":
        return "上传成功";
      default:
        return "失败";
    }
  }

  return (
    <div className="upload-widget">
      <div
        className={`dropzone ${dragging ? "dragging" : ""} ${busy ? "is-busy" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
        }}
      >
        <span className="upload-cloud">
          <Icon name="upload" size={29} />
        </span>
        <h3>把素材拖到这里(可多选)</h3>
        <p>或选择电脑中的文件</p>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => document.getElementById("official-file-input")?.click()}
        >
          选择文件
        </button>
        <small>支持图片 / 音频 / PDF,单文件不超过 {formatFileSize(UPLOAD_MAX_BYTES)}</small>
        <input
          id="official-file-input"
          type="file"
          aria-label="选择素材文件"
          className="visually-hidden"
          tabIndex={-1}
          multiple
          accept=".png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.ogg,.flac,.pdf"
          disabled={busy}
          onChange={(event) => {
            if (event.target.files?.length) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="upload-queue">
          {items.map((item) => {
            const errorCode = item.failure instanceof ApiError ? item.failure.code : null;
            const errorHint = errorCode ? UPLOAD_ERROR_HINTS[errorCode] : undefined;
            return (
              <li className="upload-queue-item" key={item.key}>
                <div className="upload-queue-main">
                  <strong>{item.file.name}</strong>
                  <small>
                    {formatFileSize(item.file.size)} · {item.kind ?? "未知类型"}
                  </small>
                  <span>{statusOf(item)}</span>
                  {item.phase === "done" && item.result && <code>{item.result.file_code}</code>}
                  {item.failure && (
                    <small className="error-message" role={item.phase === "error" ? "alert" : undefined}>
                      {errorCode ? `[${errorCode}] ` : ""}
                      {item.failure.message}
                      {errorHint ? ` ${errorHint}` : ""}
                    </small>
                  )}
                </div>
                {item.phase === "error" && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void retry(item.key)}
                  >
                    重试
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`移除 ${item.file.name}`}
                  disabled={busy}
                  onClick={() => removeItem(item.key)}
                >
                  <Icon name="close" size={17} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="upload-actions">
        <span className="muted">素材会登记为官方文件,可在下方列表中管理。</span>
        {doneItems.length > 1 && (
          <button type="button" className="button secondary" onClick={() => void copyAllCodes()}>
            复制全部编号({doneItems.length})
          </button>
        )}
        <button
          className="button primary"
          disabled={readyCount === 0 || busy}
          onClick={() => void startUpload()}
        >
          <Icon name="upload" size={17} />
          {busy ? "上传中…" : readyCount > 0 ? `开始上传(${readyCount})` : "开始上传"}
        </button>
      </div>
    </div>
  );
}
