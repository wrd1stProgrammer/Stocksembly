import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import {
  type WorkflowDepartmentId,
  workflowRoleById,
} from "../../../research/domain/roleRegistry";
import { publicStanceLabel } from "../../../research/publicStanceLabels";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import styles from "./department-research-desk.module.css";

type DeskClaim = {
  readonly id: string;
  readonly roleOwner: string;
  readonly dimension: string;
  readonly thesis: string;
  readonly falsifier: string;
  readonly contribution: "supports" | "opposes" | "uncertain";
  readonly decisiveMetricIds: readonly string[];
};

const ROLE_COPY: Readonly<
  Record<
    string,
    { readonly name: string; readonly en: string; readonly ko: string }
  >
> = {
  market: { name: "Maya", en: "Market lead", ko: "시장 책임" },
  market_news: { name: "June", en: "Technical analyst", ko: "기술적 분석" },
  benchmark: {
    name: "Alex",
    en: "Cross-asset analyst",
    ko: "상대가치·크로스에셋",
  },
  company: { name: "Ethan", en: "Company lead", ko: "기업 책임" },
  company_product: {
    name: "Aria",
    en: "Product analyst",
    ko: "제품·채택 분석",
  },
  company_competition: {
    name: "Leo",
    en: "Competitive intelligence",
    ko: "경쟁정보 분석",
  },
  financial: { name: "Noah", en: "Financial lead", ko: "재무 책임" },
  valuation: { name: "Sofia", en: "Valuation analyst", ko: "가치평가 분석" },
  financial_quality: {
    name: "Hana",
    en: "Earnings-quality analyst",
    ko: "이익의 질 분석",
  },
  risk: { name: "Liam", en: "Risk lead", ko: "리스크 책임" },
  risk_policy: {
    name: "Min",
    en: "Policy & scenario analyst",
    ko: "정책·시나리오 분석",
  },
};

const DIMENSION_COPY: Readonly<
  Record<string, { readonly en: string; readonly ko: string }>
> = {
  regime: { en: "Market regime", ko: "시장 국면" },
  timing: { en: "Entry timing", ko: "진입 타이밍" },
  relative_performance: { en: "Relative performance", ko: "상대 성과" },
  catalyst: { en: "Catalyst", ko: "촉매" },
  growth_engine: { en: "Growth engine", ko: "성장 엔진" },
  adoption: { en: "Adoption", ko: "제품 채택" },
  moat: { en: "Moat", ko: "경쟁우위" },
  competitive_erosion: { en: "Moat erosion", ko: "경쟁우위 훼손" },
  margin: { en: "Margin", ko: "마진" },
  cash_conversion: { en: "Cash conversion", ko: "현금 전환" },
  reinvestment: { en: "Reinvestment", ko: "재투자" },
  embedded_expectations: { en: "Priced-in expectations", ko: "주가 내재 기대" },
  downside_path: { en: "Downside path", ko: "하방 경로" },
  leading_indicator: { en: "Early warning", ko: "조기 경보" },
  mitigant: { en: "Risk buffer", ko: "완충 요인" },
};

const DEPARTMENT_ROLES: Readonly<
  Record<WorkflowDepartmentId, readonly string[]>
