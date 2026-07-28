import type { Locale } from "../lib/i18n";
import type {
  ResearchEvidenceStrength,
  ResearchFileData,
} from "./compositions/types";

type EditorialTeamInput = {
  readonly departmentId: ResearchFileData["teamViews"][number]["departmentId"];
  readonly teamName: string;
  readonly strongestClaim: string;
  readonly evidence: string;
};

type EditorialAnalysisInput = {
  readonly id: string;
  readonly title: string;
  readonly agentView: string;
  readonly evidence: string;
  readonly counterpoint: string;
  readonly checkpoint: string;
  readonly strength: ResearchEvidenceStrength;
};

export type EditorialSnapshotRow = {
  readonly label: string;
  readonly value: string;
  readonly tone: "primary" | "positive" | "caution" | "neutral";
};

export type EditorialDebate = {
  readonly id: string;
  readonly title: string;
  readonly claimOwner: string;
  readonly claim: string;
  readonly counterOwner: string;
  readonly counterargument: string;
  readonly recheckedEvidence: string;
  readonly chairRuling: string;
};

type EditorialInsightInput = {
  readonly file: ResearchFileData;
  readonly locale: Locale;
  readonly teams: readonly EditorialTeamInput[];
  readonly analysisRows: readonly EditorialAnalysisInput[];
  readonly baseAnswer: string;
  readonly valuation: string;
  readonly nextVerification: string;
  readonly changeCondition: string;
};

function firstSentence(value: string): string {
  return value.match(/^.*?[.!?。！？](?:\s|$)/u)?.[0]?.trim() ?? value.trim();
}

function combineDistinct(first: string, second: string): string {
  if (first.includes(second)) return first;
  if (second.includes(first)) return second;
  const separator = /[.!?。！？]$/u.test(first) ? " " : ". ";
  return `${first}${separator}${second}`;
}

function debateLength(value: string, supportingDetail: string): string {
  return value.length >= 28 ? value : combineDistinct(value, supportingDetail);
}

function team(
  input: EditorialInsightInput,
  departmentId: EditorialTeamInput["departmentId"],
): EditorialTeamInput | undefined {
  return input.teams.find((item) => item.departmentId === departmentId);
}

function matchingRow(
  rows: readonly EditorialAnalysisInput[],
  pattern: RegExp,
  fallbackIndex: number,
): EditorialAnalysisInput | undefined {
  return (
    rows.find((row) => pattern.test(`${row.title} ${row.agentView}`)) ??
    rows[fallbackIndex]
  );
}

function debate(
  id: string,
  row: EditorialAnalysisInput,
  claimOwner: string,
  counterOwner: string,
): EditorialDebate {
  return {
    id,
    title: row.title,
    claimOwner,
    claim: debateLength(row.agentView, row.evidence),
    counterOwner,
    counterargument: debateLength(row.counterpoint, row.checkpoint),
    recheckedEvidence: row.evidence,
    chairRuling: combineDistinct(
      debateLength(row.agentView, row.counterpoint),
      row.checkpoint,
    ),
  };
}

export function buildEditorialInsights(input: EditorialInsightInput): {
  readonly directAnswer: string;
  readonly valuationConclusion: string;
  readonly companySnapshot: readonly EditorialSnapshotRow[];
  readonly debates: readonly EditorialDebate[];
  readonly initialView: string;
  readonly finalView: string;
} {
  const ko = input.locale === "ko";
  const market = team(input, "market");
  const company = team(input, "company");
  const financial = team(input, "financial");
  const risk = team(input, "risk");
  const directAnswer = combineDistinct(
    input.baseAnswer,
    firstSentence(
      financial?.strongestClaim ??
        company?.strongestClaim ??
        input.changeCondition,
    ),
  );
  const valuationConclusion = combineDistinct(
    combineDistinct(
      input.valuation,
      firstSentence(financial?.evidence ?? input.changeCondition),
    ),
    firstSentence(input.changeCondition),
  );
  const price =
    input.file.marketSnapshot === undefined
      ? ko
        ? "현재 가격을 확인할 수 없음"
        : "Current price unavailable"
      : `${input.file.marketSnapshot.currency} ${input.file.marketSnapshot.price} · ${input.file.marketSnapshot.marketState}`;
  const companySnapshot: readonly EditorialSnapshotRow[] = [
    {
      label: ko ? "현재 주가" : "Observed price",
      value: price,
      tone: "primary",
    },
    {
      label: ko ? "사업·수요 신호" : "Business & demand",
      value: firstSentence(company?.strongestClaim ?? input.baseAnswer),
      tone: "positive",
    },
    {
      label: ko ? "수익성 신호" : "Profitability",
      value: firstSentence(financial?.strongestClaim ?? input.valuation),
      tone: "caution",
    },
    {
      label: ko ? "시장·기술 흐름" : "Market & technicals",
      value: firstSentence(market?.strongestClaim ?? input.baseAnswer),
      tone: "primary",
    },
    {
      label: ko ? "하방 완충" : "Downside buffer",
      value: firstSentence(risk?.evidence ?? input.changeCondition),
      tone: "neutral",
    },
    {
      label: ko ? "다음 검증" : "Next verification",
      value: firstSentence(input.nextVerification),
      tone: "caution",
    },
  ];
  const financialRow = matchingRow(
    input.analysisRows,
    /마진|이익|현금|재무|margin|profit|cash|financial/iu,
    0,
  );
  const companyRow = matchingRow(
    input.analysisRows,
    /제품|인도|매출|수요|경쟁|product|deliver|revenue|demand|competition/iu,
    1,
  );
  const debates = [
    ...(financialRow === undefined
      ? []
      : [
          debate(
            "D01",
            financialRow,
            financial?.teamName ?? (ko ? "재무 팀" : "Financial team"),
            risk?.teamName ?? (ko ? "리스크 팀" : "Risk team"),
          ),
        ]),
    ...(companyRow === undefined
      ? []
      : [
          debate(
            "D02",
            companyRow,
            company?.teamName ?? (ko ? "기업 팀" : "Company team"),
            market?.teamName ?? (ko ? "시장 팀" : "Market team"),
          ),
        ]),
  ];
  const initialView = combineDistinct(
    firstSentence(market?.strongestClaim ?? input.baseAnswer),
    firstSentence(company?.strongestClaim ?? input.baseAnswer),
  );
  return {
    directAnswer,
    valuationConclusion,
    companySnapshot,
    debates,
    initialView,
    finalView: combineDistinct(directAnswer, input.changeCondition),
  };
}
