"use client";

import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Fingerprint,
  Link2,
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import type { AppLocale } from "../lib/i18n";
import { copy, researchLocale } from "../lib/i18n";
import { OFFICE_SCENE_MANIFEST } from "../research/officeSceneManifest";
import { LandingOfficePreview } from "./LandingOfficePreview";
import { LandingProcess } from "./landing/LandingProcess";
import { LandingResearchRoomPreview } from "./researchRoom/LandingResearchRoomPreview";

const LandingReport = dynamic(() => import("./landing/LandingReport"));
const LandingBriefing = dynamic(() => import("./landing/LandingBriefing"));

import type { LandingResearchRoomPreviewData } from "./researchRoom/landingResearchRoomPreviewSelection";

type Props = { readonly locale: AppLocale };
const teams = ["market", "company", "financial", "risk"] as const;
const teamCopy = {
  ko: [
    {
      name: "시장팀",
      discipline: "MARKET INTELLIGENCE",
      question: "지금, 시장은 어떤 국면일까?",
      description:
        "금리와 경기, 가격 흐름과 벤치마크. 기업을 둘러싼 시장의 맥락을 먼저 읽습니다.",
      tags: ["거시경제", "기술적 분석", "벤치마크"],
    },
    {
      name: "기업팀",
      discipline: "BUSINESS & COMPETITION",
      question: "이 기업의 경쟁력은 오래갈까?",
      description:
        "사업모델부터 제품, 고객과 경쟁사까지. 성장의 이유와 경쟁 우위의 지속성을 조사합니다.",
      tags: ["사업모델", "제품 경쟁력", "경쟁 구도"],
    },
    {
      name: "재무팀",
      discipline: "FINANCIAL RESEARCH",
      question: "좋은 이야기를 숫자가 뒷받침할까?",
      description:
        "매출과 이익, 현금흐름과 밸류에이션. 공시 속 숫자로 기업의 실력과 가격의 가정을 검증합니다.",
      tags: ["재무제표", "가치평가", "이익의 질"],
    },
    {
      name: "리스크팀",
      discipline: "RISK & SCENARIOS",
      question: "우리가 놓친 반대편은 무엇일까?",
      description:
        "고객 집중부터 공급망과 정책 변화까지. 투자 논리를 흔들 수 있는 위험과 판단을 바꿀 조건을 찾습니다.",
      tags: ["하방 위험", "정책 변화", "시나리오"],
    },
  ],
  en: [
    {
      name: "Market",
      discipline: "MARKET INTELLIGENCE",
      question: "What kind of market are we in?",
      description:
        "Rates, economic cycles, price action and benchmarks. Start with the context surrounding the company.",
      tags: ["Macro", "Technical analysis", "Benchmarks"],
    },
    {
      name: "Company",
      discipline: "BUSINESS & COMPETITION",
      question: "Can this advantage last?",
      description:
        "Business models, products, customers and competitors. Investigate what drives growth and what protects it.",
      tags: ["Business model", "Product strength", "Competition"],
    },
    {
      name: "Financial",
      discipline: "FINANCIAL RESEARCH",
      question: "Do the numbers support the story?",
      description:
        "Revenue, earnings, cash flow and valuation. Test the business and its assumptions against the filings.",
      tags: ["Financials", "Valuation", "Earnings quality"],
    },
    {
      name: "Risk",
      discipline: "RISK & SCENARIOS",
      question: "What could change our minds?",
      description:
        "Customer concentration, supply chains and policy. Find the risks that could overturn the investment thesis.",
      tags: ["Downside risk", "Policy", "Scenarios"],
    },
  ],
} as const;

export function LandingHeroCopy({ locale }: Props) {
  const ko = locale === "ko";
  const otherLocale = locale !== "ko" && locale !== "en";
  return (
    <div className="hero__copy landing-intro">
      <p className="landing-kicker">
        <span className="landing-status-dot" /> YOUR PERSONAL RESEARCH TEAM
      </p>
      <h1>
        {otherLocale
          ? copy[locale].hero.titleLead
          : ko
            ? "하나의 종목,"
            : "One stock."}
        <br />
        <span className="landing-intro__accent">
          {otherLocale
            ? copy[locale].hero.titleTail
            : ko
              ? "열한 개의 시선."
              : "Eleven perspectives."}
        </span>
      </h1>
      <p className="landing-intro__description">
        {otherLocale
          ? copy[locale].hero.descriptionLead
          : ko
            ? "4개 팀, 11명의 AI 에이전트가 조사하고 토론합니다."
            : "4 teams. 11 AI specialists. Research, challenged from every angle."}
        <br />
        {otherLocale
          ? copy[locale].hero.descriptionTail
          : ko
            ? "당신은 근거를 갖고, 더 깊이 판단하세요."
            : "Get the evidence to form your own conviction."}
      </p>
    </div>
  );
}

