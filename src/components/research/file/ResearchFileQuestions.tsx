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
  if (questions.length === 0) return null;
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
            ? `이 리서치의 근거로 답할 수 있는 ${visibleQuestions.length}개 질문입니다.`
            : `${visibleQuestions.length} questions answered by the evidence in this research.`
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
