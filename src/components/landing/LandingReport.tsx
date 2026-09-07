"use client";

import { ArrowDown, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { AppLocale } from "../../lib/i18n";
import { researchLocale } from "../../lib/i18n";
import { TechnicalChartSnapshotSchema } from "../../research/domain/technicalChart";
import { buildResearchFileEditorialModel } from "../../research/researchFileEditorialModel";
import { CommitteeDecisionCockpit } from "../research/file/CommitteeDecisionCockpit";
import { ResearchFileQuestions } from "../research/file/ResearchFileQuestions";
import { TechnicalChartResearchPage } from "../research/file/TechnicalChartResearchPage";
import chartData from "./chartSample.json";
import { researchSample } from "./researchSample";

const chartSample = TechnicalChartSnapshotSchema.parse(chartData);

const chapters = [
  {
    section: "decision",
    ko: "위원회 판단",
    en: "Committee decision",
    detailKo:
      "최종 입장과 핵심 판단 변수, 가장 강한 반론을 한눈에. 결론을 움직인 3가지 근거와 판단 변경 조건을 확인합니다.",
    detailEn:
      "The committee’s stance, decisive variables and strongest countercase, with three key drivers and conditions for changing the view.",
  },
  {
    section: "technical-chart",
    ko: "차트 구조와 다음 움직임",
    en: "Chart structure & next move",
    detailKo:
      "주봉의 방향, 일봉의 구조, 4시간 셋업과 1시간 확인을 연결합니다. 실제 캔들 위의 지지·저항·추세선과 조건부 경로를 직접 탐색해 보세요.",
    detailEn:
      "Connect weekly context, daily structure, four-hour setups and hourly confirmation. Explore support, resistance, trend lines and conditional paths on real candles.",
  },
  {
    section: "evidence-read",
    ko: "핵심 주장 검증",
    en: "Evidence behind the claims",
    detailKo:
      "주장을 뒷받침하는 수치와 출처, 그 주장을 흔드는 반대 근거를 연결합니다. 결론이 어디에서 나왔는지 따라갈 수 있습니다.",
    detailEn:
      "Trace each thesis to its supporting metrics, sources and counterevidence. See where the conclusions come from.",
  },
  {
    section: "adjudication",
    ko: "네 팀의 판단 차이",
    en: "Four teams, different views",
    detailKo:
      "시장·기업·재무·리스크팀의 독립 판단을 나란히 비교합니다. 왜 의견이 갈렸는지, 투자자는 무엇을 확인해야 하는지까지 남깁니다.",
    detailEn:
      "Compare market, company, financial and risk positions, why they diverge, and what an investor needs to check next.",
  },
  {
    section: "scenarios",
    ko: "시장 기대와 실적 허들",
    en: "Expectations & operating hurdles",
    detailKo:
      "주가가 요구하는 기대와 실제 사업의 실행력을 비교합니다. 실적 경로와 확인 조건을 통해 좋은 기업과 좋은 가격을 함께 살펴봅니다.",
    detailEn:
      "Compare expectations embedded in price with operating delivery, financial scenarios and the evidence needed to support them.",
  },
  {
    section: "analysis",
    ko: "전문가별 추가 판단",
    en: "Specialist perspectives",
    detailKo:
      "종합 판단만으로 다 담지 못한 전문가별 관점을 읽습니다. 각 분야의 쟁점과 판단을 바꿀 조건을 더 깊게 확인할 수 있습니다.",
    detailEn:
      "Explore the additional specialist views that go beyond the committee summary, including open questions and conditions that could change each view.",
  },
  {
    section: "anticipated-qa",
    ko: "투자자 Q&A",
    en: "Investor Q&A",
    detailKo:
      "가격·실적·하방 위험에서 판단 변경 조건까지. 보고서를 읽은 뒤 생길 질문 10개와 답변으로 쟁점을 한 번 더 정리합니다.",
    detailEn:
      "Ten questions and answers revisit price, earnings, downside risks and conditions for changing the investment view.",
  },
] as const;

export default function LandingReport({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const lang = researchLocale(locale);
  const ko = lang === "ko";
  const [active, setActive] = useState(0);
  const viewport = useRef<HTMLElement>(null);
  const model = useMemo(
    () => buildResearchFileEditorialModel(researchSample.file, "en"),
    [],
  );
  const chapter = chapters[active] ?? chapters[0];
  return (
    <section
      className="landing-file landing-container"
      id="research-file"
      aria-labelledby="file-heading"
    >
      <div className="landing-section-heading">
        <div>
          <span className="landing-kicker">THE RESEARCH FILE</span>
          <h2 id="file-heading">
            {ko ? (
              <>
                결론을 읽고,
                <br />
                판단의 안쪽까지.
              </>
            ) : (
              <>
                Read the conclusion.
                <br />
                Then look inside it.
              </>
            )}
          </h2>
        </div>
        <p>
          {ko
            ? "전체 에이전트가 함께 만든 위원회 리서치. NVIDIA 보고서와 차트 분석 예시로, 받게 될 리서치를 직접 살펴보세요."
            : "A committee research file built by the whole team. Explore real NVIDIA report and chart examples, chapter by chapter."}
        </p>
      </div>
      <div className="landing-file__workspace">
        <div className="landing-file__index">
          <span className="landing-kicker">INSIDE THE REPORT</span>
          <nav aria-label={ko ? "리서치 챕터 선택" : "Report chapters"}>
            {chapters.map((item, index) => (
              <button
                type="button"
                key={item.section}
                aria-pressed={active === index}
                aria-controls="landing-file-preview"
                onClick={() => {
                  setActive(index);
                  viewport.current?.scrollTo({ top: 0 });
                }}
              >
                <span>0{index + 1}</span>
                <strong>{ko ? item.ko : item.en}</strong>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </nav>
          <p className="landing-file__description" key={active}>
            {ko ? chapter.detailKo : chapter.detailEn}
          </p>
          <p className="landing-file__appendix">
            {ko
              ? "보고서에 따라 다가오는 판단 시점도 제공하며, 하단에서 원문 출처와 근거를 확인할 수 있습니다."
              : "Reports also include upcoming decision dates when available, with original sources and evidence in the appendix."}
          </p>
          <Link
            className="landing-text-link"
            href={`/research-room/${researchSample.reportId}?lang=en`}
          >
            {ko ? "전체 보고서 열기" : "Open the full report"}
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="landing-file__surface">
          <header className="landing-file__toolbar">
            <div>
              <strong>NVDA</strong>
              <span>NVIDIA Corporation</span>
            </div>
            <span>
              {chapter.section === "technical-chart"
                ? "CHART SNAPSHOT · 2026.09.06"
                : "PUBLISHED REPORT · 2026.08.22"}
            </span>
          </header>
          <section
            ref={viewport}
            className="landing-file__viewport"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: This scrollable document needs keyboard access.
            tabIndex={0}
            aria-label={
              ko
                ? `${chapter.ko} 실제 보고서 미리보기`
                : `${chapter.en} report preview`
            }
            id="landing-file-preview"
          >
            <article
              className="research-editorial-document landing-file__document"
              data-report-surface="committee"
              data-report-theme="dark"
              lang="en"
              data-chapter={chapter.section}
            >
              {chapter.section === "technical-chart" ? (
                <TechnicalChartResearchPage
                  file={researchSample.file}
                  locale="en"
                  snapshot={chartSample}
                />
              ) : null}
              <CommitteeDecisionCockpit
                hasChartChapter
                company={researchSample.company}
                file={researchSample.file}
                model={model}
                locale="en"
              />
              <ResearchFileQuestions file={researchSample.file} locale="en" />
            </article>
          </section>
          <footer>
            <span>
              {chapter.section === "technical-chart"
                ? "Chart data as of September 6, 2026."
                : "Report data as of August 22, 2026."}
            </span>
            <span>
              Scroll to explore this chapter
              <ArrowDown size={12} />
            </span>
          </footer>
        </div>
      </div>
    </section>
  );
}
