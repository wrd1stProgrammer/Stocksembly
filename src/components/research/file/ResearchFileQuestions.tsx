import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import { ResearchFileSectionHeader } from "./ResearchFilePrimitives";

export function ResearchFileQuestions({
  file,
  locale,
}: {
  readonly file: ResearchFileData;
  readonly locale: Locale;
}) {
  const questions = file.anticipatedQuestions ?? [];
  if (questions.length === 0) return null;
  const ko = locale === "ko";
  return (
    <section
      className="research-editorial-section research-anticipated-qa"
      data-report-section="anticipated-qa"
      id="research-anticipated-qa"
    >
      <ResearchFileSectionHeader
        number="Q"
        title={
          ko
            ? "에이전트가 미리 답한 10가지"
            : "10 questions, answered in advance"
        }
        description={
          ko
            ? "매수 시점·과대평가·20~30% 하락 경로·판단 폐기 조건처럼 투자자가 실제로 압박할 질문에 먼저 답했습니다."
            : "Agents answer the questions investors actually press on: entry timing, priced-in expectations, drawdown paths, and thesis breakers."
        }
      />
      <div className="research-anticipated-qa__grid">
        {questions.map((item, index) => (
          <article key={item.id}>
            <header>
              <span>Q{String(index + 1).padStart(2, "0")}</span>
              <small>{item.lens[locale]}</small>
            </header>
            <h3>{item.question[locale]}</h3>
            <p>{item.answer[locale]}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