export function LandingSearchGuide({ locale }: Props) {
  return (
    <div className="landing-search-guide">
      <span>
        {locale === "ko"
          ? "궁금한 미국주식, 하나만 골라보세요."
          : "Start with a US stock you’re curious about."}
      </span>
      <a href="#research-file">
        {locale === "ko" ? "어떤 리서치를 받나요?" : "See what you get"}
        <ArrowDown size={13} />
      </a>
    </div>
  );
}

export function LandingExperience({
  locale,
  initialLocale,
  initialPreview,
  onOpenPlans,
}: Props & {
  readonly initialLocale: AppLocale;
  readonly initialPreview: LandingResearchRoomPreviewData;
  readonly onOpenPlans: () => void;
}) {
  const lang = researchLocale(locale);
  const ko = lang === "ko";
  const [teamIndex, setTeamIndex] = useState(0);
  const selectedTeam = teams[teamIndex] ?? "market";
  const team = teamCopy[lang][teamIndex] ?? teamCopy[lang][0];
  const members = OFFICE_SCENE_MANIFEST.roster.filter(
    (member) => member.departmentId === selectedTeam,
  );
  return (
    <div className="landing-experience">
      <section
        className="landing-office-open landing-container"
        id="the-office"
        aria-labelledby="office-heading"
      >
        <div className="landing-office-open__masthead">
          <span>
            <span className="landing-status-dot" /> LIVE RESEARCH OFFICE
          </span>
          <span>11 SPECIALISTS + 1 CHAIR</span>
        </div>
        <div className="landing-office-open__body">
          <div className="landing-office-open__narrative">
            <p className="landing-kicker">MEET YOUR TEAM</p>
            <h2 id="office-heading">
              {ko ? (
                <>
                  당신의 질문에,
                  <br />
                  팀이 움직입니다.
                </>
              ) : (
                <>
                  Your question.
                  <br />
                  Their next mission.
                </>
              )}
            </h2>
            <p>
              {ko
                ? "각자의 자리에서 조사하고, 테이블에 모여 토론합니다. 결론에 도달하는 과정까지 지켜보세요."
                : "Watch specialists research at their desks, meet at the table and challenge one another’s conclusions."}
            </p>
            <section
              className="landing-team-detail"
              key={selectedTeam}
              id="landing-team-detail"
              aria-label={team.name}
            >
              <span
                className="landing-team-detail__eyebrow"
                data-team={selectedTeam}
              >
                {team.discipline}
              </span>
              <h3>{team.question}</h3>
              <p>{team.description}</p>
              <div className="landing-team-members">
                {members.map((member) => (
                  <div key={member.id}>
                    <Image
                      src={`/research/office-v7/portraits/${member.id}.png`}
                      alt=""
                      width={38}
                      height={38}
                    />
                    <span>
                      {member.name[lang]}
                      <small>{member.role[lang]}</small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <span className="landing-office-hint">
              <Fingerprint size={15} />
              {ko
                ? "오피스 속 에이전트를 눌러 만나보세요"
                : "Click an agent in the office to meet them"}
              <ArrowDownRight size={15} />
            </span>
          </div>
          <div className="landing-office-open__stage">
            <LandingOfficePreview locale={locale} showIntro={false} />
            <span className="landing-office-open__stage__caption">
              {ko
                ? "오피스 미리보기 · 실제 분석은 종목 검색 후 시작됩니다"
                : "Office preview · Start a real analysis with the search above"}
            </span>
          </div>
        </div>
        <section
          className="landing-office-open__selector"
          aria-label={ko ? "리서치 팀 선택" : "Select a research team"}
        >
          {teams.map((id, index) => (
            <button
              type="button"
              key={id}
              data-team={id}
              aria-pressed={teamIndex === index}
              aria-controls="landing-team-detail"
              onClick={() => setTeamIndex(index)}
            >
              <span className="landing-office-open__selector__number">
                0{index + 1}
              </span>
              <span>
                <strong>{teamCopy[lang][index]?.name}</strong>
                <small>{teamCopy[lang][index]?.tags.join(" · ")}</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
          ))}
        </section>
      </section>
      <div className="landing-sources landing-container">
        <span>
          {ko
            ? "판단의 시작은, 확인할 수 있는 근거."
            : "Every perspective starts with evidence."}
        </span>
        <div>
          {(ko
            ? [
                "SEC 공시",
                "실적 발표",
                "시장 데이터",
                "기업 발표",
                "검증된 뉴스",
              ]
            : [
                "SEC filings",
                "Earnings calls",
                "Market data",
                "Company releases",
                "Trusted news",
              ]
          ).map((source) => (
            <span key={source}>
              <Link2 size={13} />
              {source}
            </span>
          ))}
        </div>
      </div>
      <LandingProcess locale={locale} />
      <LandingReport locale={locale} />
      <div className="landing-latest landing-container">
        <LandingResearchRoomPreview
          locale={locale}
          initialLocale={initialLocale}
          initialPreview={initialPreview}
          onOpenPlans={onOpenPlans}
          showEmpty
        />
      </div>
      <LandingBriefing locale={locale} />
      <LandingQuestions locale={locale} />
      <section className="landing-closing landing-container">
        <span className="landing-kicker">LESS NOISE. MORE PERSPECTIVE.</span>
        <h2>
          {ko ? (
            <>
              혼자 궁금해하던 종목,
              <br />
              이제 팀과 함께 살펴보세요.
            </>
          ) : (
            <>
              The stock on your mind.
              <br />A whole team behind you.
            </>
          )}
        </h2>
        <a href="#research" className="landing-button">
          {ko ? "나의 첫 리서치 시작하기" : "Start your first research"}
          <ArrowRight size={18} />
        </a>
        <p>
          {ko
            ? "4개 팀 · 11명의 전문 에이전트 · 당신만의 투자 질문"
            : "4 teams · 11 specialists · Your investment question"}
        </p>
        <div className="landing-closing__line" aria-hidden="true" />
      </section>
    </div>
  );
}

function LandingQuestions({ locale }: Props) {
  const ko = researchLocale(locale) === "ko";
  const questions = ko
    ? [
        [
          "일반 AI에게 물어보는 것과 어떻게 다른가요?",
          "11명의 전문 에이전트가 담당 분야를 독립적으로 조사하고, 4개 팀이 합의와 상호 반론을 거칩니다. 최종 보고서에서는 결론뿐 아니라 근거, 팀별 의견, 남아 있는 이견을 함께 확인할 수 있습니다.",
        ],
        [
          "주식을 잘 몰라도 읽을 수 있나요?",
          "검색창에서 ‘쉽게 설명’을 선택할 수 있습니다. 분석의 깊이와 근거는 유지하면서 표현을 쉽게 바꿉니다. 구체적인 질문이 없어도 종목을 고르면 기본 투자 쟁점을 조사합니다.",
        ],
        [
          "리서치와 브리핑은 어떻게 다른가요?",
          "리서치는 내가 고른 종목과 질문을 깊이 조사하는 기능입니다. 브리핑은 등록한 관심 종목의 변화와 체크포인트를 매 미국장 거래일 개장 1시간 전부터 확인하는 별도 기능입니다.",
        ],
        [
          "매수·매도 추천도 받을 수 있나요?",
          "Stocksembly는 정보와 교육을 위한 리서치를 제공합니다. 매매 추천이나 목표가 대신, 투자 논리를 뒷받침하는 근거와 반론, 판단을 바꿀 조건을 정리합니다. 최종 투자 판단은 사용자가 내립니다.",
        ],
      ]
    : [
        [
          "How is this different from asking a general AI?",
          "Eleven specialists research independently, then four teams form their views and challenge one another. The final report keeps the evidence, team positions and unresolved disagreements alongside the conclusion.",
        ],
        [
          "Do I need to be an experienced investor?",
          "Choose ‘Plain language’ in the search console for an accessible explanation with the same depth and evidence. You can also select a stock without a specific question to investigate its core investment issues.",
        ],
        [
          "What is the difference between research and a briefing?",
          "Research is an in-depth investigation of your chosen stock and question. The separate briefing room follows changes and checkpoints for your watchlist, starting one hour before each US trading day opens.",
        ],
        [
          "Does Stocksembly give buy or sell recommendations?",
          "Stocksembly provides research for information and education. It presents evidence, counterarguments and conditions that could change a thesis rather than trading recommendations or price targets. Investment decisions remain yours.",
        ],
      ];
  return (
    <section
      className="landing-faq landing-container"
      aria-labelledby="faq-heading"
    >
      <div>
        <span className="landing-kicker">A FEW MORE THINGS</span>
        <h2 id="faq-heading">
          {ko ? "궁금할 수 있는 것들." : "Good questions."}
        </h2>
      </div>
      <div>
        {questions.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <ChevronDown size={18} />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
