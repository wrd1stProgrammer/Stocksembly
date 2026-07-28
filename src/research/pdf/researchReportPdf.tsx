import path from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Locale } from "../../lib/i18n";
import type { ResearchReport } from "../domain/report";
import { compactNarrative, readerSourceLabel } from "../researchPresentation";
import { researchReportToFile } from "../researchReportToFile";
import { renderEditorialResearchReportPdf } from "./renderEditorialResearchReportPdf";

Font.register({
  family: "Pretendard",
  fonts: [
    {
      src: path.join(
        process.cwd(),
        "node_modules/pretendard/dist/public/static/Pretendard-Regular.otf",
      ),
      fontWeight: 400,
    },
    {
      src: path.join(
        process.cwd(),
        "node_modules/pretendard/dist/public/static/Pretendard-SemiBold.otf",
      ),
      fontWeight: 600,
    },
    {
      src: path.join(
        process.cwd(),
        "node_modules/pretendard/dist/public/static/Pretendard-Bold.otf",
      ),
      fontWeight: 700,
    },
  ],
});

const colors = {
  ink: "#111318",
  soft: "#5d6470",
  line: "#d9dde4",
  paper: "#fbfbfa",
  panel: "#f2f4f7",
  midnight: "#0b1019",
  accent: "#e7a91a",
  blue: "#4268ff",
  positive: "#17875f",
  caution: "#b15d15",
};

