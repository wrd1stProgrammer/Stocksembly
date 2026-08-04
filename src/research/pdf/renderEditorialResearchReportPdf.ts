import { readFileSync } from "node:fs";
import path from "node:path";
import PdfPrinter from "pdfmake";
import type {
  Content,
  StyleDictionary,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import type { Locale } from "../../lib/i18n";
import type { ResearchFileData } from "../compositions/types";
import type { NormalizedMetric } from "../domain/comparatorQualificationContracts";
import type {
  ResearchReport,
  WorkflowV2ResearchReport,
} from "../domain/report";
import { formatPercent, publicPdfEvidenceSource } from "../publicPresentation";
import { buildResearchFileEditorialModel } from "../researchFileEditorialModel";
import { researchReportToFile } from "../researchReportToFile";

type PdfProps = {
  readonly report: ResearchReport | WorkflowV2ResearchReport;
  readonly symbol: string;
  readonly locale: Locale;
  readonly createdAt: string;
};

export type ResearchFilePdfProps = {
  readonly file: ResearchFileData;
  readonly symbol: string;
  readonly locale: Locale;
  readonly createdAt: string;
  readonly version: number;
};

const ink = "#141414";
const muted = "#646464";
const rule = "#d7d7d2";
const paper = "#fbfaf6";
const accent = "#315bd6";
const accentSoft = "#e8edfc";
const voteLabels = {
  support: { en: "Support", ko: "지지" },
  support_with_reservations: { en: "Qualified", ko: "조건부 지지" },
  oppose: { en: "Oppose", ko: "반대" },
  abstain: { en: "Abstain", ko: "유보" },
} as const;

const printer = new PdfPrinter({
  Pretendard: {
    normal: path.join(
      process.cwd(),
      "node_modules/@kfonts/nanum-gothic/src/NanumGothic.ttf",
    ),
    bold: path.join(
      process.cwd(),
      "node_modules/@kfonts/nanum-gothic/src/NanumGothicBold.ttf",
    ),
    italics: path.join(
      process.cwd(),
      "node_modules/@kfonts/nanum-gothic/src/NanumGothic.ttf",
    ),
    bolditalics: path.join(
      process.cwd(),
      "node_modules/@kfonts/nanum-gothic/src/NanumGothicBold.ttf",
    ),
  },
});

function keepKoreanWords(value: string): Content[] {
  return value
    .split(/(\s+)/u)
    .filter((part) => part.length > 0)
    .map((part) =>
      /[\uac00-\ud7a3]/u.test(part) ? { text: part, noWrap: true } : part,
    );
}

function voteLabel(
  vote: ResearchFileData["teamViews"][number]["vote"],
  locale: Locale,
): string {
  return voteLabels[vote][locale];
}

function sourceClassLabel(sourceClass: string, locale: Locale): string {
  const labels: Readonly<
    Record<string, { readonly en: string; readonly ko: string }>
  > = {
    insightsentry_rapidapi: {
      en: "Market evidence",
      ko: "시장 근거",
    },
    sec_primary_filing: { en: "SEC filing", ko: "SEC 공시" },
    sec_company_facts: { en: "SEC XBRL", ko: "SEC XBRL" },
    treasury_yield: { en: "Official macro data", ko: "공식 거시 데이터" },
  };
  if (/insightsentry|rapidapi|provider|licens/iu.test(sourceClass))
    return locale === "ko" ? "시장 근거" : "Market evidence";
  if (/agent_artifact|accepted_artifact/iu.test(sourceClass))
    return locale === "ko" ? "팀 리서치" : "Team research";
  return labels[sourceClass]?.[locale] ?? sourceClass.replaceAll("_", " ");
}

function firstPdfSentence(value: string): string {
  return value.split(/(?<=[.!?。])\s+/u, 1)[0]?.trim() ?? value;
}

function sourceDate(value: string | undefined, locale: Locale): string {
  if (value === undefined) return locale === "ko" ? "미표기" : "Undated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function sourceTitleWithHost(title: string, url: string | undefined): string {
  if (url === undefined) return title;
  try {
    const host = new URL(url).hostname.replace(/^www\./u, "");
    return `${title}\n${host}`;
  } catch {
    return title;
  }
}

function publicSourceCells(
  source: ResearchFileData["evidenceIndex"][number],
  locale: Locale,
): readonly [string, string] {
  const publicSource = publicPdfEvidenceSource(source, locale);
  return [
    publicSource.publisher,
    sourceTitleWithHost(publicSource.title, publicSource.url),
  ];
}

const roleLabels = {
  market: { en: "Market analysis", ko: "시장 분석" },
  market_news: { en: "Market analysis", ko: "시장 분석" },
  benchmark: { en: "Market analysis", ko: "시장 분석" },
  company: { en: "Company analysis", ko: "기업 분석" },
  company_product: { en: "Company analysis", ko: "기업 분석" },
  company_competition: { en: "Company analysis", ko: "기업 분석" },
  financial: { en: "Financial analysis", ko: "재무 분석" },
  valuation: { en: "Financial analysis", ko: "재무 분석" },
  financial_quality: { en: "Financial analysis", ko: "재무 분석" },
  risk: { en: "Risk analysis", ko: "리스크 분석" },
  risk_policy: { en: "Risk analysis", ko: "리스크 분석" },
  chair: { en: "Committee review", ko: "위원회 검토" },
} as const;

const dimensionLabels = {
  regime: { en: "Market regime", ko: "시장 국면" },
  timing: { en: "Timing", ko: "시점" },
  relative_performance: { en: "Relative performance", ko: "상대 성과" },
  catalyst: { en: "Catalyst", ko: "촉매 요인" },
  growth_engine: { en: "Growth engine", ko: "성장 동력" },
  adoption: { en: "Adoption", ko: "도입 추세" },
  moat: { en: "Competitive moat", ko: "경쟁 우위" },
  competitive_erosion: { en: "Competitive erosion", ko: "경쟁력 약화" },
  margin: { en: "Margin", ko: "마진" },
  cash_conversion: { en: "Cash conversion", ko: "현금 전환" },
  reinvestment: { en: "Reinvestment", ko: "재투자" },
  embedded_expectations: { en: "Embedded expectations", ko: "내재 기대" },
  downside_path: { en: "Downside path", ko: "하방 경로" },
  leading_indicator: { en: "Leading indicator", ko: "선행 지표" },
  mitigant: { en: "Downside buffer", ko: "하방 완충 요인" },
} as const;

function publicRoleLabel(role: string, locale: Locale): string {
  return (
    roleLabels[role as keyof typeof roleLabels]?.[locale] ??
    (locale === "ko" ? "분석 팀" : "Analysis team")
  );
}

function publicDimensionLabel(dimension: string, locale: Locale): string {
  return (
    dimensionLabels[dimension as keyof typeof dimensionLabels]?.[locale] ??
    (locale === "ko" ? "판단 요인" : "Decision factor")
  );
}

function publicComparatorRole(role: string, locale: Locale): string {
  const labels = {
    direct_competitor: { en: "Direct peer", ko: "직접 경쟁사" },
    operating_comparable: { en: "Operating peer", ko: "영업 비교기업" },
    valuation_proxy: { en: "Valuation reference", ko: "가치평가 참고기업" },
  } as const;
  return (
    labels[role as keyof typeof labels]?.[locale] ??
    (locale === "ko" ? "비교기업" : "Comparator")
  );
}

function publicComparatorRationale(
  rationale: string,
  role: string,
  locale: Locale,
): string {
  if (
    !/insightsentry|rapidapi|\bprovider\b|licens|라이선스|데이터 (?:공급자|벤더)|제공 ?업체/iu.test(
      rationale,
    )
  )
    return rationale;
  const labels = {
    direct_competitor: {
      en: "Comparable product and customer exposure.",
      ko: "제품과 고객 노출이 유사합니다.",
    },
    operating_comparable: {
      en: "Comparable operating profile for normalized metric review.",
      ko: "정규화 지표 검토에 적합한 영업 구조입니다.",
    },
    valuation_proxy: {
      en: "Valuation reference with normalized metrics.",
      ko: "정규화 지표를 활용한 가치평가 참고기업입니다.",
    },
  } as const;
  return (
    labels[role as keyof typeof labels]?.[locale] ??
    (locale === "ko"
      ? "정규화 지표를 활용한 비교 근거입니다."
      : "Comparison is based on normalized metrics.")
  );
}

const boundedNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function publicComparatorMetric(metric: NormalizedMetric): string {
  const value =
    metric.unit === "percent"
      ? formatPercent(metric.value)
      : `${boundedNumberFormatter.format(metric.value)}${metric.unit === "multiple" ? "x" : ""}`;
  return `${metric.key}: ${value}${metric.period === undefined ? "" : ` (${metric.period})`}`;
}

function sectionTitle(
  number: string,
  title: string,
  description: string,
): Content[] {
  return [
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          x2: 527,
          y1: 0,
          y2: 0,
          lineWidth: 6,
          lineColor: accent,
        },
      ],
      margin: [0, 0, 0, 14],
    },
    {
      columns: [
        { text: number, style: "sectionNumber", color: accent, width: 44 },
        {
          stack: [
            { text: title, style: "sectionTitle" },
            { text: description, style: "sectionDescription" },
          ],
        },
      ],
      columnGap: 12,
      margin: [0, 0, 0, 20],
    },
  ];
}

