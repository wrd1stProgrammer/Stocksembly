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
  const distinctLenses = new Set(
    visibleQuestions.flatMap((item) =>
      item.lens === undefined ? [] : [item.lens[locale]],
    ),
  );
  const showLenses = distinctLenses.size > 1;
  return (
    <section
      className="research-editorial-section research-anticipated-qa"
      data-report-section="anticipated-qa"
      data-qa-layout={compact ? "compact" : "feature"}
      id="research-anticipated-qa"
    >
      <ResearchFileSectionHeader
        number="Q"
        title={ko ? "투자자 Q&A" : "Investor Q&A"}
        description={
          ko
            ? `가격·실적·하방 위험·판단 변경 조건을 ${visibleQuestions.length}개 질문으로 정리했습니다.`
            : `${visibleQuestions.length} questions covering price, earnings, downside risk, and decision-changing evidence.`
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
              {!showLenses || item.lens === undefined ? null : (
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