> = {
  market: ["market", "market_news", "benchmark"],
  company: ["company", "company_product", "company_competition"],
  financial: ["financial", "valuation", "financial_quality"],
  risk: ["risk", "risk_policy"],
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function departmentClaims(
  model: ResearchFileEditorialModel,
  departmentId: WorkflowDepartmentId,
  locale: Locale,
): readonly DeskClaim[] {
  const structured = (model.structuredClaims ?? []).flatMap((claim) =>
    workflowRoleById(claim.roleOwner)?.departmentId !== departmentId
      ? []
      : [
          {
            id: claim.claimId,
            roleOwner: claim.roleOwner,
            dimension: claim.decisionDimension,
            thesis: claim.publicThesis[locale],
            falsifier: claim.falsifier[locale],
            contribution: claim.stanceContribution,
            decisiveMetricIds: claim.decisiveMetricIds,
          } satisfies DeskClaim,
        ],
  );
  const claims =
    structured.length > 0
      ? structured
      : model.analysisRows.map((row, index) => ({
          id: row.id,
          roleOwner:
            DEPARTMENT_ROLES[departmentId][
              index % DEPARTMENT_ROLES[departmentId].length
            ] ?? departmentId,
          dimension: row.title,
          thesis: row.agentView || row.evidence,
          falsifier: row.checkpoint,
          contribution:
            row.strength === "contested" || row.strength === "unverified"
              ? ("uncertain" as const)
              : ("supports" as const),
          decisiveMetricIds: [] as readonly string[],
        }));
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const fingerprint = normalize(claim.thesis);
    if (fingerprint.length === 0 || seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function stanceLabel(
  stance:
    | "upside_skewed"
    | "wait_for_proof"
    | "downside_skewed"
    | "balanced"
    | "insufficient_evidence"
    | undefined,
  locale: Locale,
): string {
  return stance === undefined
    ? locale === "ko"
      ? "조건부 판단"
      : "Conditional view"
    : publicStanceLabel(stance, locale);
}

function contributionLabel(
  contribution: DeskClaim["contribution"],
  locale: Locale,
): string {
  const labels = {
    supports: { en: "Supports", ko: "지지" },
    opposes: { en: "Challenges", ko: "반대" },
    uncertain: { en: "Unresolved", ko: "쟁점" },
  } as const;
  return labels[contribution][locale];
}

export function DepartmentResearchDesk({
  file,
  model,
  locale,
  departmentId,
}: {
  readonly file: ResearchFileData;
  readonly model: ResearchFileEditorialModel;
  readonly locale: Locale;
  readonly departmentId: WorkflowDepartmentId;
}) {
  const ko = locale === "ko";
  const claims = departmentClaims(model, departmentId, locale);
  const grouped = DEPARTMENT_ROLES[departmentId].flatMap((roleId) => {
    const roleClaims = claims.filter((claim) => claim.roleOwner === roleId);
    return roleClaims.length === 0 ? [] : [{ roleId, claims: roleClaims }];
  });
  const team = file.teamViews.find(
    (view) => view.departmentId === departmentId,
  );
  const decision = model.structuredDecision;
  const directAnswerFingerprint = normalize(model.directAnswer);
  const firstDistinct = (...values: readonly (string | undefined)[]): string =>
    values.find(
      (value) =>
        value !== undefined &&
        value.trim().length > 0 &&
        normalize(value) !== directAnswerFingerprint,
    ) ?? "";
  const decisionRows = [
    {
      id: "case",
      label: ko ? "현재 판단의 근거" : "Why this view holds",
      value: firstDistinct(
        decision?.decisiveReason[locale],
        team?.rationale[locale],
        team?.position[locale],
        file.expectation[locale],
      ),
    },
    {
      id: "countercase",
      label: ko ? "가장 강한 반대 논거" : "Strongest countercase",
      value:
        decision?.strongestCountercase[locale] ??
        team?.rationale[locale] ??
        file.concerns[0]?.[locale] ??
        file.changeCondition[locale],
    },
    {
      id: "change",
      label: ko ? "판단 변경 조건" : "What changes the call",
      value: decision?.falsifier[locale] ?? file.changeCondition[locale],
    },
    {
      id: "next",
      label: ko ? "다음 확인 지점" : "Next checkpoint",
      value: file.nextEvent[locale],
    },
  ].filter((row) => row.value.trim().length > 0);

  if (grouped.length === 0 && decisionRows.length === 0) return null;
  return (
    <>
      {grouped.length === 0 ? null : (
        <section
          className={`research-editorial-section ${styles["roundtable"]}`}
          id="team-roundtable"
          data-report-section="team-roundtable"
        >
          <header className={styles["sectionHeader"]}>
            <h2>{ko ? "전문가 판단" : "Specialist findings"}</h2>
            <p>
              {ko
                ? "담당 영역별 핵심 관찰과 판단을 뒤집을 조건입니다."
                : "The core observation and reversal condition for each specialist's mandate."}
            </p>
          </header>
          <div
            className={styles["agentGrid"]}
            data-agent-count={grouped.length}
          >
            {grouped.map(({ roleId, claims: roleClaims }) => {
              const role = ROLE_COPY[roleId] ?? {
                name: workflowRoleById(roleId)?.name ?? roleId,
                en: roleId,
                ko: roleId,
              };
              const primary = roleClaims[0]!;
              return (
                <article
                  key={roleId}
                  className={styles["agentMemo"]}
                  data-claim-count={Math.min(roleClaims.length, 3)}
                >
                  <header>
                    <img
                      src={`/research/office-v7/portraits/${roleId}.png`}
                      alt=""
                      width={42}
                      height={42}
                    />
                    <div>
                      <strong>{role.name}</strong>
                      <span>{role[locale]}</span>
                    </div>
                    <em data-contribution={primary.contribution}>
                      {contributionLabel(primary.contribution, locale)}
                    </em>
                  </header>
                  <ol>
                    {roleClaims.slice(0, 3).map((claim, index) => (
                      <li key={claim.id}>
                        <div>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <small>
                            {DIMENSION_COPY[claim.dimension]?.[locale] ??
                              claim.dimension.replaceAll("_", " ")}
                          </small>
                        </div>
                        <strong>{claim.thesis}</strong>
                        {claim.falsifier.trim() ===
                        claim.thesis.trim() ? null : (
                          <p>
                            <b>{ko ? "반전 조건" : "Reversal"}</b>
                            {claim.falsifier}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                </article>
              );
            })}
          </div>
          {team === undefined ? null : (
            <aside className={styles["arbitration"]}>
              <span>{ko ? "팀 책임자 판단" : "Team lead view"}</span>
              <strong>{team.position[locale]}</strong>
              <p>{team.rationale[locale]}</p>
            </aside>
          )}
        </section>
      )}

      <section
        className={`research-editorial-section ${styles["decisionBoard"]}`}
        id="team-decision-board"
        data-report-section="team-decision-board"
      >
        <header className={styles["decisionHeader"]}>
          <div>
            <span>{ko ? "투자 판단 보드" : "INVESTMENT DECISION BOARD"}</span>
            <h2>{stanceLabel(decision?.stance, locale)}</h2>
          </div>
        </header>
        <div className={styles["decisionGrid"]}>
          {decisionRows.map((row, index) => (
            <article key={row.id} data-row={row.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{row.label}</h3>
                <p>{row.value}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