function labelValueRows(
  rows: readonly { readonly label: string; readonly value: string }[],
): Content {
  return {
    table: {
      widths: [110, "*"],
      body: rows.map((row) => [
        {
          text: keepKoreanWords(row.label),
          style: "label",
          color: accent,
          fillColor: accentSoft,
        },
        { text: keepKoreanWords(row.value), style: "body" },
      ]),
    },
    layout: {
      hLineColor: () => rule,
      vLineColor: () => rule,
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 7,
      paddingBottom: () => 7,
    },
  } as Content;
}

function simpleTable(
  widths: (number | "*" | "auto")[],
  headers: string[],
  rows: readonly string[][],
  compact = false,
): Content {
  const headStyle = compact ? "tableHeadCompact" : "tableHead";
  const bodyStyle = compact ? "tableBodyCompact" : "tableBody";
  const body: TableCell[][] = [
    headers.map((header) => ({
      text: header,
      style: headStyle,
      fillColor: accentSoft,
    })),
    ...rows.map((row) =>
      row.map((value) => ({
        text: keepKoreanWords(value),
        style: bodyStyle,
      })),
    ),
  ];
  return {
    table: { headerRows: 1, widths, body },
    layout: {
      hLineColor: () => rule,
      vLineColor: () => rule,
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => (compact ? 3 : 5),
      paddingBottom: () => (compact ? 3 : 5),
    },
  } as Content;
}