const styles = StyleSheet.create({
  page: {
    padding: "48 46 46",
    color: colors.ink,
    backgroundColor: colors.paper,
    fontFamily: "Pretendard",
    fontSize: 9.5,
    lineHeight: 1.55,
  },
  cover: {
    padding: "54 48",
    color: "#f7f8fb",
    backgroundColor: colors.midnight,
    fontFamily: "Pretendard",
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.8,
  },
  coverTitle: {
    marginTop: 68,
    fontSize: 42,
    fontWeight: 700,
    lineHeight: 1.06,
  },
  coverSubtitle: {
    width: "78%",
    marginTop: 16,
    color: "#b8c0ce",
    fontSize: 15,
    lineHeight: 1.45,
  },
  postureBox: {
    width: "58%",
    marginTop: 54,
    padding: 18,
    borderLeft: `4 solid ${colors.accent}`,
    backgroundColor: "#151c28",
  },
  postureLabel: {
    color: "#9da7b7",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1.2,
  },
  posture: { marginTop: 5, fontSize: 25, fontWeight: 700 },
  postureNote: { marginTop: 9, color: "#b8c0ce", fontSize: 9.5 },
  mandate: {
    marginTop: 18,
    padding: 13,
    borderLeft: `4 solid ${colors.accent}`,
    backgroundColor: "#fff8e7",
  },
  mandateLabel: {
    color: colors.caution,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1,
  },
  mandateText: { marginTop: 5, fontSize: 11, fontWeight: 600 },
  mandateNote: { marginTop: 5, color: colors.soft, fontSize: 8 },
  coverMeta: {
    position: "absolute",
    right: 48,
    bottom: 52,
    left: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 13,
    borderTop: "1 solid #2b3544",
    color: "#8e99aa",
    fontSize: 8.5,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottom: `1 solid ${colors.line}`,
  },
  brand: { fontSize: 10, fontWeight: 700, letterSpacing: 1.2 },
  pageLabel: { color: colors.soft, fontSize: 8.5 },
  title: {
    marginTop: 24,
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.18,
  },
  lead: {
    marginTop: 11,
    color: colors.soft,
    fontSize: 11,
    lineHeight: 1.55,
  },
  grid2: { marginTop: 20, flexDirection: "row", gap: 12 },
  column: { flex: 1 },
  card: {
    marginBottom: 11,
    padding: 13,
    border: `1 solid ${colors.line}`,
    backgroundColor: "#ffffff",
  },
  cardTitle: {
    marginBottom: 7,
    color: colors.soft,
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: 0.7,
  },
  cardValue: { fontSize: 10, fontWeight: 600, lineHeight: 1.45 },
  section: { marginTop: 18 },
  sectionTitle: {
    paddingBottom: 7,
    borderBottom: `1 solid ${colors.line}`,
    fontSize: 13,
    fontWeight: 700,
  },
  paragraph: { marginTop: 8, color: "#373d47", fontSize: 9.5 },
  bullet: {
    marginTop: 7,
    flexDirection: "row",
    gap: 7,
    color: "#373d47",
  },
  bulletMark: { color: colors.blue, fontWeight: 700 },
  scenario: {
    marginTop: 9,
    padding: 11,
    borderLeft: `3 solid ${colors.blue}`,
    backgroundColor: colors.panel,
  },
  scenarioTitle: { fontSize: 10, fontWeight: 700 },
  scenarioMeta: { marginTop: 5, color: colors.soft, fontSize: 8.5 },
  tableHeader: {
    marginTop: 18,
    flexDirection: "row",
    padding: "7 8",
    color: "#ffffff",
    backgroundColor: colors.midnight,
    fontSize: 8,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: "row",
    padding: "7 8",
    borderBottom: `1 solid ${colors.line}`,
    fontSize: 8,
  },
  sourcePublisher: { width: "20%", paddingRight: 6 },
  sourceTitle: { width: "55%", paddingRight: 6 },
  sourceClass: { width: "25%", color: colors.soft },
  footerLeft: {
    position: "absolute",
    bottom: 23,
    left: 46,
    color: "#7a818c",
    fontSize: 7.5,
  },
  footerRight: {
    position: "absolute",
    right: 46,
    bottom: 23,
    width: 54,
    color: "#7a818c",
    fontSize: 7.5,
    textAlign: "right",
  },
  disclaimer: {
    marginTop: 22,
    padding: 14,
    border: `1 solid ${colors.line}`,
    color: colors.soft,
    backgroundColor: colors.panel,
    fontSize: 8.5,
  },
  decisionRail: {
    marginTop: 20,
    flexDirection: "row",
    border: `1 solid ${colors.line}`,
    backgroundColor: "#ffffff",
  },
  decisionMetric: {
    width: "25%",
    padding: 12,
    borderRight: `1 solid ${colors.line}`,
  },
  decisionMetricLabel: {
    color: colors.soft,
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 0.7,
  },
  decisionMetricValue: {
    marginTop: 5,
    fontSize: 15,
    fontWeight: 700,
  },
  processStep: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  processNumber: {
    width: 22,
    height: 22,
    paddingTop: 4,
    borderRadius: 11,
    color: "#ffffff",
    backgroundColor: colors.midnight,
    fontSize: 8,
    fontWeight: 700,
    textAlign: "center",
  },
  processCopy: { flex: 1 },
  processTitle: { fontSize: 10, fontWeight: 700 },
  processBody: { marginTop: 2, color: colors.soft, fontSize: 8.5 },
  teamCard: {
    marginTop: 10,
    padding: 11,
    border: `1 solid ${colors.line}`,
    backgroundColor: "#ffffff",
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamName: { fontSize: 10, fontWeight: 700 },
  teamVote: {
    color: colors.caution,
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  teamPosition: { marginTop: 6, fontSize: 9.5, fontWeight: 600 },
  teamRationale: { marginTop: 4, color: colors.soft, fontSize: 8.5 },
});

type PdfProps = {
  readonly report: ResearchReport;
  readonly symbol: string;
  readonly locale: Locale;
  readonly createdAt: string;
};

function localized<T extends { readonly en: string; readonly ko: string }>(
  value: T,
  locale: Locale,
): string {
  return value[locale];
}

function PageFrame({
  number,
  title,
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageHeader} fixed>
        <Text style={styles.brand}>SERN / STOCKSEMBLY</Text>
        <Text style={styles.pageLabel}>{title}</Text>
      </View>
      {children}
      <Text style={styles.footerLeft} fixed>
        AI equity research · public evidence
      </Text>
      <Text style={styles.footerRight} fixed>
        {String(number).padStart(2, "0")}
      </Text>
    </Page>
  );
}

function Bullet({ children }: { readonly children: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletMark}>•</Text>
      <Text>{children}</Text>
    </View>
  );
}

const voteLabels = {
  support: { en: "SUPPORTS", ko: "지지" },
  support_with_reservations: {
    en: "SUPPORTS WITH RESERVATIONS",
    ko: "조건부 지지",
  },
  oppose: { en: "OPPOSES", ko: "반대" },
  abstain: { en: "ABSTAINS", ko: "유보" },
} as const;

