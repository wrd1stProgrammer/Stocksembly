import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import { ResearchFileSectionHeader } from "./ResearchFilePrimitives";

export function ResearchFileQuestions({
  file,
  locale,
  compact = false,
}: {
  readonly file: ResearchFileData;
  readonly locale: Locale;
  readonly compact?: boolean;
}) {
  const questions = file.anticipatedQuestions ?? [];
  const persisted = file.presentationVersion === "workflow-v2";
  if (questions.length === 0 || (persisted && questions.length < 5))
    return null;
  const rankedQuestions = [...questions].sort(
    (first, second) => (first.rank ?? 100) - (second.rank ?? 100),
  );
  const visibleQuestions = rankedQuestions.slice(0, 10);
  const ko = locale === "ko";
  return (
    <section
      className="research-editorial-section research-anticipated-qa"
      data-report-section="anticipated-qa"
      data-qa-layout={compact ? "compact" : "feature"}
      id="research-anticipated-qa"
    >
      <ResearchFileSectionHeader
        number="Q"
        title={
          ko
            ? `에이전트가 미리 답한 ${questions.length}가지`
            : `${questions.length} questions, answered in advance`
        }
        description={
          ko
            ? "매수 시점·과대평가·20~30% 하락 경로·판단 폐기 조건처럼 투자자가 실제로 압박할 질문에 먼저 답했습니다."
            : "Agents answer the questions investors actually press on: entry timing, priced-in expectations, drawdown paths, and thesis breakers."
        }
      />
      <div
        className={
          compact ? "research-team-qa-list" : "research-anticipated-qa__grid"
        }
      >
        {visibleQuestions.map((item, index) => (
          <article key={item.id}>
            <header>
              <span>Q{String(index + 1).padStart(2, "0")}</span>
              {item.lens === undefined ? null : (
                <small>{item.lens[locale]}</small>
              )}
            </header>
            <h3>{item.question[locale]}</h3>
            <p>{item.answer[locale]}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