function portrait(relativePath: string): string {
  const bytes = readFileSync(
    path.join(process.cwd(), "public", relativePath.replace(/^\//u, "")),
  );
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function styles(): StyleDictionary {
  return {
    brand: { bold: true, fontSize: 8 },
    meta: { fontSize: 7, color: muted },
    coverQuestionLabel: {
      bold: true,
      fontSize: 8,
      color: muted,
    },
    coverQuestion: { bold: true, fontSize: 27, lineHeight: 1.18 },
    conclusionLabel: {
      bold: true,
      fontSize: 8,
      color: muted,
      characterSpacing: 1.2,
    },
    conclusionValue: {
      bold: true,
      fontSize: 58,
      lineHeight: 0.9,
    },
    conclusionDenominator: {
      bold: true,
      fontSize: 18,
      color: muted,
    },
    conclusionVerdict: {
      bold: true,
      fontSize: 14,
      color: accent,
    },
    coverAnswer: { bold: true, fontSize: 13, lineHeight: 1.45 },
    valuationConclusion: { bold: true, fontSize: 9.4, lineHeight: 1.55 },
    coverPosture: { bold: true, fontSize: 10, color: paper },
    metricLabel: { fontSize: 7, color: muted },
    metricValue: { bold: true, fontSize: 11 },
    sectionNumber: { bold: true, fontSize: 18 },
    sectionTitle: { bold: true, fontSize: 19, lineHeight: 1.1 },
    sectionDescription: {
      fontSize: 8,
      color: muted,
      lineHeight: 1.45,
      margin: [0, 5, 0, 0],
    },
    subhead: {
      bold: true,
      fontSize: 9,
      color: accent,
      margin: [0, 0, 0, 7],
    },
    label: { bold: true, fontSize: 7.5 },
    body: { fontSize: 7.8, lineHeight: 1.45 },
    tableHead: { bold: true, fontSize: 7.2, color: ink },
    tableBody: { fontSize: 6.8, lineHeight: 1.28 },
    tableHeadCompact: { bold: true, fontSize: 6.3, color: ink },
    tableBodyCompact: { fontSize: 5.9, lineHeight: 1.18 },
    callout: { bold: true, fontSize: 8.5, color: paper, lineHeight: 1.4 },
    foot: { fontSize: 6.5, color: muted },
  };
}

function documentDefinition({
  file,
  symbol,
  locale,
  version,
}: ResearchFilePdfProps): TDocumentDefinitions {
  const ko = locale === "ko";
  const model = buildResearchFileEditorialModel(file, locale);
  const price =
    file.marketSnapshot === undefined
      ? "—"
      : `${file.marketSnapshot.currency} ${file.marketSnapshot.price}`;
  const coverMetrics = model.headlineMetrics.map(
    (metric) => [metric.label, metric.value] as const,
  );
  const teamTableBody: TableCell[][] = [
    [
      { text: "", style: "tableHead", fillColor: accentSoft },
      {
        text: ko ? "팀·최종 투표" : "Team & final vote",
        style: "tableHead",
        fillColor: accentSoft,
      },
      {
        text: ko ? "독립 결론" : "Independent conclusion",
        style: "tableHead",
        fillColor: accentSoft,
      },
      {
        text: ko ? "핵심 근거" : "Core rationale",
        style: "tableHead",
        fillColor: accentSoft,
      },
    ],
    ...model.teamRows.map((team): TableCell[] => [
      { image: portrait(team.portraitPath), width: 24, height: 24 },
      {
        text: `${team.teamName}\n${voteLabel(team.vote, locale)}`,
        style: "tableBodyCompact",
      },
      {
        text: keepKoreanWords(team.strongestClaim),
        style: "tableBodyCompact",
      },
      {
        text: keepKoreanWords(team.evidence),
        style: "tableBodyCompact",
      },
    ]),
  ];
  const pages: Content[] = [
    {
      stack: [
        {
          canvas: [
            {
              type: "line",
              x1: 0,
              x2: 527,
              y1: 0,
              y2: 0,
              lineWidth: 9,
              lineColor: accent,
            },
          ],
        },
        {
          columns: [
            { text: `STOCKSEMBLY / ${symbol}`, style: "brand" },
            {
              text: `${ko ? "리서치 파일" : "RESEARCH FILE"} v${version}.0`,
              style: "meta",
              alignment: "right",
            },
          ],
          margin: [0, 18, 0, 52],
        },
        {
          text: ko ? "사용자 질문" : "RESEARCH MANDATE",
          style: "coverQuestionLabel",
        },
        {
          text: model.question,
          style: "coverQuestion",
          margin: [0, 10, 0, 26],
        },
        {
          table: {
            widths: ["*", 180],
            body: [
              [
                {
                  stack: [
                    {
                      text: ko ? "팀 결론 지수" : "TEAM CONCLUSION INDEX",
                      style: "conclusionLabel",
                    },
                    {
                      columns: [
                        {
                          text: String(model.conclusionIndex),
                          style: "conclusionValue",
                          width: "auto",
                        },
                        {
                          text: "/ 100",
                          style: "conclusionDenominator",
                          margin: [10, 29, 0, 0],
                        },
                      ],
                    },
                    {
                      text: ko
                        ? `팀 판단 40% · 주장 근거 35% · 최종 판단 25% · 근거 신뢰도 ${model.evidenceReliability}%`
                        : `Team votes 40% · claim evidence 35% · final posture 25% · evidence confidence ${model.evidenceReliability}%`,
                      style: "foot",
                      margin: [0, 5, 0, 0],
                    },
                  ],
                  margin: [0, 10, 0, 10],
                  border: [false, true, false, true],
                },
                {
                  text: model.conclusionLabel,
                  style: "conclusionVerdict",
                  alignment: "center",
                  margin: [10, 32, 10, 32],
                  border: [false, true, false, true],
                  borderColor: [rule, accent, accent, accent],
                },
              ],
            ],
          },
          layout: {
            hLineColor: () => ink,
            hLineWidth: () => 1.6,
            vLineColor: () => accent,
            vLineWidth: () => 1.2,
          },
          margin: [0, 0, 0, 24],
        },
        {
          table: {
            widths: [82, "*", 82],
            body: [
              [
                {
                  text: ko ? "직접 답변" : "DIRECT ANSWER",
                  style: "label",
                  border: [false, true, false, false],
                },
                {
                  text: keepKoreanWords(model.directAnswer),
                  style: "coverAnswer",
                  border: [false, true, false, false],
                },
                {
                  text: model.conclusionLabel,
                  style: "coverPosture",
                  fillColor: accent,
                  alignment: "center",
                  margin: [4, 6, 4, 6],
                  border: [false, true, false, false],
                },
              ],
            ],
          },
          layout: { hLineColor: () => ink, hLineWidth: () => 2.5 },
          margin: [0, 0, 0, 28],
        },
        {
          table: {
            widths: ["*", "*", "*", "*"],
            body: [
              coverMetrics.map(([label, value]) => ({
                stack: [
                  { text: label, style: "metricLabel" },
                  { text: value, style: "metricValue", margin: [0, 5, 0, 0] },
                ],
                border: [true, true, true, true],
                borderColor: [rule, ink, rule, ink],
                margin: [8, 8, 8, 8],
              })),
            ],
          },
          layout: { hLineColor: () => rule, vLineColor: () => rule },
        },
      ],
    },
    {
      pageBreak: "before",
      stack: [
        ...sectionTitle(
          "01",
          ko ? "투자 판단 한 장 요약" : "Decision brief",
          ko
            ? "시장에 반영된 기대와 에이전트 판단이 갈리는 지점을 먼저 봅니다."
            : "Start with where embedded expectations and the agent view diverge.",
        ),
        {
          columns: [
            {
              width: "*",
              stack: [
                {
                  text: ko ? "핵심 논쟁" : "CORE DEBATE",
                  style: "subhead",
                },
                labelValueRows(
                  model.lensRows.map((row) => ({
                    label: row.label,
                    value: row.content,
                  })),
                ),
              ],
            },
            {
              width: 194,
              stack: [
                {
                  text: ko ? "기업 핵심 지표" : "COMPANY KEY METRICS",
                  style: "subhead",
                },
                simpleTable(
                  [62, "*"],
                  [ko ? "신호" : "Signal", ko ? "현재 해석" : "Current read"],
                  model.companySnapshot.map((row) => [row.label, row.value]),
                ),
              ],
            },
          ],
          columnGap: 20,
        },
        {
          columns: [
            {
              width: "*",
              stack: [
                {
                  text: ko ? "핵심 촉매" : "KEY CATALYSTS",
                  style: "subhead",
                },
                {
                  ol: model.catalysts
                    .slice(0, 2)
                    .map(
                      (item) =>
                        `${item.headline}\n${firstPdfSentence(item.body)}`,
                    ),
                  style: "tableBodyCompact",
                },
              ],
            },
            {
              width: "*",
              stack: [
                {
                  text: ko ? "핵심 리스크" : "KEY RISKS",
                  style: "subhead",
                },
                {
                  ol: model.risks
                    .slice(0, 2)
                    .map(
                      (item) =>
                        `${item.headline}\n${firstPdfSentence(item.body)}`,
                    ),
                  style: "tableBodyCompact",
                },
              ],
            },
          ],
          columnGap: 24,
          margin: [0, 12, 0, 16],
        },
      ],
    },
    {
      pageBreak: "before",
      stack: [
        ...sectionTitle(
          "02",
          ko ? "사업·실적·핵심 논지" : "Business, earnings & key theses",
          ko
            ? "핵심 논지마다 팀의 해석, 확인된 근거와 반론, 다음 확인 조건을 함께 읽습니다."
            : "Each thesis pairs the team judgment with evidence, counterpoint, and next proof.",
        ),
        simpleTable(
          [145, 135, "*"],
          [
            ko ? "핵심 논지" : "Key thesis",
            ko ? "팀 판단" : "Team judgment",
            ko ? "근거·반론·다음 확인" : "Evidence, counterpoint & next proof",
          ],
          model.analysisRows
            .slice(0, 4)
            .map((row) => [
              `${row.id} · ${row.title}`,
              row.agentView,
              `${row.evidence}\n\n${ko ? "함께 볼 반론" : "Counterpoint"}\n${row.counterpoint}\n\n${ko ? "다음 확인" : "Next proof"}\n${row.checkpoint}${row.evidenceId === undefined ? "" : ` · ${row.evidenceId}`}`,
            ]),
        ),
      ],
    },
    {
      pageBreak: "before",
      stack: [
        ...sectionTitle(
          "03",
          ko ? "밸류에이션·기업 비교" : "Valuation & relative comparison",
          ko
            ? "현재 기대를 정당화하는 성장·수익성 근거를 비교합니다."
            : "Compare which growth and profitability evidence supports current expectations.",
        ),
        {
          columns: [
            {
              width: "*",
              stack: [
                {
                  text: ko ? "밸류에이션 결론" : "VALUATION CONCLUSION",
                  style: "subhead",
                },
                {
                  text: keepKoreanWords(model.valuationConclusion),
                  style: "valuationConclusion",
                },
              ],
            },
            {
              width: 180,
              stack: [
                {
                  text: `${ko ? "관찰 가격" : "Observed price"} · ${price}`,
                  style: "label",
                },
                {
                  text: `${ko ? "다음 검증" : "Next proof"} · ${model.nextVerificationEvent}`,
                  style: "body",
                  margin: [0, 8, 0, 0],
                },
              ],
            },
          ],
          columnGap: 24,
          margin: [0, 0, 0, 22],
        },
        {
          text: ko ? "상대 비교 렌즈" : "RELATIVE COMPARISON LENS",
          style: "subhead",
        },
        simpleTable(
          [82, 120, 120, "*"],
          [
            ko ? "비교 축" : "Dimension",
            ko ? "회사 관점" : "Company",
            ko ? "판단 기준" : "Decision lens",
            ko ? "해석" : "Interpretation",
          ],
          model.comparisonRows
            .slice(0, 3)
            .map((row) => [
              row.label,
              firstPdfSentence(row.companyView),
              firstPdfSentence(row.benchmarkLens),
              `${firstPdfSentence(row.interpretation)}${row.evidenceId === undefined ? "" : ` · ${row.evidenceId}`}`,
            ]),
          true,
        ),
        {
          text: ko ? "시나리오별 가정" : "SCENARIO ASSUMPTIONS",
          style: "subhead",
          margin: [0, 20, 0, 7],
        },
        simpleTable(
          [86, 150, "*"],
          [
            ko ? "시나리오" : "Scenario",
            ko ? "논지" : "Thesis",
            ko ? "검증된 가정" : "Audited assumptions",
          ],
          model.scenarios
            .filter(
              (_, index, scenarios) =>
                scenarios.length <= 2 ||
                index === 0 ||
                index === scenarios.length - 1,
            )
            .map((scenario) => [
              scenario.label,
              firstPdfSentence(scenario.thesis),
              scenario.assumptions.slice(0, 2).map(firstPdfSentence).join("\n"),
            ]),
          true,
        ),
      ],
    },
    {
      pageBreak: "before",
      stack: [
        ...sectionTitle(
          "04",
          ko ? "에이전트 토론·최종 판정" : "Agent debate & final judgment",
          ko
            ? "반론이 최종 판단을 어떻게 바꿨는지 기록합니다."
            : "The record shows how counterarguments changed the final wording.",
        ),
        {
          text: ko ? "팀별 독립 판단" : "INDEPENDENT TEAM VIEWS",
          style: "subhead",
        },
        {
          table: {
            headerRows: 1,
            widths: [30, 100, 190, "*"],
            body: teamTableBody,
          },
          layout: {
            hLineColor: () => rule,
            vLineColor: () => rule,
            hLineWidth: () => 0.6,
            vLineWidth: () => 0.6,
            paddingLeft: () => 5,
            paddingRight: () => 5,
            paddingTop: () => 5,
            paddingBottom: () => 5,
          },
        },
        {
          text: ko
            ? "최종 판단에 영향을 준 논쟁"
            : "DEBATES THAT CHANGED THE JUDGMENT",
          style: "subhead",
          margin: [0, 16, 0, 7],
        },
        simpleTable(
          [38, 100, 120, 120, "*"],
          [
            "ID",
            ko ? "주장" : "Claim",
            ko ? "반론" : "Counterargument",
            ko ? "재검증" : "Rechecked",
            ko ? "의장 판정" : "Chair ruling",
          ],
          model.debates.map((debate) => [
            debate.id,
            `${debate.claimOwner} · ${firstPdfSentence(debate.claim)}`,
            `${debate.counterOwner} · ${firstPdfSentence(debate.counterargument)}`,
            firstPdfSentence(debate.recheckedEvidence),
            firstPdfSentence(debate.chairRuling),
          ]),
          true,
        ),
        {
          table: {
            widths: ["*"],
            body: [
              [
                {
                  columns: [
                    {
                      image: portrait(
                        "/research/office-v7/portraits/chair.png",
                      ),
                      width: 34,
                      height: 34,
                    },
                    {
                      text: keepKoreanWords(
                        `${ko ? "의장 최종 종합" : "CHAIR SYNTHESIS"}\n${model.directAnswer}`,
                      ),
                      style: "callout",
                      margin: [8, 0, 0, 0],
                    },
                  ],
                  fillColor: accent,
                  margin: [9, 8, 9, 8],
                  border: [false, false, false, false],
                },
              ],
            ],
          },
          layout: "noBorders",
          margin: [0, 16, 0, 14],
        },
        {
          columns: [
            {
              width: "*",
              stack: [
                {
                  text: ko ? "초기 판단" : "INITIAL VIEW",
                  style: "label",
                  color: accent,
                },
                {
                  text: keepKoreanWords(model.initialView),
                  style: "tableBodyCompact",
                  margin: [0, 4, 0, 0],
                },
              ],
            },
            {
              width: "*",
              stack: [
                {
                  text: ko ? "토론 후 판단" : "POST-DEBATE VIEW",
                  style: "label",
                  color: accent,
                },
                {
                  text: keepKoreanWords(model.finalView),
                  style: "tableBodyCompact",
                  margin: [0, 4, 0, 0],
                },
              ],
            },
          ],
          columnGap: 18,
        },
      ],
    },
    {
      pageBreak: "before",
      stack: [
        ...sectionTitle(
          "A",
          ko ? "출처·근거 등록부" : "Sources & evidence register",
          ko
            ? "각 장의 판단에 연결된 자료를 발행처, 기준일, 자료 유형과 함께 정리했습니다."
            : "Sources are grouped by the report chapter they support, with publisher, observation date, and evidence class.",
        ),
        {
          columns: [
            {
              text: ko
                ? `${model.evidenceIndex.length}개 출처`
                : `${model.evidenceIndex.length} SOURCES`,
              style: "label",
              color: accent,
            },
            {
              text: ko
                ? "같은 자료가 여러 판단에 사용되면 해당 장마다 다시 표기합니다."
                : "A source is repeated when it supports more than one chapter.",
              style: "meta",
              alignment: "right",
            },
          ],
          margin: [0, 0, 0, 12],
        },
        ...model.sourceGroups
          .filter((group) => group.sources.length > 0)
          .flatMap((group): Content[] => [
            {
              columns: [
                {
                  text: group.number,
                  style: "label",
                  color: accent,
                  width: 30,
                },
                {
                  stack: [
                    { text: group.title, style: "label" },
                    {
                      text: keepKoreanWords(group.purpose),
                      style: "meta",
                      margin: [0, 2, 0, 0],
                    },
                  ],
                },
                {
                  text: ko
                    ? `${group.sources.length}개 근거`
                    : `${group.sources.length} sources`,
                  style: "meta",
                  width: 58,
                  alignment: "right",
                },
              ],
              columnGap: 6,
              margin: [0, 8, 0, 5],
            },
            simpleTable(
              [30, 82, "*", 58, 78],
              [
                "ID",
                ko ? "발행처" : "Publisher",
                ko ? "자료·연결" : "Source & location",
                ko ? "기준일" : "Observed",
                ko ? "유형" : "Class",
              ],
              group.sources.map((source) => [
                source.id,
                ...publicSourceCells(source, locale),
                sourceDate(source.observedAt, locale),
                sourceClassLabel(source.sourceClass, locale),
              ]),
              true,
            ),
          ]),
        {
          text: ko
            ? "발행처 자료는 사실 근거이며, 최종 해석과 판단은 에이전트 팀의 종합 결과입니다."
            : "Publisher material is treated as evidence; interpretation and final judgment remain the agent team's synthesis.",
          style: "foot",
          margin: [0, 14, 0, 0],
        },
      ],
    },
  ];

  return {
    pageSize: "A4",
    pageMargins: [34, 34, 34, 50],
    defaultStyle: {
      font: "Pretendard",
      fontSize: 8,
      color: ink,
      lineHeight: 1.4,
    },
    styles: styles(),
    background: () => ({
      canvas: [
        {
          type: "rect",
          x: 0,
          y: 0,
          w: 595,
          h: 842,
          color: paper,
        },
      ],
    }),
    content: pages,
  };
}

type EditorialDecision = NonNullable<
  ResearchFileData["structuredEditorial"]
>["decision"];

type EditorialClaim = NonNullable<
  ResearchFileData["structuredEditorial"]
>["claims"][number];

const stanceLabels = {
  upside_skewed: { en: "Upside skewed", ko: "상방 우위" },
  wait_for_proof: { en: "Wait for proof", ko: "확인 대기" },
  downside_skewed: { en: "Downside skewed", ko: "하방 우위" },
} as const;

const confidenceLabels = {
  high: { en: "High confidence", ko: "높은 확신" },
  medium: { en: "Medium confidence", ko: "중간 확신" },
  low: { en: "Low confidence", ko: "낮은 확신" },
} as const;

const departmentLabels = {
  market: { en: "Market timing brief", ko: "시장 타이밍 브리프" },
  company: { en: "Company operating brief", ko: "기업 운영 브리프" },
  financial: { en: "Financial expectations brief", ko: "재무 기대 브리프" },
  risk: { en: "Risk escalation brief", ko: "리스크 에스컬레이션 브리프" },
} as const;

function localize(
  value: { readonly en: string; readonly ko: string },
  locale: Locale,
): string {
  return value[locale];
}

function metricDisplay(
  metric: NonNullable<ResearchFileData["metricSnapshot"]>["metrics"][number],
  locale: Locale,
): string {
  const numberLocale = locale === "ko" ? "ko-KR" : "en-US";
  if (metric.unit === "percent")
    return `${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}%`;
  if (metric.unit === "multiple")
    return `${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 1 })}x`;
  if (metric.unit === "USD_per_share")
    return `$${metric.value.toLocaleString(numberLocale, { maximumFractionDigits: 2 })}`;
  return new Intl.NumberFormat(numberLocale, {
    maximumFractionDigits: 1,
    notation: Math.abs(metric.value) >= 1_000_000 ? "compact" : "standard",
    ...(metric.unit === "USD" ? { style: "currency", currency: "USD" } : {}),
  }).format(metric.value);
}

function v2Styles(): StyleDictionary {
  return {
    ...styles(),
    cockpitTitle: { bold: true, fontSize: 24, lineHeight: 1.14 },
    stance: { bold: true, fontSize: 21, color: accent },
    confidence: { bold: true, fontSize: 9, color: muted },
    reason: { bold: true, fontSize: 11.5, lineHeight: 1.5 },
    driverRank: { bold: true, fontSize: 16, color: accent },
    driverText: { bold: true, fontSize: 8.2, lineHeight: 1.38 },
    qaQuestion: { bold: true, fontSize: 8, color: accent },
    qaAnswer: { fontSize: 7.4, lineHeight: 1.4 },
  };
}

function card(label: string, value: string, color = "#ffffff"): Content {
  return {
    stack: [
      { text: label, style: "label", color: accent },
      { text: keepKoreanWords(value), style: "body", margin: [0, 5, 0, 0] },
    ],
    fillColor: color,
    margin: [9, 8, 9, 8],
  };
}

function v2Header(symbol: string, title: string, version: number): Content[] {
  return [
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          x2: 527,
          y1: 0,
          y2: 0,
          lineWidth: 7,
          lineColor: accent,
        },
      ],
      margin: [0, 0, 0, 14],
    },
    {
      columns: [
        { text: `STOCKSEMBLY / ${symbol}`, style: "brand" },
        { text: `${title} / v${version}.0`, style: "meta", alignment: "right" },
      ],
      margin: [0, 0, 0, 28],
    },
  ] as Content[];
}

