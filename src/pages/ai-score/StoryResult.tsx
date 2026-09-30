import { EmptyState } from "../../components/ui";
import type { AiScore, AiTask, StoryContentItemScore } from "../../api/aiScore";
import { EvidenceList, HighlightedText, ScoreRow } from "./Evidence";

/** 故事评分结果:AIScore v2 的图片分组、宏观 6 项、微观 5 项与叙事产生性。 */
export function StoryResult({ task, confirmedText }: { task: AiTask; confirmedText: string }) {
  const score = (task.result as { ai_score?: AiScore }).ai_score;
  if (!score) {
    return (
      <section className="panel ai-panel">
        <EmptyState text="任务成功但没有评分结果" hint="这通常是服务端契约变化,请刷新后重试。" />
      </section>
    );
  }
  return (
    <>
      <section className="panel ai-panel">
        <h2 className="section-title">评分结果(AIScore v2)</h2>
        <p className="muted">
          模型 {score.model_meta.model}|提示词 {score.model_meta.prompt_version}|评分标准{" "}
          {score.rubric_version}|结构版本 {score.schema_version}
        </p>
        {score.summary ? <p className="notice">{score.summary}</p> : null}
        <h3 className="section-title">图片分组</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>分组 / 规则</th>
                <th>分数</th>
                <th>理由与证据</th>
              </tr>
            </thead>
            <tbody>
              {score.macrostructure.content_items.map((item: StoryContentItemScore) => (
                <tr key={item.content_item_id}>
                  <td>
                    <span className="code-text">{item.content_item_id}</span>
                    <div className="muted">{item.rubric_item_code}</div>
                  </td>
                  <td className="numeric">
                    {item.score} / {item.max_score}
                  </td>
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
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel ai-panel">
        <h3 className="section-title">宏观结构(6 项)</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>条目</th>
                <th>分数</th>
                <th>理由与证据</th>
              </tr>
            </thead>
            <tbody>
              {score.macrostructure.dimensions.map((item) => (
                <ScoreRow key={item.item_code} item={item} confirmedText={confirmedText} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel ai-panel">
        <h3 className="section-title">微观结构(5 项)</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>条目</th>
                <th>分数</th>
                <th>理由与证据</th>
              </tr>
            </thead>
            <tbody>
              {score.microstructure.dimensions.map((item) => (
                <ScoreRow key={item.item_code} item={item} confirmedText={confirmedText} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel ai-panel">
        <h3 className="section-title">叙事产生性</h3>
        <p>
          <span className="code-text">{score.microstructure.productivity.item_code}</span>{" "}
          <strong>
            {score.microstructure.productivity.score} / {score.microstructure.productivity.max_score}
          </strong>
        </p>
        <p>{score.microstructure.productivity.reason}</p>
        <p className="muted">
          四项量化统计(平均小句长度 / 形容词 / 副词 / 连词)由服务端留空:本服务没有分词与词性工具,
          让模型去数又数不准,契约允许这几项为 null,该条目以 AI 判断的 0/1/2 分为值。
        </p>
        <EvidenceList evidence={score.microstructure.productivity.evidence} />
      </section>
    </>
  );
}
