import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  GitCompareArrows,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { Locale } from "../lib/i18n";
import { copy } from "../lib/i18n";
import { Brand } from "./Brand";

type LandingSectionsProps = {
  readonly locale: Locale;
};

const proofCopy = {
  en: {
    eyebrow: "RESEARCH, NOT ANOTHER CHAT ANSWER",
    title: "One question becomes a decision system.",
    description:
      "Stocksembly separates the work, preserves disagreement, and shows the exact evidence that would strengthen or break the view.",
    workflowLabel: "What happens after you submit",
    workflow: [
      {
        number: "01",
        title: "Frame the investment debate",
        body: "The chair turns your question into distinct market, company, financial, and risk checks.",
      },
      {
        number: "02",
        title: "Investigate in parallel",
        body: "Specialists collect public evidence and keep claims attached to their sources.",
      },
      {
        number: "03",
        title: "Challenge the strongest claims",
        body: "Teams test opposing evidence instead of silently averaging conflicting views.",
      },
      {
        number: "04",
        title: "Publish a decision file",
        body: "The final report separates the current view, confirmation signals, and invalidation conditions.",
      },
    ],
    boardEyebrow: "SAMPLE REPORT INTERFACE",
    boardTitle: "Read the decision before the essay.",
    boardDescription:
      "A compact board puts observed metrics, claim status, and the three decision paths on one screen.",
    boardMetrics: [
      ["Observed price", "Attached"],
      ["Claim audit", "Visible"],
      ["Counter-evidence", "Retained"],
    ],
    boardPaths: [
      ["CONFIRM", "What must improve"],
      ["CURRENT VIEW", "What the evidence says now"],
      ["INVALIDATE", "What would prove it wrong"],
    ],
    teamsEyebrow: "FOUR DIFFERENT RESEARCH PRODUCTS",
    teamsTitle: "Each team answers a different investor question.",
    teamsDescription:
      "Focused research is not the committee report with fewer agents. Each team gets its own framework, metrics, and decision thresholds.",
    teams: [
      {
        id: "market",
        label: "Market",
        question: "Is the timing confirmed?",
        output: "Regime · relative strength · catalyst clock",
      },
      {
        id: "company",
        label: "Company",
        question: "Where does the moat compound?",
        output: "Growth engines · revenue mix · moat tests",
      },
      {
        id: "financial",
        label: "Financial",
        question: "What does the price already require?",
        output: "Margin bridge · cash conversion · expectations",
      },
      {
        id: "risk",
        label: "Risk",
        question: "Which failure path breaks the thesis?",
        output: "Risk register · early warnings · thesis breaker",
      },
    ],
    changeEyebrow: "RESEARCH THAT AGES WITH THE COMPANY",
    changeTitle: "The next report starts with what changed.",
    changeDescription:
      "A re-analysis compares the previous conclusion with new data, then explains why confidence strengthened, weakened, or stayed the same.",
    previous: "Previous view",
    previousBody: "Demand held, but the next disclosure remained decisive.",
    current: "Current view",
    currentBody:
      "New operating evidence strengthened the thesis while one concentration risk remains.",
    delta: "WHAT CHANGED",
    deltaItems: [
      "New metrics are compared with the prior report",
      "Material claims are added, removed, or revised",
      "The next condition that can change the view is preserved",
    ],
    trustEyebrow: "BUILT FOR INSPECTION",
    trustTitle: "The conclusion is never the only thing you receive.",
    trust: [
      {
        title: "Sources stay attached",
        body: "Claims and source records remain connected in the report ledger.",
      },
      {
        title: "Disagreement stays visible",
        body: "Material counter-evidence is retained instead of being smoothed away.",
      },
      {
        title: "Unknowns become checkpoints",
        body: "Missing certainty is translated into a metric, disclosure, or dated event to monitor.",
      },
    ],
    faqEyebrow: "QUESTIONS BEFORE YOU START",
    faqTitle: "What Stocksembly is—and is not.",
    faqs: [
      [
        "Does it give buy or sell signals?",
        "No. It organizes public evidence, competing views, and the conditions that could change an investment thesis.",
      ],
      [
        "When should I use a focused team report?",
        "Use it when your question is narrow: market timing, business quality, financial expectations, or a specific downside path.",
      ],
      [
        "Why run the same stock again?",
        "The comparison page shows what changed in the data, claims, and conclusion since the previous report.",
      ],
      [
        "Can I inspect the evidence?",
        "Yes. The report keeps a source register and separates supported, partial, challenged, and unverified claims.",
      ],
    ],
    ctaEyebrow: "START WITH THE ARGUMENT THAT MATTERS",
    ctaTitle: "Bring one ticker and one hard question.",
    ctaBody:
      "Choose the full committee or let Stocksembly recommend the specialist team that best fits the debate.",
    cta: "Build my research",
    ctaNote: "US equities · full committee or focused team",
  },
  ko: {
    eyebrow: "또 하나의 채팅 답변이 아닌, 리서치",
    title: "하나의 질문을 투자 판단 시스템으로.",
    description:
      "Stocksembly는 역할을 나눠 조사하고, 이견을 보존하며, 어떤 근거가 판단을 강화하거나 무너뜨리는지 보여줍니다.",
    workflowLabel: "질문을 제출한 뒤 벌어지는 일",
    workflow: [
      {
        number: "01",
        title: "투자 쟁점을 분해합니다",
        body: "의장이 질문을 시장·기업·재무·리스크의 서로 다른 검증 과제로 바꿉니다.",
      },
      {
        number: "02",
        title: "전문가가 병렬로 조사합니다",
        body: "공개 근거를 수집하고, 중요한 주장은 실제 출처와 연결한 채 남깁니다.",
      },
      {
        number: "03",
        title: "가장 강한 주장을 반박합니다",
        body: "충돌하는 의견을 평균내지 않고 반대 근거가 핵심 논지를 깨는지 다시 검증합니다.",
      },
      {
        number: "04",
        title: "판단 파일을 발행합니다",
        body: "현재 결론·상방 확인 신호·판단 무효화 조건을 구분해 한 리포트로 정리합니다.",
      },
    ],
    boardEyebrow: "샘플 리포트 인터페이스",
    boardTitle: "긴 글보다 판단 구조를 먼저 읽으세요.",
    boardDescription:
      "관찰 지표·주장 검증 상태·세 가지 판단 경로를 한 화면에 압축한 투자 판단 보드입니다.",
    boardMetrics: [
      ["관찰 가격", "연결됨"],
      ["주장 검증", "공개됨"],
      ["반대 근거", "보존됨"],
    ],
    boardPaths: [
      ["상방 확인", "무엇이 개선돼야 하는가"],
      ["현재 판단", "지금 근거가 말하는 것"],
      ["판단 무효화", "무엇이 이 결론을 깨는가"],
    ],
    teamsEyebrow: "서로 다른 네 가지 리서치 제품",
    teamsTitle: "팀마다 투자자에게 답하는 질문이 다릅니다.",
    teamsDescription:
      "개별팀 리서치는 전체 보고서의 축약판이 아닙니다. 팀마다 고유한 데이터 보드와 검증 프레임, 판단 임계치를 제공합니다.",
    teams: [
      {
        id: "market",
        label: "시장팀",
        question: "지금 타이밍이 확인됐는가?",
        output: "시장 국면 · 상대 강도 · 촉매 시계",
      },
      {
        id: "company",
        label: "기업팀",
        question: "경쟁우위는 어디서 누적되는가?",
        output: "성장 엔진 · 매출 구성 · 해자 검증",
      },
      {
        id: "financial",
        label: "재무팀",
        question: "현재 가격은 무엇을 요구하는가?",
        output: "마진 브리지 · 현금 전환 · 내재 기대",
      },
      {
        id: "risk",
        label: "리스크팀",
        question: "어떤 실패 경로가 논지를 깨는가?",
        output: "위험 원장 · 조기경보 · 논지 파기 조건",
      },
    ],
    changeEyebrow: "기업과 함께 업데이트되는 리서치",
    changeTitle: "다음 리포트는 ‘무엇이 변했는가’에서 시작합니다.",
    changeDescription:
      "재분석 시 이전 결론과 새 데이터를 비교하고, 확신이 강화·약화·유지된 이유를 설명합니다.",
    previous: "이전 판단",
    previousBody: "수요는 유지됐지만 다음 공시 확인이 결정적이었습니다.",
    current: "현재 판단",
    currentBody:
      "새 운영 근거가 핵심 논지를 강화했지만 고객 집중 위험은 남았습니다.",
    delta: "달라진 점",
    deltaItems: [
      "새 지표를 이전 리포트의 수치와 비교",
      "중요 주장의 추가·삭제·수정 여부를 기록",
      "다음 판단을 바꿀 조건을 그대로 보존",
    ],
    trustEyebrow: "검증을 전제로 설계",
    trustTitle: "결론만 던지고 끝내지 않습니다.",
    trust: [
      {
        title: "출처가 주장에 붙어 있습니다",
        body: "핵심 주장과 실제 자료를 리포트의 근거 등록부에서 연결해 확인할 수 있습니다.",
      },
      {
        title: "의견 차이를 지우지 않습니다",
        body: "최종 판단을 바꿀 수 있는 반대 근거와 팀 내부 이견을 그대로 보존합니다.",
      },
      {
        title: "불확실성을 체크포인트로 바꿉니다",
        body: "모른다는 말 대신 다음에 확인할 지표·공시·날짜가 있는 이벤트를 남깁니다.",
      },
    ],
    faqEyebrow: "시작하기 전 궁금한 점",
    faqTitle: "Stocksembly가 하는 것과 하지 않는 것.",
    faqs: [
      [
        "매수·매도 신호를 주나요?",
        "아니요. 공개 근거와 상반된 관점, 투자 논지를 바꿀 조건을 체계적으로 정리합니다.",
      ],
      [
        "언제 개별팀 리서치를 쓰면 되나요?",
        "시장 타이밍·사업 경쟁력·재무 기대·특정 하방 위험처럼 질문이 명확할 때 적합합니다.",
      ],
      [
        "같은 종목을 왜 다시 조사하나요?",
        "변화 장에서 이전 이후 달라진 데이터·주장·결론을 비교할 수 있기 때문입니다.",
      ],
      [
        "근거를 직접 확인할 수 있나요?",
        "네. 출처 등록부와 함께 확인·부분 확인·상충·미확인 주장을 구분해 보여줍니다.",
      ],
    ],
    ctaEyebrow: "가장 중요한 투자 쟁점부터",
    ctaTitle: "티커 하나와 어려운 질문 하나면 됩니다.",
    ctaBody:
      "전체 위원회를 선택하거나, 질문에 가장 적합한 전문팀을 Stocksembly가 추천하도록 하세요.",
    cta: "내 리서치 시작하기",
    ctaNote: "미국 주식 · 전체 위원회 또는 개별팀",
  },
} as const;