function rankedDrivers(
  claims: readonly EditorialClaim[],
  decision: EditorialDecision,
): readonly EditorialClaim[] {
  const primaryOrder = new Map(
    decision.primaryClaimIds.map((claimId, index) => [claimId, index]),
  );
  return [...claims]
    .sort((first, second) => {
      const firstRank = primaryOrder.get(first.claimId) ?? 99;
      const secondRank = primaryOrder.get(second.claimId) ?? 99;
      if (firstRank !== secondRank) return firstRank - secondRank;
      return first.materiality === "material" ? -1 : 1;
    })
    .slice(0, 3);
}

function driverCards(
  drivers: readonly EditorialClaim[],
  locale: Locale,
): Content | undefined {
  if (drivers.length === 0) return undefined;
  return {
    table: {
      widths: drivers.map(() => "*"),
      body: [
        drivers.map((driver, index) => ({
          stack: [
            { text: String(index + 1).padStart(2, "0"), style: "driverRank" },
            {
              text: keepKoreanWords(localize(driver.publicThesis, locale)),
              style: "driverText",
              margin: [0, 7, 0, 6],
            },
            {
              text: `${publicDimensionLabel(driver.decisionDimension, locale)} / ${publicRoleLabel(driver.roleOwner, locale)}`,
              style: "foot",
            },
          ],
          fillColor: index === 0 ? accentSoft : "#ffffff",
          margin: [9, 8, 9, 8],
        })),
      ],
    },
    layout: {
      hLineColor: () => rule,
      vLineColor: () => rule,
      hLineWidth: () => 0.7,
      vLineWidth: () => 0.7,
    },
    margin: [0, 6, 0, 14],
  };
}

