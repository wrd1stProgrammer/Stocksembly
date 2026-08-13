import path from "node:path";
import PdfPrinter from "pdfmake";
import type {
  Content,
  ContentStack,
  StyleDictionary,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import type { Locale } from "../../lib/i18n";
import type { ResearchReport } from "../domain/report";
import { compactNarrative, readerSourceLabel } from "../researchPresentation";
import { researchReportToFile } from "../researchReportToFile";

type PdfProps = {
  readonly report: ResearchReport;
  readonly symbol: string;
  readonly locale: Locale;
  readonly createdAt: string;
};

const colors = {
  ink: "#111318",
  soft: "#5d6470",
  line: "#d9dde4",
  paper: "#fbfaf6",
  panel: "#f3efe6",
  midnight: "#0b1019",
  accent: "#e7a91a",
  signal: "#e5483f",
  blue: "#4268ff",
  positive: "#17875f",
  caution: "#b15d15",
};

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

function localized<T extends { readonly en: string; readonly ko: string }>(
  value: T,
  locale: Locale,
): string {
  return value[locale];
}

function page(
  title: string,
  number: number,
  content: Content[],
  forceBreak = true,
): ContentStack {
  return {
    pageBreak: number === 1 || !forceBreak ? undefined : "before",
    stack: [
      {
        columns: [
          { text: "SERN / STOCKSEMBLY", style: "brand" },
          { text: title, style: "pageLabel", alignment: "right" },
        ],
      },
      {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: 503,
            y2: 0,
            lineWidth: 1.5,
            lineColor: colors.signal,
          },
        ],
        margin: [0, 12, 0, 24],
      },
      ...content,
    ],
  };
}

function panel(title: string, body: string, accent = colors.blue): Content {
  return {
    unbreakable: true,
    margin: [0, 0, 0, 11],
    table: {
      widths: [4, "*"],
      body: [
        [
          { text: "", fillColor: accent, border: [false, false, false, false] },
          {
            stack: [
              { text: title, style: "panelTitle" },
              { text: body, style: "body", margin: [0, 5, 0, 0] },
            ],
            fillColor: colors.panel,
            margin: [14, 12, 14, 12],
            border: [false, false, false, false],
          },
        ],
      ],
    },
    layout: "noBorders",
  } as Content;
}

function bulletList(items: readonly string[], color: string): Content {
  return {
    ul: items.length > 0 ? [...items] : ["—"],
    color,
    fontSize: 9,
    lineHeight: 1.45,
    margin: [0, 5, 0, 0],
  };
}

function styles(): StyleDictionary {
  return {
    brand: { bold: true, fontSize: 9, color: colors.ink },
    pageLabel: { fontSize: 8, color: colors.soft },
    pageFoot: { fontSize: 7, color: colors.soft },
    eyebrow: {
      bold: true,
      fontSize: 8,
      color: colors.accent,
      characterSpacing: 1.6,
    },
    coverSymbol: {
      bold: true,
      fontSize: 38,
      color: "#f7f8fb",
      margin: [0, 62, 0, 13],
    },
    coverSubtitle: {
      fontSize: 13,
      lineHeight: 1.45,
      color: "#b8c0ce",
    },
    title: {
      bold: true,
      fontSize: 22,
      lineHeight: 1.15,
      color: colors.ink,
      margin: [0, 0, 0, 10],
    },
    lead: {
      fontSize: 10.5,
      lineHeight: 1.55,
      color: colors.soft,
      margin: [0, 0, 0, 18],
    },
    sectionTitle: {
      bold: true,
      fontSize: 11,
      color: colors.ink,
      margin: [0, 7, 0, 5],
    },
    body: { fontSize: 9, lineHeight: 1.5, color: colors.ink },
    muted: { fontSize: 8, lineHeight: 1.45, color: colors.soft },
    panelTitle: { bold: true, fontSize: 9, color: colors.ink },
    metricLabel: { fontSize: 7, color: colors.soft },
    metricValue: { bold: true, fontSize: 15, color: colors.ink },
    teamName: { bold: true, fontSize: 10, color: colors.ink },
    vote: { bold: true, fontSize: 8, color: colors.caution },
    sourceHead: { bold: true, fontSize: 7, color: colors.soft },
    sourceCell: { fontSize: 7, color: colors.ink, lineHeight: 1.3 },
  };
}

