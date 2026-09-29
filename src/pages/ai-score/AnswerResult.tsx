import { EmptyState } from "../../components/ui";
import type { AiTask, QuestionAiScore } from "../../api/aiScore";
import { EvidenceList } from "./Evidence";

/** 单题评分结果:QuestionAIScore 的分数、理由与证据。 */
export function AnswerResult({ task }: { task: AiTask }) {
  const result = task.result as
    | {
        question_id?: string;
        attempt?: string;
        ai_score?: QuestionAiScore;
        model_meta?: { model: string; prompt_version: string };
      }
    | undefined;
  const score = result?.ai_score;
  if (!score) {
    return (
      <section className="panel ai-panel">
        <EmptyState text="任务成功但没有评分结果" hint="这通常是服务端契约变化,请刷新后重试。" />
      </section>
    );
  }
  return (
    <section className="panel ai-panel">
      <h2 className="section-title">评分结果(QuestionAIScore)</h2>
      <p className="muted">
        题号 {result?.question_id ?? "—"}|作答时机 {result?.attempt ?? "—"}|模型{" "}
        {result?.model_meta?.model ?? "—"}|提示词 {result?.model_meta?.prompt_version ?? "—"}|评分标准{" "}
        {score.rubric_version}
      </p>
      <p>
        <strong>
          {score.score} / {score.max_score}
        </strong>
      </p>
      <p>{score.reason}</p>
      <EvidenceList evidence={score.evidence} />
    </section>
  );
}