function metricTable(
  file: ResearchFileData,
  locale: Locale,
  categories: readonly (
    | "market"
    | "company"
    | "financial"
    | "risk"
    | "expectations"
  )[],
  ids?: readonly string[],
): Content | undefined {
  const metrics = (file.metricSnapshot?.metrics ?? []).filter(
    (metric) =>
      categories.includes(metric.category) &&
      (ids === undefined ||
        ids.some((id) => metric.id === id || metric.id.startsWith(`${id}:`))),
  );
  if (metrics.length === 0) return undefined;
  return simpleTable(
    ["*", 82, 62],
    [
      locale === "ko" ? "지표" : "Metric",
      locale === "ko" ? "실제값" : "Actual",
      locale === "ko" ? "기간" : "Period",
    ],
    metrics
      .slice(0, 8)
      .map((metric) => [
        localize(metric.label, locale),
        metricDisplay(metric, locale),
        metric.period ?? sourceDate(metric.observedAt, locale),
      ]),
  );
}

function financialBridgeTable(
  file: ResearchFileData,
  locale: Locale,
  selectedIds?: readonly string[],
): Content | undefined {
  const bridgeIds =
    selectedIds ??
    ([
      "revenue_ttm",
      "gross_margin",
      "operating_margin",
      "free_cash_flow",
      "capital_expenditures",
      "forward_pe",
    ] as const);
  const metrics = bridgeIds.flatMap((id) => {
    const matching = (file.metricSnapshot?.metrics ?? []).filter(
      (metric) => metric.id === id || metric.id.startsWith(`${id}:`),
    );
    return matching.slice(-1);
  });
  if (metrics.length === 0) return undefined;
  return simpleTable(
    ["*", 82, 62],
    [
      locale === "ko" ? "브리지 단계" : "Bridge stage",
      locale === "ko" ? "실제값" : "Actual",
      locale === "ko" ? "기간" : "Period",
    ],
    metrics.map((metric) => [
      localize(metric.label, locale),
      metricDisplay(metric, locale),
      metric.period ?? sourceDate(metric.observedAt, locale),
    ]),
  );
}

