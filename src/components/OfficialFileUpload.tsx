import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { kindOfFile, uploadOfficialFile } from "../api/files";
import type { CloudFile } from "../api/files";
import { Icon } from "./ui";
import { formatFileSize } from "../utils/format";

/**
 * 官方素材的真实上传控件（零散素材：图片 / 音频 / PDF）。
 *
 * 内容页那个 `FileUpload` 是演示控件（材料整包发布接口还没有），两者视觉一致、行为不同：
 * 这里发真实请求，进度来自传输事件，结果与错误都来自服务端。
 *
 * 三阶段与演示控件一致：选择 → 传输（有百分比）→ 处理（传输完成、等响应）→ 结果。
 * 「处理」这一段是真实存在的：文件传完到服务端落盘校验完返回 READY，中间没有进度可报。
 */

import { UPLOAD_ERROR_HINTS, UPLOAD_MAX_BYTES } from "../api/contract";

type Phase = "idle" | "uploading" | "processing" | "done" | "error";

export function OfficialFileUpload({
  onUploaded,
}: {
  onUploaded: (file: CloudFile) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<ApiError | Error | null>(null);
  const [uploaded, setUploaded] = useState<CloudFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const idempotencyKey = useRef<string>("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = phase === "uploading" || phase === "processing";
  const fileKind = file ? kindOfFile(file.name) : null;

  function reset() {
    setFile(null);
    setPhase("idle");
    setProgress(0);
    setFailure(null);
    setUploaded(null);
  }

  function choose(selected: File) {
    if (busy) return;
    setFailure(null);
    setUploaded(null);
    setProgress(0);
    setPhase("idle");

    if (kindOfFile(selected.name) === null) {
      setFile(null);
      setFailure(new Error("只支持图片（png/jpg/gif/webp）、音频（mp3/wav/m4a/ogg/flac）与 PDF。"));
      return;
    }
    if (selected.size === 0 || selected.size > UPLOAD_MAX_BYTES) {
      setFile(null);
      setFailure(new Error(`请选择非空且不超过 ${formatFileSize(UPLOAD_MAX_BYTES)} 的文件。`));
      return;
    }
    setFile(selected);
    // 同一个文件的重发必须沿用同一个标识，服务端据此不重复创建
    idempotencyKey.current = crypto.randomUUID();
  }

  async function submit() {
    if (!file || !fileKind) return;
    setPhase("uploading");
    setProgress(0);
    try {
      const result = await uploadOfficialFile(
        file,
        fileKind,
        idempotencyKey.current,
        undefined,
        (percent) => {
          setProgress(percent);
          if (percent >= 100) {
            // 传输完成，剩下的是服务端落盘、嗅探、算 SHA256 与写记录
            setPhase("processing");
          }
        },
      );
      if (!mounted.current) return;
      setUploaded(result);
      setPhase("done");
      onUploaded(result);
    } catch (error) {
      if (!mounted.current) return;
      setFailure(error instanceof Error ? error : new Error("上传失败"));
      setPhase("error");
    }
  }

  const errorCode = failure instanceof ApiError ? failure.code : null;
  const errorHint = errorCode ? UPLOAD_ERROR_HINTS[errorCode] : undefined;

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
          if (busy) return;
          if (event.dataTransfer.files.length > 1) {
            setFailure(new Error("请一次选择一个文件。"));
            return;
          }
          const selected = event.dataTransfer.files[0];
          if (selected) choose(selected);
        }}
      >
        <span className="upload-cloud">
          <Icon name="upload" size={29} />
        </span>
        <h3>把素材拖到这里</h3>
        <p>或选择电脑中的文件</p>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          选择文件
        </button>
        <small>支持图片 / 音频 / PDF，单文件不超过 {formatFileSize(UPLOAD_MAX_BYTES)}</small>
        <input
          ref={input}
          type="file"
          aria-label="选择素材文件"
          className="visually-hidden"
          tabIndex={-1}
          accept=".png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.ogg,.flac,.pdf"
          disabled={busy}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) choose(selected);
            event.target.value = "";
          }}
        />
      </div>

      {failure && phase !== "done" && (
        <p className="error-message" role="alert">
          {errorCode ? `[${errorCode}] ` : ""}
          {failure.message}
          {errorHint ? ` ${errorHint}` : ""}
        </p>
      )}

      {file && (
        <div className="selected-file">
          <span className="file-icon">
            <Icon name="file" />
          </span>
          <div>
            <strong>{file.name}</strong>
            <small>
              {formatFileSize(file.size)} · {fileKind}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="移除文件"
            disabled={busy}
            onClick={reset}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      )}

      <div className="upload-actions">
        <span className="muted">素材会登记为官方文件，可在下方列表中管理。</span>
        <button
          className="button primary"
          disabled={!file || busy}
          onClick={submit}
        >
          <Icon name="upload" size={17} />
          {busy ? "上传中…" : "开始上传"}
        </button>
      </div>

      <div aria-live="polite">
        {busy && (
          <div className="upload-progress">
            <div>
              <span>
                {phase === "uploading" ? "文件传输中" : "服务端处理中"}
              </span>
              <strong>
                {phase === "uploading" ? `${progress}%` : "请稍候…"}
              </strong>
            </div>
            <progress aria-label="上传进度" max="100" value={progress} />
            <p>传输完成后，服务端还要落盘、校验并登记，才会返回结果。</p>
          </div>
        )}
        {phase === "done" && uploaded && (
          <div className="result-box success-result">
            <Icon name="check" size={22} />
            <div>
              <strong>上传成功</strong>
              <p>
                {uploaded.file_name} · {uploaded.file_kind} · {uploaded.status}
              </p>
              <code>{uploaded.file_code}</code>
            </div>
          </div>
        )}
        {phase === "error" && failure instanceof ApiError && (
          <div className="result-box error-result">
            <Icon name="file" size={22} />
            <div>
              <strong>上传失败</strong>
              {errorCode && <code>{errorCode}</code>}
              <p>{failure.message}</p>
              {failure.details?.field_path && (
                <small>出错位置：{failure.details.field_path}</small>
              )}
              {errorHint && <small>{errorHint}</small>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
