"use client";

import {
  ArrowDown,
  ArrowRight,
  FileCheck2,
  MessagesSquare,
  ScanLine,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { AppLocale } from "../../lib/i18n";
import { researchLocale } from "../../lib/i18n";
import { OFFICE_SCENE_MANIFEST } from "../../research/officeSceneManifest";

const departments = ["market", "company", "financial", "risk"] as const;
const labels = {
  ko: ["시장팀", "기업팀", "재무팀", "리스크팀"],
  en: ["Market", "Company", "Financial", "Risk"],
};
const stages = [
  {
    code: "INDEPENDENT RESEARCH",
    ko: "11명이, 각자의 근거로.",
    en: "Eleven independent investigations.",
    detailKo:
      "시장·기업·재무·리스크. 11명의 전문가는 서로의 결론을 보기 전, 각자 맡은 자료에서 주장과 반대 근거를 찾습니다.",
    detailEn:
      "Across market, company, financial and risk research, each specialist builds a thesis and finds counterevidence before seeing anyone else’s conclusions.",
    outputKo: "11개의 전문 메모 · 주장마다 연결된 근거",
    outputEn: "11 specialist memos · Evidence behind each claim",
  },
  {
    code: "TEAM DELIBERATION",
    ko: "팀 안에서, 의견을 맞대고.",
    en: "Bring every view to the table.",
    detailKo:
      "팀 리더가 구성원들의 메모를 모아 회의를 진행합니다. 겹치는 주장은 정리하고, 의견이 갈리는 부분은 남겨 4개 팀의 독립적인 판단을 만듭니다.",
    detailEn:
      "Each team lead brings the specialist memos together. Shared findings are consolidated while disagreements remain visible in four independent team positions.",
    outputKo: "4개의 팀 판단 · 핵심 주장과 남은 이견",
    outputEn: "4 team positions · Key claims and remaining disagreements",
  },
  {
    code: "CROSS-TEAM CHALLENGE",
    ko: "다른 팀이, 그 결론에 반론을.",
    en: "Let another team challenge it.",
    detailKo:
      "팀별 핵심 주장은 다른 팀 리더의 검토를 받습니다. 성장 논리가 재무적으로 가능한지, 리스크를 과소평가하지 않았는지. 중요한 반론은 추가 조사하고, 담당 팀이 답변과 최종 의견을 남깁니다.",
    detailEn:
      "Another team lead challenges each team’s claims. Can the numbers support the growth thesis? Have risks been understated? Material objections prompt follow-up research and a final response from the owning team.",
    outputKo: "교차 반론 → 추가 조사 → 답변·최종 투표",
    outputEn: "Challenge → Follow-up research → Response & final vote",
  },
  {
    code: "COMMITTEE SYNTHESIS",
    ko: "검증을 거쳐, 하나의 리서치로.",
    en: "Evidence becomes a research file.",
    detailKo:
      "주장과 인용 근거의 연결을 검증한 뒤, 의장이 팀들의 판단을 종합합니다. 가장 강한 반론, 해소되지 않은 이견, 다음에 판단을 바꿀 조건까지 보고서에 담습니다.",
    detailEn:
      "After claims and citations are checked, the chair synthesizes the teams’ positions, retaining the strongest countercase, unresolved disagreements and conditions that could change the view.",
    outputKo: "종합 판단 · 반대 논리 · 다음 확인 조건",
    outputEn: "Committee view · Countercase · Next decision checks",
  },
] as const;

export function LandingProcess({ locale }: { readonly locale: AppLocale }) {
  const lang = researchLocale(locale);
  const ko = lang === "ko";
  const [active, setActive] = useState(0);
  const stage = stages[active] ?? stages[0];
  return (
    <section
      className="landing-workflow landing-container"
      aria-labelledby="process-heading"
    >
      <div className="landing-section-heading">
        <div>
          <span className="landing-kicker">THE PROCESS</span>
          <h2 id="process-heading">
            {ko ? (
              <>
                좋은 결론은,
                <br />
                좋은 반론을 통과합니다.
              </>
            ) : (
              <>
                Better conclusions.
                <br />
                Built through debate.
              </>
            )}
          </h2>
        </div>
        <p>
          {ko
            ? "독립 조사에서 팀 회의, 리더 간 반론과 의장 종합까지. 하나의 질문이 리서치가 되는 과정을 따라가 보세요."
            : "From independent research to team meetings, cross-examination and the chair’s synthesis. Follow a question through the process."}
        </p>
      </div>
      <nav
        className="landing-workflow__rail"
        aria-label={ko ? "리서치 진행 단계" : "Research stages"}
      >
        {stages.map((item, index) => (
          <button
            key={item.code}
            type="button"
            aria-pressed={active === index}
            aria-controls="workflow-stage"
            onClick={() => setActive(index)}
          >
            <span>0{index + 1}</span>
            <strong>
              {
                (ko
                  ? ["독립 조사", "팀별 회의", "리더 간 반론", "검증·종합"]
                  : [
                      "Research",
                      "Team meetings",
                      "Cross-examination",
                      "Synthesis",
                    ])[index]
              }
            </strong>
            <ArrowRight size={16} />
          </button>
        ))}
      </nav>
      <div className="landing-workflow__stage" id="workflow-stage">
        <div className="landing-workflow__explanation" key={`text-${active}`}>
          <span className="landing-workflow__index">
            0{active + 1}
            <small>/ 04</small>
          </span>
          <p className="landing-kicker">{stage.code}</p>
          <h3>{ko ? stage.ko : stage.en}</h3>
          <p>{ko ? stage.detailKo : stage.detailEn}</p>
          <div className="landing-workflow__output">
            <FileCheck2 size={17} />
            <span>{ko ? stage.outputKo : stage.outputEn}</span>
          </div>
        </div>
        <section
          className="landing-workflow__diagram"
          key={`diagram-${active}`}
          data-stage={active}
          aria-label={ko ? "에이전트 협업 흐름" : "Agent collaboration diagram"}
        >
          <div className="landing-workflow__diagram-label">
            <span>{ko ? "하나의 투자 질문" : "ONE INVESTMENT QUESTION"}</span>
            <ArrowDown size={14} />
            <span>{stage.code}</span>
          </div>
          {active < 2 ? (
            <div className="landing-workflow__teams">
              {departments.map((department, index) => (
                <div
                  className="landing-workflow__team"
                  key={department}
                  data-team={department}
                >
                  <header>
                    <span>0{index + 1}</span>
                    <strong>{labels[lang][index]}</strong>
                  </header>
                  <div className="landing-workflow__members">
                    {OFFICE_SCENE_MANIFEST.roster
                      .filter((member) => member.departmentId === department)
                      .map((member) => (
                        <div key={member.id}>
                          <Image
                            src={`/research/office-v7/portraits/${member.id}.png`}
                            alt=""
                            width={44}
                            height={44}
                          />
                          <span>{member.name[lang]}</span>
                          {active === 0 ? (
                            <small>{member.role[lang]}</small>
                          ) : null}
                        </div>
                      ))}
                  </div>
                  {active === 1 ? (
                    <div className="landing-workflow__meeting">
                      <MessagesSquare size={18} />
                      <span>
                        {ko
                          ? "근거 비교 · 이견 토론"
                          : "Evidence & disagreements"}
                      </span>
                      <ArrowDown size={13} />
                      <strong>{ko ? "팀의 독립 판단" : "Team position"}</strong>
                    </div>
                  ) : (
                    <div
                      className="landing-workflow__memo-lines"
                      aria-hidden="true"
                    >
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : active === 2 ? (
            <div className="landing-workflow__challenges">
              {[
                [
                  "market",
                  "financial",
                  ko
                    ? "가격에 담긴 기대를 숫자가 뒷받침하는가?"
                    : "Do the numbers support priced-in expectations?",
                ],
                [
                  "company",
                  "risk",
                  ko
                    ? "경쟁력이 이 위험을 상쇄할 수 있는가?"
                    : "Can business strength offset this risk?",
                ],
                [
                  "financial",
                  "company",
                  ko
                    ? "성장 논리는 현금흐름으로 이어지는가?"
                    : "Does the growth thesis convert to cash flow?",
                ],
                [
                  "risk",
                  "market",
                  ko
                    ? "시장 시나리오가 놓친 하방은 무엇인가?"
                    : "What downside is missing from the market case?",
                ],
              ].map(([from, to, question]) => (
                <div key={from}>
                  <Image
                    src={`/research/office-v7/portraits/${from}.png`}
                    alt={from ?? ""}
                    width={44}
                    height={44}
                  />
                  <div>
                    <span>
                      {
                        labels[lang][
                          departments.indexOf(
                            from as (typeof departments)[number],
                          )
                        ]
                      }{" "}
                      <ArrowRight size={12} />{" "}
                      {
                        labels[lang][
                          departments.indexOf(
                            to as (typeof departments)[number],
                          )
                        ]
                      }
                    </span>
                    <p>{question}</p>
                  </div>
                  <Image
                    src={`/research/office-v7/portraits/${to}.png`}
                    alt={to ?? ""}
                    width={36}
                    height={36}
                  />
                </div>
              ))}
              <small>
                {ko
                  ? "팀별 검토 방향을 설명하는 예시입니다."
                  : "Illustrative questions showing each team’s review lens."}
              </small>
            </div>
          ) : (
            <div className="landing-workflow__synthesis">
              <div className="landing-workflow__leaders">
                {departments.map((department) => (
                  <Image
                    key={department}
                    src={`/research/office-v7/portraits/${department}.png`}
                    alt=""
                    width={48}
                    height={48}
                  />
                ))}
              </div>
              <div className="landing-workflow__converge" aria-hidden="true" />
              <span className="landing-workflow__audit">
                <ScanLine size={16} />
                {ko ? "주장과 근거 검증" : "Claim & evidence checks"}
              </span>
              <ArrowDown size={18} />
              <Image
                src="/research/office-v7/portraits/chair.png"
                alt={ko ? "리서치 의장" : "Research chair"}
                width={64}
                height={64}
              />
              <strong>{ko ? "의장의 종합" : "Chair’s synthesis"}</strong>
              <div className="landing-workflow__verdicts">
                {(ko
                  ? ["최종 판단", "가장 강한 반론", "판단 변경 조건"]
                  : [
                      "Committee view",
                      "Strongest countercase",
                      "Conditions for change",
                    ]
                ).map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