function qualifiedComparatorTable(
  file: ResearchFileData,
  locale: Locale,
): Content | undefined {
  const rows = file.metricSnapshot?.comparatorQualification?.rows.filter(
    (row) => row.displayEligibility,
  );
  if (rows === undefined || rows.length === 0) return undefined;
  return simpleTable(
    [86, 78, "*", 112],
    [
      locale === "ko" ? "비교기업" : "Comparator",
      locale === "ko" ? "역할" : "Role",
      locale === "ko" ? "선정 근거" : "Qualification",
      locale === "ko" ? "실제 지표" : "Actual metrics",
    ],
    rows.map((row) => [
      row.name,
      publicComparatorRole(row.role, locale),
      publicComparatorRationale(
        localize(row.rationale, locale),
        row.role,
        locale,
      ),
      row.normalizedMetrics.slice(0, 3).map(publicComparatorMetric).join("\n"),
    ]),
    true,
  );
}

function claimsTable(
  claims: readonly EditorialClaim[],
  locale: Locale,
): Content | undefined {
  if (claims.length === 0) return undefined;
  return simpleTable(
    [86, "*", "*"],
    [
      locale === "ko" ? "판단 축" : "Decision dimension",
      locale === "ko" ? "채택 논지" : "Authenticated claim",
      locale === "ko" ? "주장별 반증 조건" : "Claim falsifier",
    ],
    claims.map((claim) => [
      `${publicRoleLabel(claim.roleOwner, locale)}\n${publicDimensionLabel(claim.decisionDimension, locale)}`,
      localize(claim.publicThesis, locale),
      localize(claim.falsifier, locale),
    ]),
    true,
  );
}

