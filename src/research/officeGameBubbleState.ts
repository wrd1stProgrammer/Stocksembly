import type { Locale } from "../lib/i18n";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";
import type {
  OfficeActorSnapshot,
  OfficeSimulationSnapshot,
} from "./officeSimulation";
import type { AgentId, ResearchPhase } from "./types";

export type BubbleState = {
  readonly visible: boolean;
  readonly message: string;
};

export function bubbleStateForSnapshot(
  actor: OfficeActorSnapshot,
  snapshot: OfficeSimulationSnapshot,
  locale: Locale,
): BubbleState {
  if (snapshot.beatId === "briefing" && actor.id === "chair") {
    return {
      visible: true,
      message:
        locale === "ko" ? "리서치 과업 배정 중" : "Assigning research briefs",
    };
  }
  if (snapshot.beatId === "parallel-work" && snapshot.tick >= 40) {
    const working = snapshot.actors.filter(
      (candidate) => candidate.action === "seated-work",
    );
    const index = Math.floor((snapshot.tick - 40) / 60) % working.length;
    const speakers = [working[index], working[(index + 5) % working.length]];
    const messageIndex = Math.floor((snapshot.tick - 40) / 120) % 2;
    return {
      visible: speakers.some((speaker) => speaker?.id === actor.id),
      message: messages[actor.id][locale][messageIndex] ?? "",
    };
  }
  switch (actor.action) {
    case "chair-synthesis":
    case "present":
    case "summarize":
    case "talk":
      return {
        visible: true,
        message: messages[actor.id][locale][1] ?? "",
      };
    case "idle":
    case "listen":
    case "orient":
    case "return":
    case "seated-work":
    case "stand":
    case "walk":
      return { visible: false, message: "" };
  }
}

const specialistOrder: readonly AgentId[] = OFFICE_SCENE_MANIFEST.roster
  .filter((member) => member.hasV6Asset && member.departmentId !== "chair")
  .map((member) => member.id);

const messages: Readonly<
  Record<AgentId, Readonly<Record<Locale, readonly [string, string]>>>
> = {
  market: {
    en: ["Checking rates and inflation", "Comparing market regime"],
    ko: ["금리·물가 확인 중", "시장 국면 대조 중"],
  },
  market_news: {
    en: ["Comparing 20/50/200-day trends", "Checking momentum and volume"],
    ko: ["20·50·200일 추세 비교 중", "모멘텀·거래량 확인 중"],
  },
  benchmark: {
    en: ["Comparing sector benchmarks", "Testing rates and peer dispersion"],
    ko: ["섹터 벤치마크 비교 중", "금리·동종사 편차 검증 중"],
  },
  company: {
    en: ["Mapping competitors", "Reviewing product moat"],
    ko: ["경쟁사 지형 정리 중", "제품 경쟁우위 검토 중"],
  },
  company_product: {
    en: ["Reviewing product signals", "Checking adoption evidence"],
    ko: ["제품 신호 검토 중", "채택 근거 확인 중"],
  },
  company_competition: {
    en: ["Mapping competitors", "Comparing market positions"],
    ko: ["경쟁사 지형 정리 중", "시장 지위 비교 중"],
  },
  financial: {
    en: ["Reconciling 10-Q figures", "Checking earnings quality"],
    ko: ["10-Q 수치 대조 중", "이익의 질 점검 중"],
  },
  valuation: {
    en: ["Running 3 scenarios", "Comparing price ranges"],
    ko: ["3개 시나리오 계산 중", "적정가 범위 비교 중"],
  },
  financial_quality: {
    en: ["Checking accrual quality", "Reviewing disclosures"],
    ko: ["발생액의 질 점검 중", "공시 내역 검토 중"],
  },
  risk: {
    en: ["Testing downside cases", "Flagging open risks"],
    ko: ["하방 시나리오 검증 중", "미해결 위험 표시 중"],
  },
  risk_policy: {
    en: ["Tracking policy changes", "Testing policy scenarios"],
    ko: ["정책 변화 추적 중", "정책 시나리오 검증 중"],
  },
  chair: {
    en: ["Checking 19/22 claims", "Auditing source links"],
    ko: ["주장 19/22 확인 중", "근거 링크 감사 중"],
  },
};

export function bubbleStateFor(
  id: AgentId,
  phase: ResearchPhase,
  activeAgentIds: readonly AgentId[],
  elapsedMs: number,
  locale: Locale,
): BubbleState {
  if (phase === "collecting") {
    const specialist =
      specialistOrder[Math.floor(elapsedMs / 2400) % specialistOrder.length];
    const messageIndex = Math.floor(elapsedMs / 1200) % 2;
    return {
      visible: specialist === id && activeAgentIds.includes(id),
      message: messages[id][locale][messageIndex] ?? "",
    };
  }
  if (phase === "analyzing" && id === "chair") {
    const messageIndex = Math.floor(elapsedMs / 2200) % 2;
    return {
      visible: true,
      message: messages.chair[locale][messageIndex] ?? "",
    };
  }
  if (phase === "briefing" && id === "chair") {
    return {
      visible: true,
      message:
        locale === "ko" ? "리서치 과업 배정 중" : "Assigning research briefs",
    };
  }
  if (phase === "committee" && activeAgentIds.includes(id)) {
    const speaker =
      activeAgentIds[Math.floor(elapsedMs / 3800) % activeAgentIds.length];
    return {
      visible: speaker === id,
      message:
        id === "risk"
          ? locale === "ko"
            ? "하방 시나리오 반론 중"
            : "Challenging the downside case"
          : locale === "ko"
            ? "핵심 근거 발표 중"
            : "Presenting key evidence",
    };
  }
  return { visible: false, message: "" };
}
