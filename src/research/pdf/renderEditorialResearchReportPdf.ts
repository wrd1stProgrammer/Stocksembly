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
import type { ResearchReport } from "../domain/report";
import { buildResearchFileEditorialModel } from "../researchFileEditorialModel";
import { researchReportToFile } from "../researchReportToFile";

type PdfProps = {
  readonly report: ResearchReport;
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
      en: "Licensed market data",
      ko: "라이선스 시장 데이터",
    },
    sec_primary_filing: { en: "SEC filing", ko: "SEC 공시" },
    sec_company_facts: { en: "SEC XBRL", ko: "SEC XBRL" },
    treasury_yield: { en: "Official macro data", ko: "공식 거시 데이터" },
  };
  return labels[sourceClass]?.[locale] ?? sourceClass.replaceAll("_", " ");
}

function firstPdfSentence(value: string): string {
  return value.split(/(?<=[.!?。])\s+/u, 1)[0]?.trim() ?? value;
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
  };
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
  };
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
          model.comparisonRows.slice(0, 3).map((row) => [
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
              scenario.assumptions
                .slice(0, 2)
                .map(firstPdfSentence)
                .join("\n"),
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
        {
          stack: [
            {
              text: ko ? "근거 및 방법론" : "EVIDENCE & METHODOLOGY",
              style: "subhead",
              margin: [0, 18, 0, 7],
            },
            simpleTable(
              [38, 92, "*", 72],
              [
                "ID",
                ko ? "발행처" : "Publisher",
                ko ? "자료" : "Source",
                ko ? "유형" : "Class",
              ],
              model.evidenceIndex
                .slice(0, 4)
                .map((source) => [
                  source.id,
                  source.publisher,
                  source.title,
                  sourceClassLabel(source.sourceClass, locale),
                ]),
              true,
            ),
          ],
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
  const document = printer.createPdfKitDocument(documentDefinition(props));
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