function v2FirstPage(
  file: ResearchFileData,
  symbol: string,
  locale: Locale,
  version: number,
  decision: EditorialDecision,
  claims: readonly EditorialClaim[],
): Content {
  const ko = locale === "ko";
  const department =
    file.researchTarget?.kind === "department"
      ? file.researchTarget.departmentId
      : undefined;
  const title =
    department === undefined
      ? ko
        ? "투자위원회 판단 콕핏"
        : "Committee decision cockpit"
      : localize(departmentLabels[department], locale);
  const drivers = rankedDrivers(claims, decision);
  const price = file.marketSnapshot;
  const priceText =
    price === undefined
      ? undefined
      : `${price.currency} ${price.price}${price.change === undefined ? "" : ` / ${price.change}`}`;
  const nextEvent = localize(file.nextEvent, locale).trim();
  const firstPageMetrics =
    department === "market"
      ? metricTable(
          file,
          locale,
          ["market"],
          [
            "current_price",
            "daily_change_percent",
            "relative_performance",
            "support_price",
            "resistance_price",
            "average_volume",
          ],
        )
      : department === "company"
        ? metricTable(
            file,
            locale,
            ["company", "financial"],
            ["segment_share", "revenue_growth"],
          )
        : department === "financial"
          ? financialBridgeTable(file, locale, [
              "revenue_ttm",
              "operating_margin",
              "free_cash_flow",
              "forward_pe",
            ])
          : department === "risk"
            ? metricTable(
                file,
                locale,
                ["risk"],
                ["cash", "net_debt", "inventory", "diluted_shares"],
              )
            : undefined;
  return {
    stack: [
      ...v2Header(symbol, title, version),
      {
        text: localize(stanceLabels[decision.stance], locale),
        style: "stance",
      },
      {
        text: localize(confidenceLabels[decision.confidence], locale),
        style: "confidence",
        margin: [0, 5, 0, 14],
      },
      {
        text: keepKoreanWords(localize(decision.decisiveReason, locale)),
        style: "reason",
      },
      ...(priceText === undefined
        ? []
        : [
            {
              text: `${ko ? "현재가·변동" : "Price & change"} / ${priceText}`,
              style: "label",
              margin: [0, 10, 0, 12],
            },
          ]),
      ...(driverCards(drivers, locale) === undefined
        ? []
        : [
            {
              text: ko
                ? "인증된 핵심 판단 동인"
                : "AUTHENTICATED DECISION DRIVERS",
              style: "subhead",
              margin: [0, 18, 0, 0],
            },
            driverCards(drivers, locale) as Content,
          ]),
      {
        table: {
          widths: ["*", "*"],
          body: [
            [
              card(
                ko ? "최강 반대 논거" : "Strongest countercase",
                localize(decision.strongestCountercase, locale),
                "#fff8ed",
              ),
              card(
                ko ? "판단 무효화 조건" : "Decision falsifier",
                localize(decision.falsifier, locale),
                "#f5f5f2",
              ),
            ],
          ],
        },
        layout: {
          hLineColor: () => rule,
          vLineColor: () => rule,
          hLineWidth: () => 0.7,
          vLineWidth: () => 0.7,
        },
        margin: [0, 0, 0, 12],
      },
      ...(firstPageMetrics === undefined
        ? []
        : [
            {
              text: ko ? "실제 관찰값" : "ACTUAL OBSERVATIONS",
              style: "subhead",
            },
            firstPageMetrics,
          ]),
      ...(nextEvent.length === 0
        ? []
        : [
            {
              text: `${ko ? "다음 이벤트" : "Next event"} / ${nextEvent}`,
              style: "label",
              color: accent,
              margin: [0, 13, 0, 0],
            },
          ]),
    ],
  } as Content;
}

function teamDetailPage(
  file: ResearchFileData,
  locale: Locale,
  department: "market" | "company" | "financial" | "risk",
  claims: readonly EditorialClaim[],
): Content {
  const ko = locale === "ko";
  const titles = {
    market: ko
      ? "레짐·상대성과·가격 레벨"
      : "Regime, relative performance & price levels",
    company: ko
      ? "성장 엔진·채택·해자 검증"
      : "Growth engine, adoption & moat verification",
    financial: ko
      ? "매출→마진→현금 전환·내재 기대"
      : "Revenue to margin to cash conversion & expectations",
    risk: ko
      ? "하방 경로·선행지표·에스컬레이션"
      : "Downside path, leading indicators & escalation",
  } as const;
  const metricCategories =
    department === "financial"
      ? (["financial", "expectations"] as const)
      : ([department] as const);
  const metrics =
    department === "financial"
      ? financialBridgeTable(file, locale)
      : metricTable(file, locale, metricCategories);
  const comparators =
    department === "company" || department === "financial"
      ? qualifiedComparatorTable(file, locale)
      : undefined;
  return {
    pageBreak: "before",
    stack: [
      ...sectionTitle(
        "02",
        titles[department],
        ko
          ? "구조화된 팀 근거만 인쇄합니다."
          : "Only structured team evidence is printed.",
      ),
      ...(metrics === undefined
        ? []
        : [
            {
              text: ko ? "검증된 실제 지표" : "VERIFIED ACTUAL METRICS",
              style: "subhead",
            },
            metrics,
          ]),
      ...(comparators === undefined
        ? []
        : [
            {
              text: ko ? "자격을 갖춘 비교" : "QUALIFIED COMPARISON",
              style: "subhead",
              margin: [0, 18, 0, 7],
            },
            comparators,
          ]),
      ...(claimsTable(claims, locale) === undefined
        ? []
        : [
            {
              text: ko ? "팀 판단 모듈" : "TEAM DECISION MODULE",
              style: "subhead",
              margin: [0, 18, 0, 7],
            },
            claimsTable(claims, locale) as Content,
          ]),
    ],
  } as Content;
}

