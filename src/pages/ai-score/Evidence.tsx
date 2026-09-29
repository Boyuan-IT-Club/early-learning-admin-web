import type { Evidence, ScoreItem } from "../../api/aiScore";

/**
 * 证据的展示:引文列表 + 在原话里的高亮定位。
 * 偏移是服务端定位的结果,客户端只展示、不重算。
 */

/** 把若干证据偏移合并成不重叠的区间,用来在原文里高亮。 */
function highlightRanges(text: string, evidence: Evidence[]): Array<[number, number]> {
  const ranges = evidence
    .map((item) => [item.start_offset, item.end_offset] as [number, number])
    .filter(([start, end]) => start >= 0 && end > start && end <= text.length)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

export function HighlightedText({ text, evidence }: { text: string; evidence: Evidence[] }) {
  const ranges = highlightRanges(text, evidence);
  if (ranges.length === 0) {
    return <span>{text}</span>;
  }
  const parts: Array<string | { mark: string }> = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push({ mark: text.slice(start, end) });
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return (
    <span>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : (
          <mark key={index} className="evidence-mark">
            {part.mark}
          </mark>
        ),
      )}
    </span>
  );
}

/** 一条证据:引文 + 偏移(服务端定位的结果,客户端只展示)。 */
export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) {
    return <p className="muted">没有引用原文片段(服务端允许空证据)。</p>;
  }
  return (
    <ul className="evidence-list">
      {evidence.map((item, index) => (
        <li key={index}>
          「{item.text}」<span className="muted">[{item.start_offset}, {item.end_offset})</span>
        </li>
      ))}
    </ul>
  );
}

export function ScoreRow({ item, confirmedText }: { item: ScoreItem; confirmedText: string }) {
  return (
    <tr>
      <td>
        <span className="code-text">{item.item_code}</span>
        {item.item_name ? <div className="muted">{item.item_name}</div> : null}
      </td>
      <td className="numeric">{item.score} / {item.max_score}</td>
      <td>
        {item.reason}
        <EvidenceList evidence={item.evidence} />
        <details>
          <summary className="muted">在原话里的位置</summary>
          <p className="evidence-quote">
            <HighlightedText text={confirmedText} evidence={item.evidence} />
          </p>
        </details>
      </td>
    </tr>
  );
}