export function ResearchPdfDocument({
  report,
  symbol,
  locale,
  createdAt,
}: PdfProps) {
  const file = researchReportToFile(report, createdAt);
  const ko = locale === "ko";
  const narrative = report.locales[locale];
  const sections = file.analysis;
  const limitations = report.capabilities.filter(
    (capability) => capability.availability !== "available",
  );

  return (
    <Document
      title={`${symbol} Research File v${report.version}.0`}
      author="SERN"
      subject="Evidence-audited equity research"
      language={locale}
    >
      <Page size="A4" style={styles.cover}>
        <Text style={styles.eyebrow}>SERN · RESEARCH FILE</Text>
        <Text style={styles.coverTitle}>{symbol}</Text>
        <Text style={styles.coverSubtitle}>
          {ko
            ? "11명의 전문 에이전트와 독립 의장이 공개 근거를 조사하고, 반론과 감사를 거쳐 종합한 기업 리서치"
            : "Eleven specialist agents and an independent chair investigate public evidence, challenge one another, and publish an audited company view."}
        </Text>
        <View style={styles.postureBox}>
          <Text style={styles.postureLabel}>
            {ko ? "정성 판단" : "QUALITATIVE POSTURE"}
          </Text>
          <Text style={styles.posture}>
            {localized(file.postureLabel, locale)}
          </Text>
          <Text style={styles.postureNote}>
            {localized(file.limitationNote, locale)}
          </Text>
        </View>
        <View style={styles.coverMeta}>
          <Text>Research File v{report.version}.0</Text>
          <Text>{createdAt.slice(0, 10)}</Text>
          <Text>
            {file.sourceCount} {ko ? "개 출처" : "sources"} · {file.claimCount}{" "}
            {ko ? "개 주장" : "claims"}
          </Text>
        </View>
      </Page>

      <PageFrame number={2} title={ko ? "핵심 요약" : "Executive brief"}>
        <Text style={styles.title}>
          {ko ? "10초 안에 읽는 결론" : "The conclusion in ten seconds"}
        </Text>
        <Text style={styles.lead}>{localized(file.thesis, locale)}</Text>
        {file.researchDirection === undefined ? null : (
          <View style={styles.mandate}>
            <Text style={styles.mandateLabel}>
              {ko ? "사용자 조사 방향" : "YOUR RESEARCH MANDATE"}
            </Text>
            <Text style={styles.mandateText}>“{file.researchDirection}”</Text>
            <Text style={styles.mandateNote}>
              {ko
                ? "11명의 전문 에이전트와 4개 팀 토론, 의장 종합에 반영했습니다."
                : "Applied across all 11 specialists, four team debates, and the chair synthesis."}
            </Text>
          </View>
        )}
        <View style={styles.grid2}>
          <View style={styles.column}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {ko ? "핵심 긍정" : "CORE POSITIVES"}
              </Text>
              {file.positives.map((item) => (
                <Bullet key={item.en}>{localized(item, locale)}</Bullet>
              ))}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {file.valuation.en.startsWith("Not assessed")
                  ? ko
                    ? "근거 기반 관찰"
                    : "SUPPORTED OBSERVATION"
                  : ko
                    ? "가격에 반영된 기대"
                    : "OPERATING EXPECTATIONS"}
              </Text>
              <Text style={styles.cardValue}>
                {localized(file.expectation, locale)}
              </Text>
            </View>
          </View>
          <View style={styles.column}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {ko ? "핵심 우려" : "CORE CONCERNS"}
              </Text>
              {file.concerns.map((item) => (
                <Bullet key={item.en}>{localized(item, locale)}</Bullet>
              ))}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {ko ? "판단이 달라질 조건" : "CHANGE CONDITIONS"}
              </Text>
              <Text style={styles.cardValue}>
                {localized(file.changeCondition, locale)}
              </Text>
            </View>
          </View>
        </View>
      </PageFrame>

      <PageFrame
        number={3}
        title={ko ? "기업·재무 분석" : "Business and financial analysis"}
      >
        <Text style={styles.title}>
          {ko ? "근거 기반 분석" : "Evidence-supported analysis"}
        </Text>
        <Text style={styles.lead}>
          {ko
            ? "긴 에이전트 메모를 반복 없이 편집하고, 핵심 주장과 뒷받침 근거를 구분했습니다."
            : "Long agent memos are edited for repetition, separating the takeaway from its supporting evidence."}
        </Text>
        {sections.slice(0, 3).map((section) => (
          <View style={styles.section} key={section.title.en}>
            <Text style={styles.sectionTitle}>
              {localized(section.title, locale)}
            </Text>
            <Text style={styles.paragraph}>
              {localized(section.summary, locale)}
            </Text>
            {localized(section.detail, locale) ? (
              <Text style={styles.paragraph}>
                {localized(section.detail, locale)}
              </Text>
            ) : null}
          </View>
        ))}
      </PageFrame>

      <PageFrame
        number={4}
        title={ko ? "시나리오·이견" : "Scenarios and dissent"}
      >
        <Text style={styles.title}>
          {ko ? "무엇이 달라질 수 있는가" : "What could change the view"}
        </Text>
        <Text style={styles.lead}>
          {localized(file.valuation, locale)} ·{" "}
          {localized(file.nextEvent, locale)}
        </Text>
        {narrative.scenarios.slice(0, 3).map((scenario) => (
          <View style={styles.scenario} key={scenario.id}>
            <Text style={styles.scenarioTitle}>
              {narrative.scenarios.length === 1
                ? ko
                  ? "기준 시나리오"
                  : "Base scenario"
                : scenario.name}
            </Text>
            <Text style={styles.paragraph}>
              {scenario.claimIds.length === 0
                ? ko
                  ? "주장 단위 근거가 연결될 때까지 정량 가정을 표시하지 않습니다."
                  : "Numeric assumptions are withheld until claim-level support is linked."
                : scenario.assumptions
                    .map(
                      (assumption) =>
                        `${assumption.metric}: ${assumption.value} ${assumption.unit}`,
                    )
                    .join(" · ")}
            </Text>
            <Text style={styles.scenarioMeta}>
              {scenario.claimIds.length} {ko ? "개 주장" : "claims"} ·{" "}
              {scenario.sourceIds.length} {ko ? "개 근거" : "sources"}
            </Text>
          </View>
        ))}
        <View style={styles.grid2}>
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>
              {ko ? "보존된 이견" : "Preserved dissent"}
            </Text>
            {narrative.dissent.slice(0, 3).map((item) => (
              <Bullet key={item.id}>
                {compactNarrative(item.text, {
                  sentences: 1,
                  characters: 170,
                })}
              </Bullet>
            ))}
          </View>
          <View style={styles.column}>
            <Text style={styles.sectionTitle}>
              {ko ? "미확인 사항" : "Open unknowns"}
            </Text>
            {narrative.unknowns.slice(0, 3).map((item) => (
              <Bullet key={item.id}>
                {compactNarrative(item.impact, {
                  sentences: 1,
                  characters: 170,
                })}
              </Bullet>
            ))}
          </View>
        </View>
      </PageFrame>

      <PageFrame
        number={5}
        title={ko ? "팀 판단·토론" : "Team judgment and debate"}
      >
        <Text style={styles.title}>
          {ko
            ? "11명의 전문가와 의장은 같은 결론을 복창하지 않습니다"
            : "Eleven specialists and the chair do not echo one conclusion"}
        </Text>
        <Text style={styles.lead}>
          {ko
            ? "독립 조사 결과를 부서 안에서 합친 뒤 다른 팀이 반론하고, 의장은 통과한 근거와 보존된 이견만 최종 판단에 사용합니다."
            : "Independent memos are consolidated inside each department, challenged by another team, and filtered by the chair to retain only audited evidence and preserved dissent."}
        </Text>
        <View style={styles.decisionRail}>
          <View style={styles.decisionMetric}>
            <Text style={styles.decisionMetricLabel}>
              {ko ? "근거 판단" : "VIEW"}
            </Text>
            <Text style={styles.decisionMetricValue}>
              {localized(file.postureLabel, locale)}
            </Text>
          </View>
          <View style={styles.decisionMetric}>
            <Text style={styles.decisionMetricLabel}>
              {ko ? "감사" : "AUDIT"}
            </Text>
            <Text style={styles.decisionMetricValue}>
              {file.evidenceScore.passed}/{file.evidenceScore.denominator}
            </Text>
          </View>
          <View style={styles.decisionMetric}>
            <Text style={styles.decisionMetricLabel}>
              {ko ? "주장" : "CLAIMS"}
            </Text>
            <Text style={styles.decisionMetricValue}>{file.claimCount}</Text>
          </View>
          <View style={{ ...styles.decisionMetric, borderRight: 0 }}>
            <Text style={styles.decisionMetricLabel}>
              {ko ? "출처" : "SOURCES"}
            </Text>
            <Text style={styles.decisionMetricValue}>{file.sourceCount}</Text>
          </View>
        </View>
        {file.teamViews.map((team) => (
          <View style={styles.teamCard} key={team.departmentId}>
            <View style={styles.teamHeader}>
              <Text style={styles.teamName}>
                {localized(team.teamName, locale)}
              </Text>
              <Text style={styles.teamVote}>
                {localized(voteLabels[team.vote], locale)}
              </Text>
            </View>
            <Text style={styles.teamPosition}>
              {compactNarrative(localized(team.position, locale), {
                sentences: 1,
                characters: 180,
              })}
            </Text>
            <Text style={styles.teamRationale}>
              {compactNarrative(localized(team.rationale, locale), {
                sentences: 1,
                characters: 180,
              })}
            </Text>
          </View>
        ))}
      </PageFrame>

      <PageFrame number={6} title={ko ? "근거 등록부" : "Evidence register"}>
        <Text style={styles.title}>
          {ko ? "감사된 공개 출처" : "Audited public sources"}
        </Text>
        <Text style={styles.lead}>
          {ko
            ? `${file.sourceCount}개 출처가 ${file.claimCount}개 공개 주장에 연결되었습니다.`
            : `${file.sourceCount} sources are linked to ${file.claimCount} public claims.`}
        </Text>
        <View style={styles.tableHeader}>
          <Text style={styles.sourcePublisher}>
            {ko ? "발행처" : "Publisher"}
          </Text>
          <Text style={styles.sourceTitle}>{ko ? "자료" : "Evidence"}</Text>
          <Text style={styles.sourceClass}>{ko ? "분류" : "Class"}</Text>
        </View>
        {report.sources.slice(0, 14).map((source) => {
          const label = readerSourceLabel(source);
          return (
            <View style={styles.tableRow} key={source.sourceId}>
              <Text style={styles.sourcePublisher}>{label.publisher}</Text>
              <Text style={styles.sourceTitle}>
                {compactNarrative(label.title, {
                  sentences: 1,
                  characters: 92,
                })}
              </Text>
              <Text style={styles.sourceClass}>
                {source.sourceClass.replaceAll("_", " ")}
              </Text>
            </View>
          );
        })}
        {report.sources.length > 14 ? (
          <Text style={styles.disclaimer}>
            + {report.sources.length - 14}{" "}
            {ko
              ? "개 출처는 웹 Research File의 전체 근거 목록에서 확인할 수 있습니다."
              : "additional sources are available in the full web Research File."}
          </Text>
        ) : null}
      </PageFrame>

      <PageFrame
        number={7}
        title={ko ? "방법론·한계" : "Methodology and limitations"}
      >
        <Text style={styles.title}>
          {ko ? "이 보고서를 읽는 법" : "How to read this report"}
        </Text>
        <Text style={styles.lead}>
          {ko
            ? "각 전문 에이전트는 독립 조사 후 부서 합의, 상호 반론, 구조·의미 감사를 거쳤습니다. 최종 파일은 공개 가능한 근거와 이견만 보존합니다."
            : "Specialists research independently, consolidate by department, challenge one another, and pass structural and semantic audits. Only public evidence and preserved dissent enter this file."}
        </Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {ko ? "감사 결과" : "Audit result"}
          </Text>
          {report.metrics.map((metric) => (
            <Bullet key={metric.id}>
              {`${metric.id}: ${metric.passed}/${metric.denominator}`}
            </Bullet>
          ))}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {ko ? "데이터 기능과 한계" : "Data capabilities and limitations"}
          </Text>
          {report.capabilities.map((capability) => (
            <Bullet key={capability.key}>
              {`${capability.key.replaceAll("_", " ")} — ${capability.availability.replaceAll("_", " ")}`}
            </Bullet>
          ))}
        </View>
        <View style={styles.disclaimer}>
          <Text>
            {ko
              ? `한계 ${limitations.length}건. 현재가·가격 기반 밸류에이션 또는 컨센서스 기능이 제공되지 않을 때 정성 판단은 매매 지시, 목표가 또는 수익 보장이 아닙니다. 투자 판단과 손실 책임은 이용자에게 있습니다. 문의: kicoa24@gmail.com`
              : `${limitations.length} disclosed limitations. Where current price, price-derived valuation, or consensus is unavailable, the qualitative posture is not a trade instruction, price target, or return guarantee. Investment decisions and losses remain the user's responsibility. Contact: kicoa24@gmail.com`}
          </Text>
        </View>
      </PageFrame>
    </Document>
  );
}

export async function renderResearchReportPdf(
  props: PdfProps,
): Promise<Buffer> {
  return await renderEditorialResearchReportPdf(props);
}
