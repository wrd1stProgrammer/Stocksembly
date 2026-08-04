import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import {
  type WorkflowDepartmentId,
  workflowRoleById,
} from "../../../research/domain/roleRegistry";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";

export type DepartmentReportBodyProps = {
  readonly file: ResearchFileData;
  readonly model: ResearchFileEditorialModel;
  readonly locale: Locale;
};

type DepartmentCopy = {
  readonly primaryTitle: string;
  readonly primaryDescription: string;
  readonly secondaryTitle: string;
  readonly secondaryDescription: string;
};

const DIMENSIONS = {
  market: ["regime", "timing", "relative_performance", "catalyst"],
  company: ["growth_engine", "adoption", "moat", "competitive_erosion"],
  financial: [
    "margin",
    "cash_conversion",
    "reinvestment",
    "embedded_expectations",
  ],
  risk: ["downside_path", "leading_indicator", "mitigant"],
} as const;

const COPY: Readonly<
  Record<
    WorkflowDepartmentId,
    { readonly en: DepartmentCopy; readonly ko: DepartmentCopy }
  >
> = {
  market: {
    en: {
      primaryTitle: "Market timing map",
      primaryDescription:
        "Read the current regime, tradable signals, and the conditions that confirm or invalidate timing.",
      secondaryTitle: "Confirmation zones & catalyst clock",
      secondaryDescription:
        "Separate a usable entry signal from short-lived noise, then anchor the view to the next observable event.",
    },
    ko: {
      primaryTitle: "시장 타이밍 맵",
      primaryDescription:
        "현재 시장 국면과 가격 신호를 읽고, 타이밍을 확인하거나 무효화할 조건을 구분합니다.",
      secondaryTitle: "확인 구간·촉매 시계",
      secondaryDescription:
        "실행 가능한 진입 신호와 단기 노이즈를 구분하고 다음 관찰 이벤트에 판단을 연결합니다.",
    },
  },
  company: {
    en: {
      primaryTitle: "Growth engine map",
      primaryDescription:
        "Break the business into growth engines, moat layers, and execution dependencies instead of treating the company as one story.",
      secondaryTitle: "Execution milestones & moat tests",
      secondaryDescription:
        "Track what must compound, what can erode, and the operating proof that should arrive next.",
    },
    ko: {
      primaryTitle: "성장 엔진 맵",
      primaryDescription:
        "회사를 하나의 이야기로 보지 않고 성장 엔진·경쟁우위 층·실행 의존성으로 분해합니다.",
      secondaryTitle: "실행 마일스톤·해자 검증",
      secondaryDescription:
        "무엇이 누적 성장해야 하고 무엇이 경쟁우위를 훼손하는지 다음 운영 근거와 함께 확인합니다.",
    },
  },
  financial: {
    en: {
      primaryTitle: "Earnings & valuation lab",
      primaryDescription:
        "Trace growth through margin and cash conversion, then test how much operating perfection the observed price requires.",
      secondaryTitle: "Embedded expectations & safety margin",
      secondaryDescription:
        "Translate valuation into measurable conditions and show where the current expectation set loses support.",
    },
    ko: {
      primaryTitle: "이익·밸류에이션 랩",
      primaryDescription:
        "성장이 마진과 현금으로 전환되는 과정을 추적하고 현재 가격이 요구하는 실행 수준을 검증합니다.",
      secondaryTitle: "내재 기대·안전마진",
      secondaryDescription:
        "밸류에이션을 측정 가능한 조건으로 바꾸고 현재 기대가 지지를 잃는 지점을 보여줍니다.",
    },
  },
  risk: {
    en: {
      primaryTitle: "Risk register",
      primaryDescription:
        "Rank failure paths by impact and observability, then identify which risks become dangerous when they compound.",
      secondaryTitle: "Early-warning system & thesis breakers",
      secondaryDescription:
        "Turn risk language into observable alerts, escalation rules, and explicit conditions that break the thesis.",
    },
    ko: {
      primaryTitle: "리스크 레지스터",
      primaryDescription:
        "실패 경로를 영향도와 관찰 가능성으로 분류하고 어떤 위험이 결합될 때 치명적인지 확인합니다.",
      secondaryTitle: "조기경보·논지 파기 조건",
      secondaryDescription:
        "추상적인 위험을 관찰 가능한 경보와 단계별 대응, 투자 논지를 깨는 조건으로 전환합니다.",
    },
  },
};

export function claimOwnedCheckpoint(
  model: ResearchFileEditorialModel,
  departmentId: WorkflowDepartmentId,
  locale: Locale,
): string | undefined {
  const dimensions = new Set<string>(DIMENSIONS[departmentId]);
  return model.structuredClaims?.find(
    (claim) =>
      workflowRoleById(claim.roleOwner)?.departmentId === departmentId &&
      dimensions.has(claim.decisionDimension),
  )?.falsifier[locale];
}

export function observedPrice(file: ResearchFileData): string {
  return file.marketSnapshot === undefined
    ? "—"
    : `${file.marketSnapshot.currency} ${file.marketSnapshot.price}`;
}

export function departmentSectionCopy(
  departmentId: WorkflowDepartmentId,
  locale: Locale,
) {
  return COPY[departmentId][locale];
}