export function LandingSections({ locale }: LandingSectionsProps) {
  const content = copy[locale].landing;
  const proof = proofCopy[locale];
  const sourceLoop = [false, true].flatMap((repeated) =>
    content.sources.map((source) => ({ repeated, source })),
  );

  return (
    <div className="landing-story" id="research">
      <aside className="source-rail" aria-label={content.sourcesLabel}>
        <span className="source-rail__label">{content.sourcesLabel}</span>
        <div className="source-rail__viewport">
          <div className="source-rail__track">
            {sourceLoop.map(({ repeated, source }) => (
              <span key={`${source}-${repeated}`} aria-hidden={repeated}>
                <CheckCircle2 aria-hidden="true" size={14} />
                {source}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <section className="proof-intro landing-reveal">
        <p>{proof.eyebrow}</p>
        <h2>{proof.title}</h2>
        <div>
          <p>{proof.description}</p>
          <span>
            {locale === "ko"
              ? "전문 에이전트 11 · 독립 의장 1 · 전문팀 4"
              : "11 specialists · 1 independent chair · 4 research teams"}
          </span>
        </div>
      </section>

      <section className="proof-workflow landing-reveal">
        <header>
          <span>{proof.workflowLabel}</span>
          <strong>QUESTION → EVIDENCE → CHALLENGE → DECISION</strong>
        </header>
        <ol>
          {proof.workflow.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="proof-board landing-reveal">
        <div className="proof-section-copy">
          <p>{proof.boardEyebrow}</p>
          <h2>{proof.boardTitle}</h2>
          <span>{proof.boardDescription}</span>
        </div>
        <div className="proof-board__frame">
          <header>
            <div>
              <span>STOCKSEMBLY / RESEARCH FILE</span>
              <strong>NVDA</strong>
            </div>
            <em>{locale === "ko" ? "예시 화면" : "Sample UI"}</em>
          </header>
          <dl>
            {proof.boardMetrics.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="proof-board__paths">
            {proof.boardPaths.map(([label, value], index) => (
              <article key={label} data-current={index === 1}>
                <span>{label}</span>
                <strong>{value}</strong>
                <i />
              </article>
            ))}
          </div>
          <footer>
            <ShieldCheck aria-hidden="true" size={17} />
            {locale === "ko"
              ? "확인된 주장과 반대 근거를 한 화면에서 비교"
              : "Compare supported claims and counter-evidence in one view"}
          </footer>
        </div>
      </section>

      <section className="proof-teams landing-reveal">
        <div className="proof-section-copy">
          <p>{proof.teamsEyebrow}</p>
          <h2>{proof.teamsTitle}</h2>
          <span>{proof.teamsDescription}</span>
        </div>
        <div className="proof-team-grid">
          {proof.teams.map((team, index) => (
            <article key={team.id} data-team={team.id}>
              <header>
                <span>0{index + 1}</span>
                <em>{team.label}</em>
              </header>
              <h3>{team.question}</h3>
              <p>{team.output}</p>
              <div aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="proof-change landing-reveal">
        <div className="proof-section-copy">
          <p>{proof.changeEyebrow}</p>
          <h2>{proof.changeTitle}</h2>
          <span>{proof.changeDescription}</span>
        </div>
        <div className="proof-change__visual">
          <div className="proof-change__compare">
            <article>
              <span>{proof.previous}</span>
              <p>{proof.previousBody}</p>
            </article>
            <GitCompareArrows aria-hidden="true" size={24} />
            <article>
              <span>{proof.current}</span>
              <p>{proof.currentBody}</p>
            </article>
          </div>
          <div className="proof-change__delta">
            <strong>{proof.delta}</strong>
            <ul>
              {proof.deltaItems.map((item) => (
                <li key={item}>
                  <CheckCircle2 aria-hidden="true" size={15} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="proof-trust landing-reveal">
        <div className="proof-section-copy">
          <p>{proof.trustEyebrow}</p>
          <h2>{proof.trustTitle}</h2>
        </div>
        <div>
          {proof.trust.map((item, index) => {
            const Icon = [FileCheck2, CircleAlert, Search][index] ?? Search;
            return (
              <article key={item.title}>
                <Icon aria-hidden="true" size={22} />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="proof-faq landing-reveal">
        <div className="proof-section-copy">
          <p>{proof.faqEyebrow}</p>
          <h2>{proof.faqTitle}</h2>
        </div>
        <div>
          {proof.faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="proof-cta landing-reveal">
        <div>
          <p>{proof.ctaEyebrow}</p>
          <h2>{proof.ctaTitle}</h2>
          <span>{proof.ctaBody}</span>
        </div>
        <div>
          <a href="#product">
            {proof.cta}
            <ArrowUpRight aria-hidden="true" size={18} />
          </a>
          <small>{proof.ctaNote}</small>
        </div>
      </section>
    </div>
  );
}

export function LandingFooter({ locale }: LandingSectionsProps) {
  const content = copy[locale].footer;
  const legalLinks = [
    { href: "/terms", label: content.terms },
    { href: "/privacy", label: content.privacy },
    { href: "/disclaimer", label: content.disclaimerLabel },
    { href: "/risk-disclosure", label: content.risk },
  ] as const;

  return (
    <footer className="site-footer">
      <div className="site-footer__primary">
        <div className="site-footer__brand">
          <Brand locale={locale} />
          <p>{content.purpose}</p>
          <span>{content.operator}</span>
        </div>
        <nav
          className="site-footer__column"
          aria-label={content.productHeading}
        >
          <strong>{content.productHeading}</strong>
          <a href="#product">{content.howItWorks}</a>
          <a href="#research">{content.research}</a>
        </nav>
        <address className="site-footer__column">
          <strong>{content.contactHeading}</strong>
          <a href="mailto:kicoa24@gmail.com">{content.support}</a>
          <span>kicoa24@gmail.com</span>
          <span>Room 306, 32-4, Banryong-ro 18beon-gil, South Korea</span>
        </address>
        <nav className="site-footer__column" aria-label={content.legalHeading}>
          <strong>{content.legalHeading}</strong>
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="site-footer__meta">
        <span>© 2026 {content.rights}</span>
        <nav aria-label={content.legalHeading}>
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="site-footer__locale">
          {locale === "en"
            ? "English · 한국어 제공"
            : "한국어 · English available"}
        </span>
      </div>
      <p className="site-footer__disclaimer">{content.disclaimer}</p>
    </footer>
  );
}
