import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";
import { contentInfo } from "../demo/data";
import type { ContentKind } from "../demo/data";
type Phase = "idle" | "uploading" | "processing" | "success" | "error";
export function FileUpload({ kind }: { kind: ContentKind }) {
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState("success");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = phase === "uploading" || phase === "processing";
  useEffect(() => {
    if (phase !== "uploading") return;
    const timer = window.setInterval(
      () => setProgress((value) => Math.min(value + 20, 100)),
      150,
    );
    return () => window.clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== "uploading" || progress !== 100) return;
    const timer = window.setTimeout(() => setPhase("processing"), 200);
    return () => window.clearTimeout(timer);
  }, [phase, progress]);
  useEffect(() => {
    if (phase !== "processing") return;
    const timer = window.setTimeout(
      () => setPhase(outcome === "success" ? "success" : "error"),
      800,
    );
    return () => window.clearTimeout(timer);
  }, [phase, outcome]);
  function choose(selected: File) {
    if (busy) return;
    setPhase("idle");
    setError("");
    setProgress(0);
    setFile(null);
    if (!/\.(zip|json)$/i.test(selected.name)) {
      setError("演示仅接受 ZIP 或 JSON 文件，请重新选择。");
      return;
    }
    if (selected.size === 0 || selected.size > 50 * 1024 * 1024) {
      setError("请选择非空且不超过 50 MB 的文件（演示限制）。");
      return;
    }
    setFile({ name: selected.name, size: selected.size });
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
          if (busy) return;
          if (event.dataTransfer.files.length > 1) {
            setError("请一次选择一个文件。");
            return;
          }
          const selected = event.dataTransfer.files[0];
          if (selected) choose(selected);
        }}
      >
        <span className="upload-cloud">
          <Icon name="upload" size={29} />
        </span>
        <h3>把材料拖到这里</h3>
        <p>或选择电脑中的文件</p>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          选择文件
        </button>
        <small>演示支持 ZIP / JSON，单文件不超过 50 MB</small>
        <input
          ref={input}
          type="file"
          aria-label="选择材料文件"
          className="visually-hidden"
          tabIndex={-1}
          accept=".zip,.json"
          disabled={busy}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) choose(selected);
            event.target.value = "";
          }}
        />
      </div>
      <button
        className="text-button sample-button"
        disabled={busy}
        onClick={() => {
          setFile({ name: contentInfo[kind].file, size: 2457600 });
          setError("");
          setPhase("idle");
          setProgress(0);
        }}
      >
        没有文件？使用示例材料
        <Icon name="arrow" size={15} />
      </button>
      {error && (
        <p className="error-message" role="alert">
          {error}
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
              {file.size >= 1048576
                ? `${(file.size / 1048576).toFixed(1)} MB`
                : `${Math.ceil(file.size / 1024)} KB`}{" "}
              · 仅在本地选择
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="移除文件"
            disabled={busy}
            onClick={() => {
              setFile(null);
              setPhase("idle");
              setProgress(0);
              setError("");
            }}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      )}
      <div className="upload-actions">
        <label>
          演示结果
          <select
            aria-label="演示结果"
            disabled={busy}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          >
            <option value="success">成功示例</option>
            <option value="error">失败示例</option>
          </select>
        </label>
        <button
          className="button primary"
          disabled={!file || busy || !!error}
          onClick={() => {
            setProgress(0);
            setPhase("uploading");
          }}
        >
          <Icon name="upload" size={17} />
          {busy ? "演示进行中…" : "模拟上传"}
        </button>
      </div>
      <div aria-live="polite">
        {busy && (
          <div className="upload-progress">
            <div>
              <span>
                {phase === "uploading" ? "模拟文件传输中" : "模拟后端处理中"}
              </span>
              <strong>
                {phase === "uploading" ? `${progress}%` : "请稍候…"}
              </strong>
            </div>
            <progress aria-label="模拟上传进度" max="100" value={progress} />
            <p>传输完成后，仍需等待导入结果。</p>
          </div>
        )}
        {phase === "success" && (
          <div className="result-box success-result">
            <Icon name="check" size={22} />
            <div>
              <strong>导入成功 · 演示结果</strong>
              <p>「{file?.name}」的上传流程体验已完成。</p>
              <small>这是预设成功反馈，未上传、解析或保存实际材料。</small>
            </div>
          </div>
        )}
        {phase === "error" && (
          <div className="result-box error-result">
            <Icon name="file" size={22} />
            <div>
              <strong>导入失败 · 演示结果</strong>
              <p>RESOURCE_NOT_FOUND</p>
              <code>activities[2].image_file_code</code>
              <p>引用的文件 img_003 不存在</p>
              <small>
                预设错误示例，与所选文件内容无关。可切换成功示例后重试。
              </small>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