function documentDefinition({
  report,
  symbol,
  locale,
  createdAt,
}: PdfProps): TDocumentDefinitions {
  const file = researchReportToFile(report, createdAt);
  const ko = locale === "ko";
  const direction = report.researchDirection;
  const voteLabels = ko
    ? {
        support: "지지",
        support_with_reservations: "조건부 지지",
        oppose: "반대",
        abstain: "유보",
      }
    : {
        support: "Support",
        support_with_reservations: "Qualified support",
        oppose: "Oppose",
        abstain: "Abstain",
      };
  const limitations = report.limitations.map((item) => item.capability);
  const analysis = file.analysis.slice(0, 4);
  const scenarios = file.scenarios.slice(0, 3);

  const content: Content[] = [
    {
      stack: [
        { text: "SERN  ·  RESEARCH FILE", style: "eyebrow" },
        { text: symbol, style: "coverSymbol" },
        {
          text: ko
            ? "11명의 전문 에이전트와 독립 의장이 공개 근거를 조사하고,\n반론과 감사를 거쳐 종합한 기업 리서치"
            : "Eleven specialist agents and an independent chair investigate public evidence,\nchallenge conclusions, and publish one audited research file.",
          style: "coverSubtitle",
        },
        {
          text: localized(file.thesis, locale),
          bold: true,
          fontSize: 17,
          lineHeight: 1.35,
          color: "#f7f8fb",
          margin: [0, 42, 118, 0],
        },
        {
          margin: [0, 30, 210, 0],
          table: {
            widths: [4, "*"],
            body: [
              [
                {
                  text: "",
                  fillColor: colors.accent,
                  border: [false, false, false, false],
                },
                {
                  stack: [
                    {
                      text: ko ? "정성 판단" : "EVIDENCE POSTURE",
                      style: "eyebrow",
                    },
                    {
                      text: localized(file.postureLabel, locale),
                      bold: true,
                      fontSize: 23,
                      color: "#f7f8fb",
                      margin: [0, 6, 0, 7],
                    },
                    {
                      text: localized(file.limitationNote, locale),
                      fontSize: 8,
                      lineHeight: 1.45,
                      color: "#aeb7c7",
                    },
                  ],
                  fillColor: "#151d2a",
                  margin: [15, 13, 15, 13],
                  border: [false, false, false, false],
                },
              ],
            ],
          },
          layout: "noBorders",
        },
        ...(file.marketSnapshot === undefined
          ? []
          : [
              {
                text: `${ko ? "현재가" : "CURRENT PRICE"}  ${file.marketSnapshot.currency} ${file.marketSnapshot.price}  ·  ${file.marketSnapshot.marketState}  ·  ${new Date(file.marketSnapshot.observedAt).toLocaleString(ko ? "ko-KR" : "en-US")}`,
                color: "#dce5f2",
                fontSize: 8,
                margin: [0, 18, 0, 0] as [number, number, number, number],
              },
            ]),
      ],
    },
    page(ko ? "핵심 판단" : "Executive brief", 2, [
      {
        text: ko ? "10초 안에 읽는 결론" : "The ten-second brief",
        style: "title",
      },
      {
        text: localized(file.thesis, locale),
        style: "lead",
      },
      ...(direction === undefined
        ? []
        : [
            panel(
              ko ? "에이전트 조사 방향" : "Agent research mandate",
              direction,
              colors.accent,
            ),
          ]),
      {
        table: {
          widths: ["*", "*", "*", "*"],
          body: [
            [
              [
                { text: ko ? "근거 판단" : "Posture", style: "metricLabel" },
                {
                  text: localized(file.postureLabel, locale),
                  style: "metricValue",
                },
              ],
              [
                { text: ko ? "감사" : "Audit", style: "metricLabel" },
                {
                  text: `${file.evidenceScore.passed}/${file.evidenceScore.denominator}`,
                  style: "metricValue",
                },
              ],
              [
                { text: ko ? "주장" : "Claims", style: "metricLabel" },
                { text: String(file.claimCount), style: "metricValue" },
              ],
              [
                { text: ko ? "출처" : "Sources", style: "metricLabel" },
                { text: String(file.sourceCount), style: "metricValue" },
              ],
            ],
          ],
        },
        layout: {
          hLineColor: () => colors.line,
          vLineColor: () => colors.line,
          paddingLeft: () => 11,
          paddingRight: () => 11,
          paddingTop: () => 9,
          paddingBottom: () => 9,
        },
        margin: [0, 0, 0, 15],
      },
      ...(file.qualityScorecard === undefined
        ? []
        : [
            {
              table: {
                widths: ["*", "*", "*"],
                body: [
                  [
                    `${ko ? "근거 충족" : "Evidence coverage"}  ${file.qualityScorecard.evidenceCoverage}%`,
                    `${ko ? "최신성" : "Freshness"}  ${file.qualityScorecard.freshnessCoverage}%`,
                    `${ko ? "반론 해소" : "Rebuttal resolution"}  ${file.qualityScorecard.rebuttalResolution}%`,
                  ],
                ],
              },
              layout: "lightHorizontalLines",
              margin: [0, 0, 0, 15] as [number, number, number, number],
            } as Content,
          ]),
      {
        table: {
          widths: ["*", "*"],
          body: [
            [
              {
                stack: [
                  {
                    text: ko ? "가격에 반영된 기대" : "Priced expectations",
                    style: "metricLabel",
                  },
                  {
                    text: localized(file.expectation, locale),
                    style: "body",
                    margin: [0, 6, 0, 0],
                  },
                ],
                margin: [11, 10, 11, 10],
              },
              {
                stack: [
                  {
                    text: ko ? "밸류에이션 판단" : "Valuation posture",
                    style: "metricLabel",
                  },
                  {
                    text: localized(file.valuation, locale),
                    style: "body",
                    margin: [0, 6, 0, 0],
                  },
                ],
                margin: [11, 10, 11, 10],
              },
            ],
            [
              {
                stack: [
                  {
                    text: ko ? "다음 검증 이벤트" : "Next confirming event",
                    style: "metricLabel",
                  },
                  {
                    text: localized(file.nextEvent, locale),
                    style: "body",
                    margin: [0, 6, 0, 0],
                  },
                ],
                margin: [11, 10, 11, 10],
              },
              {
                stack: [
                  {
                    text: ko ? "데이터 최신성" : "Data freshness",
                    style: "metricLabel",
                  },
                  {
                    text: localized(file.freshness, locale),
                    style: "body",
                    margin: [0, 6, 0, 0],
                  },
                ],
                margin: [11, 10, 11, 10],
              },
            ],
          ],
        },
        layout: {
          hLineColor: () => colors.line,
          vLineColor: () => colors.line,
        },
        margin: [0, 0, 0, 18],
      },
      {
        columns: [
          {
            width: "*",
            stack: [
              {
                text: ko ? "확인된 강점" : "Supported strengths",
                style: "sectionTitle",
              },
              bulletList(
                file.positives
                  .slice(0, 3)
                  .map((item) => localized(item, locale)),
                colors.positive,
              ),
            ],
          },
          {
            width: "*",
            stack: [
              {
                text: ko ? "남은 우려" : "Open concerns",
                style: "sectionTitle",
              },
              bulletList(
                file.concerns
                  .slice(0, 3)
                  .map((item) => localized(item, locale)),
                colors.caution,
              ),
            ],
          },
        ],
        columnGap: 24,
      },
    ]),
    page(ko ? "핵심 분석" : "Core analysis", 3, [
      {
        text: ko ? "근거가 말하는 것" : "What the evidence says",
        style: "title",
      },
      {
        text: localized(file.condition, locale),
        style: "lead",
      },
      ...analysis.map((item) =>
        panel(
          localized(item.title, locale),
          [localized(item.summary, locale), localized(item.detail, locale)]
            .filter(Boolean)
            .join(" "),
        ),
      ),
    ]),
    page(
      ko ? "시나리오" : "Scenarios",
      4,
      [
        {
          text: ko ? "무엇이 판단을 바꾸는가" : "What changes the view",
          style: "title",
        },
        {
          text: localized(file.changeCondition, locale),
          style: "lead",
        },
        ...scenarios.map(
          (scenario) =>
            ({
              unbreakable: true,
              margin: [0, 0, 0, 12],
              table: {
                widths: [72, "*"],
                body: [
                  [
                    {
                      stack: [
                        {
                          text: scenario.probability,
                          bold: true,
                          fontSize: 15,
                        },
                        {
                          text: localized(scenario.label, locale),
                          style: "muted",
                          margin: [0, 5, 0, 0],
                        },
                      ],
                      fillColor: colors.panel,
                      margin: [12, 12, 12, 12],
                      border: [true, true, false, true],
                      borderColor: [
                        colors.line,
                        colors.line,
                        colors.line,
                        colors.line,
                      ],
                    },
                    {
                      stack: [
                        {
                          text: localized(scenario.thesis, locale),
                          style: "panelTitle",
                        },
                        bulletList(
                          scenario.assumptions.map((item) =>
                            item.kind === "metric"
                              ? `${localized(item.metric, locale)} ${localized(item.displayValue, locale)}`
                              : localized(item.note, locale),
                          ),
                          colors.soft,
                        ),
                      ],
                      margin: [13, 11, 13, 11],
                      borderColor: [
                        colors.line,
                        colors.line,
                        colors.line,
                        colors.line,
                      ],
                    },
                  ],
                ],
              },
            }) as Content,
        ),
        panel(
          ko ? "다음 확인 이벤트" : "Next confirming event",
          localized(file.nextEvent, locale),
          colors.accent,
        ),
      ],
      false,
    ),
    page(ko ? "팀 판단·토론" : "Team debate", 5, [
      {
        text: ko
          ? "네 팀의 독립 판단과 최종 판정"
          : "Four independent team views and the final decision",
        style: "title",
      },
      {
        text: ko
          ? "독립 조사 결과를 부서 안에서 합친 뒤 다른 팀이 반론하고, 의장은 통과한 근거와 보존된 이견만 최종 판단에 사용합니다."
          : "Independent findings are consolidated within departments, challenged across teams, and filtered by the chair into supported evidence and preserved dissent.",
        style: "lead",
      },
      ...file.teamViews.map(
        (team) =>
          ({
            unbreakable: true,
            margin: [0, 0, 0, 10],
            table: {
              widths: ["*", 92],
              body: [
                [
                  {
                    stack: [
                      {
                        text: localized(team.teamName, locale),
                        style: "teamName",
                      },
                      {
                        text: localized(team.position, locale),
                        style: "body",
                        margin: [0, 7, 0, 0],
                      },
                      {
                        text: localized(team.rationale, locale),
                        style: "muted",
                        margin: [0, 5, 0, 0],
                      },
                    ],
                    margin: [13, 11, 13, 11],
                    borderColor: [colors.line, colors.line, false, colors.line],
                  },
                  {
                    text: voteLabels[team.vote],
                    style: "vote",
                    alignment: "right",
                    fillColor: "#fff8e8",
                    margin: [8, 12, 11, 8],
                    borderColor: [false, colors.line, colors.line, colors.line],
                  },
                ],
              ],
            },
          }) as Content,
      ),
    ]),
    page(ko ? "근거 등록부" : "Evidence register", 6, [
      {
        text: ko ? "감사된 공개 출처" : "Audited public sources",
        style: "title",
      },
      {
        text: ko
          ? `${file.sourceCount}개 출처가 ${file.claimCount}개 공개 주장에 연결되었습니다.`
          : `${file.sourceCount} sources are linked to ${file.claimCount} public claims.`,
        style: "lead",
      },
      {
        text: ko ? "주장–근거 매트릭스" : "Claim–evidence matrix",
        style: "sectionTitle",
      },
      ...(file.claimMatrix === undefined || file.claimMatrix.length === 0
        ? []
        : [
            {
              table: {
                headerRows: 1,
                widths: ["*", 76, 58],
                body: [
                  [
                    { text: ko ? "주장" : "Claim", style: "sourceHead" },
                    { text: ko ? "판정" : "Verdict", style: "sourceHead" },
                    { text: ko ? "출처" : "Sources", style: "sourceHead" },
                  ],
                  ...file.claimMatrix.slice(0, 6).map((item) => [
                    {
                      text: compactNarrative(localized(item.claim, locale), {
                        sentences: 1,
                        characters: 110,
                      }),
                      style: "sourceCell",
                    },
                    {
                      text: item.verdict.replaceAll("_", " "),
                      style: "sourceCell",
                    },
                    { text: String(item.sourceCount), style: "sourceCell" },
                  ]),
                ],
              },
              layout: "lightHorizontalLines",
              margin: [0, 0, 0, 14] as [number, number, number, number],
            } as Content,
          ]),
      {
        text: ko ? "출처 등록부" : "Source register",
        style: "sectionTitle",
      },
      {
        table: {
          headerRows: 1,
          widths: [96, "*", 90],
          body: [
            [
              { text: ko ? "발행처" : "Publisher", style: "sourceHead" },
              { text: ko ? "자료" : "Evidence", style: "sourceHead" },
              { text: ko ? "분류" : "Class", style: "sourceHead" },
            ],
            ...report.sources.slice(0, 8).map((source) => {
              const label = readerSourceLabel(source);
              return [
                { text: label.publisher, style: "sourceCell" },
                {
                  text: compactNarrative(label.title, {
                    sentences: 1,
                    characters: 92,
                  }),
                  style: "sourceCell",
                },
                {
                  text: source.sourceClass.replaceAll("_", " "),
                  style: "sourceCell",
                },
              ];
            }),
          ],
        },
        layout: {
          fillColor: (rowIndex: number) =>
            rowIndex === 0 ? colors.panel : null,
          hLineColor: () => colors.line,
          vLineColor: () => colors.line,
          paddingLeft: () => 7,
          paddingRight: () => 7,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      } as Content,
      ...(report.sources.length > 8
        ? [
            {
              text: `+ ${report.sources.length - 8} ${ko ? "개 출처는 웹 Research File의 전체 근거 목록에서 확인할 수 있습니다." : "additional sources are available in the full web Research File."}`,
              style: "muted",
              margin: [0, 9, 0, 0] as [number, number, number, number],
            } as Content,
          ]
        : []),
    ]),
    page(
      ko ? "방법론·한계" : "Methodology and limitations",
      7,
      [
        {
          text: ko ? "이 보고서를 읽는 법" : "How to read this report",
          style: "title",
        },
        {
          text: ko
            ? "11명의 전문 에이전트는 독립 조사 후 부서 합의, 상호 반론, 구조·의미 감사를 거쳤습니다. 벤치마크·크로스에셋 분석가는 지수·섹터 ETF·동종사·금리 민감도를 별도로 검증합니다."
            : "Eleven specialists research independently, consolidate by department, challenge one another, and pass structural and semantic audits. The benchmark analyst separately tests indices, sector ETFs, peers, and rate sensitivity.",
          style: "lead",
        },
        {
          text: ko ? "감사 결과" : "Audit result",
          style: "sectionTitle",
        },
        bulletList(
          report.metrics.map(
            (metric) => `${metric.id}: ${metric.passed}/${metric.denominator}`,
          ),
          colors.ink,
        ),
        {
          text: ko ? "데이터 기능과 한계" : "Data capabilities and limitations",
          style: "sectionTitle",
          margin: [0, 17, 0, 5] as [number, number, number, number],
        } as Content,
        bulletList(
          report.capabilities.map(
            (capability) =>
              `${capability.key.replaceAll("_", " ")} — ${capability.availability.replaceAll("_", " ")}`,
          ),
          colors.ink,
        ),
        panel(
          ko ? "공개된 한계" : "Disclosed limitations",
          [
            ...limitations.slice(0, 4),
            ko
              ? "현재가·가격 기반 밸류에이션 또는 컨센서스 기능이 제공되지 않을 때 정성 판단은 매매 지시, 목표가 또는 수익 보장이 아닙니다."
              : "Where price-derived valuation or consensus is unavailable, the qualitative posture is not a trade instruction, price target, or return guarantee.",
          ].join(" "),
          colors.caution,
        ),
        {
          text: ko
            ? "투자 판단과 손실 책임은 이용자에게 있습니다. 문의: kicoa24@gmail.com"
            : "Investment decisions and losses remain the user's responsibility. Contact: kicoa24@gmail.com",
          style: "muted",
          margin: [0, 10, 0, 0],
        },
      ],
      false,
    ),
  ];

  return {
    info: {
      title: `${symbol} Research File v${report.version}.0`,
      author: "SERN",
      subject: "Evidence-audited equity research",
    },
    pageSize: "A4",
    pageMargins: [46, 48, 46, 46],
    defaultStyle: {
      font: "Pretendard",
      fontSize: 9.5,
      color: colors.ink,
    },
    background: (currentPage: number) =>
      currentPage === 1
        ? {
            canvas: [
              {
                type: "rect",
                x: 0,
                y: 0,
                w: 595.28,
                h: 841.89,
                color: colors.midnight,
              },
            ],
          }
        : {
            canvas: [
              {
                type: "rect",
                x: 0,
                y: 0,
                w: 595.28,
                h: 841.89,
                color: colors.paper,
              },
            ],
          },
    styles: styles(),
    footer: (currentPage: number) => ({
      margin: [46, 0, 46, 18],
      columns:
        currentPage === 1
          ? [
              {
                text: `Research File v${report.version}.0`,
                fontSize: 7,
                color: "#8c97a8",
              },
              {
                text: createdAt.slice(0, 10),
                fontSize: 7,
                color: "#8c97a8",
                alignment: "center",
              },
              {
                text: `${file.sourceCount} ${ko ? "개 출처" : "sources"} · ${file.claimCount} ${ko ? "개 주장" : "claims"}`,
                fontSize: 7,
                color: "#8c97a8",
                alignment: "right",
              },
            ]
          : [
              {
                text: "AI equity research · public evidence",
                fontSize: 7,
                color: colors.soft,
              },
              {
                text: String(currentPage).padStart(2, "0"),
                fontSize: 7,
                color: colors.soft,
                alignment: "right",
              },
            ],
    }),
    content,
  };
}

export async function renderResearchReportWithPdfMake(
  props: PdfProps,
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