function committeeDetailPages(
  file: ResearchFileData,
  locale: Locale,
  claims: readonly EditorialClaim[],
): Content[] {
  const ko = locale === "ko";
  const conflicts = file.structuredEditorial?.conflicts ?? [];
  const valuation = qualifiedComparatorTable(file, locale);
  const catalysts = claims.filter(
    (claim) => claim.decisionDimension === "catalyst",
  );
  const analysisClaims = claims.filter(
    (claim) => claim.decisionDimension !== "catalyst",
  );
  return [
    {
      pageBreak: "before",
      stack: [
        ...sectionTitle(
          "02",
          ko
            ? "위원회 충돌·밸류에이션·촉매"
            : "Committee conflict, valuation & catalysts",
          ko
            ? "채택된 이견과 자격을 갖춘 비교만 표시합니다."
            : "Only authenticated conflicts and qualified comparisons are shown.",
        ),
        ...(conflicts.length === 0
          ? []
          : [
              { text: ko ? "팀 충돌" : "TEAM CONFLICTS", style: "subhead" },
              simpleTable(
                [200, "*"],
                [
                  ko ? "주장" : "Claim",
                  ko ? "반대 근거 ID" : "Counterevidence IDs",
                ],
                conflicts.map((conflict) => [
                  conflict.claimId,
                  conflict.counterevidenceArtifactIds.join(", "),
                ]),
                true,
              ),
            ]),
        ...(valuation === undefined
          ? []
          : [
              {
                text: ko
                  ? "자격을 갖춘 밸류에이션 비교"
                  : "QUALIFIED VALUATION COMPARISON",
                style: "subhead",
                margin: [0, 18, 0, 7],
              },
              valuation,
            ]),
        ...(catalysts.length === 0
          ? []
          : [
              {
                text: ko ? "날짜 기반 촉매" : "DATED CATALYSTS",
                style: "subhead",
                margin: [0, 18, 0, 7],
              },
              claimsTable(catalysts, locale) as Content,
            ]),
      ],
    },
    {
      pageBreak: "before",
      stack: [
        ...sectionTitle(
          "03",
          ko ? "채택 분석" : "Adjudicated analysis",
          ko
            ? "주장·반증·담당 팀을 함께 읽습니다."
            : "Claims, falsifiers, and owning teams remain connected.",
        ),
        ...(claimsTable(analysisClaims, locale) === undefined
          ? []
          : [claimsTable(analysisClaims, locale) as Content]),
      ],
    },
  ] as Content[];
}

function qaPage(file: ResearchFileData, locale: Locale): Content | undefined {
  const questions = [...(file.anticipatedQuestions ?? [])].sort(
    (first, second) => (second.rank ?? 0) - (first.rank ?? 0),
  );
  if (questions.length === 0) return undefined;
  const ko = locale === "ko";
  return {
    pageBreak: "before",
    stack: [
      ...sectionTitle(
        "Q",
        ko ? "상위 예상 질문과 답변" : "Top anticipated questions & answers",
        ko
          ? "발행 전에 저장·검증된 답변입니다."
          : "Answers were persisted and validated before publication.",
      ),
      ...questions.map(
        (question, index): Content => ({
          stack: [
            {
              text: `${index + 1}. ${localize(question.question, locale)}`,
              style: "qaQuestion",
            },
            {
              text: keepKoreanWords(localize(question.answer, locale)),
              style: "qaAnswer",
              margin: [0, 4, 0, 0],
            },
          ],
          margin: [0, 0, 0, 10],
        }),
      ),
    ],
  };
}

function sourceAppendixPage(file: ResearchFileData, locale: Locale): Content {
  const ko = locale === "ko";
  const limitation = localize(file.limitationNote, locale).trim();
  return {
    pageBreak: "before",
    stack: [
      ...sectionTitle(
        "A",
        ko ? "완전한 출처·근거 부록" : "Complete source & evidence appendix",
        ko
          ? "공개 판단의 출처와 관찰 시점을 보존합니다."
          : "Publisher, observation date, and evidence class are preserved.",
      ),
      ...(file.evidenceIndex.length === 0
        ? []
        : [
            simpleTable(
              [34, 82, "*", 60, 74],
              [
                "ID",
                ko ? "발행처" : "Publisher",
                ko ? "자료·연결" : "Source & location",
                ko ? "기준일" : "Observed",
                ko ? "유형" : "Class",
              ],
              file.evidenceIndex.map((source) => [
                source.id,
                ...publicSourceCells(source, locale),
                sourceDate(source.observedAt, locale),
                sourceClassLabel(source.sourceClass, locale),
              ]),
              true,
            ),
          ]),
      ...(limitation.length === 0
        ? []
        : [
            {
              text: keepKoreanWords(limitation),
              style: "foot",
              margin: [0, 18, 0, 6],
            },
          ]),
      {
        text: ko
          ? "출처 자료는 사실 근거이며 최종 해석은 Stocksembly 에이전트 팀의 종합 결과입니다. 개인화된 매매 지시가 아니며 수익을 약속하지 않습니다. 투자 판단과 손실 책임은 이용자에게 있습니다. 문의: kicoa24@gmail.com"
          : "Source material is factual evidence; final interpretation is the Stocksembly agent team's synthesis. This is not personalized trading instruction or a return guarantee. Investment decisions and losses remain the user's responsibility. Contact: kicoa24@gmail.com",
        style: "foot",
      },
    ],
  } as Content;
}

export function buildResearchFilePdfDocument(
  props: ResearchFilePdfProps,
): TDocumentDefinitions {
  if (
    props.file.presentationVersion !== "workflow-v2" ||
    props.file.structuredEditorial === undefined
  )
    return documentDefinition(props);
  const structuredEditorial = props.file.structuredEditorial;
  const { file, symbol, locale, version, createdAt } = props;
  const { decision, claims } = structuredEditorial;
  const department =
    file.researchTarget?.kind === "department"
      ? file.researchTarget.departmentId
      : undefined;
  const qa = qaPage(file, locale);
  const content: Content[] = [
    v2FirstPage(file, symbol, locale, version, decision, claims),
    ...(department === undefined
      ? committeeDetailPages(file, locale, claims)
      : [teamDetailPage(file, locale, department, claims)]),
    ...(qa === undefined ? [] : [qa]),
    sourceAppendixPage(file, locale),
  ];
  return {
    pageSize: "A4",
    pageMargins: [34, 34, 34, 48],
    defaultStyle: {
      font: "Pretendard",
      fontSize: 8,
      color: ink,
      lineHeight: 1.4,
    },
    styles: v2Styles(),
    background: () => ({
      canvas: [{ type: "rect", x: 0, y: 0, w: 595, h: 842, color: paper }],
    }),
    footer: (currentPage, pageCount) => ({
      columns: [
        {
          text: `${symbol} / ${sourceDate(createdAt, locale)}`,
          style: "foot",
          margin: [34, 0, 0, 0],
        },
        {
          text: `${currentPage} / ${pageCount}`,
          style: "foot",
          alignment: "right",
          margin: [0, 0, 34, 0],
        },
      ],
    }),
    content,
  };
}

export async function renderEditorialResearchReportPdf(
  props: PdfProps,
): Promise<Buffer> {
  return await renderResearchFilePdf({
    file: researchReportToFile(props.report, props.createdAt),
    symbol: props.symbol,
    locale: props.locale,
    createdAt: props.createdAt,
    version: props.report.version,
  });
}

export async function renderResearchFilePdf(
  props: ResearchFilePdfProps,
): Promise<Buffer> {
  const document = printer.createPdfKitDocument(
    buildResearchFilePdfDocument(props),
  );
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    document.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.from(chunk));
    });
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.end();
  });
}
