import type { SpecialistRoleId } from "../domain/roleRegistry";

export type ChallengeFault =
  | "none"
  | "support_only"
  | "persona_rhetoric_source"
  | "role_title_en_source"
  | "role_title_ko_source"
  | "severe_slur_source"
  | "evaluative_attack_source"
  | "ambiguous_june_neutral_source"
  | "ambiguous_min_neutral_source"
  | "claim_wrong_en_source"
  | "claim_wrong_ko_source"
  | "ambiguous_june_attribution_source"
  | "ambiguous_min_attribution_source"
  | "ambiguous_ko_attribution_source"
  | "claim_harsh_attack_source"
  | "generic_finance_source"
  | "generic_benchmark_source"
  | "max_public_summary"
  | "unknown_claim"
  | "new_evidence"
  | "qualitative_new_fact"
  | "new_url"
  | "omitted_parent"
  | "impersonated_role"
  | "arbitrary_browsing"
  | "recursive_task";

const SOURCE_FAULTS = new Set<ChallengeFault>([
  "persona_rhetoric_source",
  "role_title_en_source",
  "role_title_ko_source",
  "severe_slur_source",
  "evaluative_attack_source",
  "ambiguous_june_neutral_source",
  "ambiguous_min_neutral_source",
  "claim_wrong_en_source",
  "claim_wrong_ko_source",
  "ambiguous_june_attribution_source",
  "ambiguous_min_attribution_source",
  "ambiguous_ko_attribution_source",
  "claim_harsh_attack_source",
  "generic_finance_source",
  "generic_benchmark_source",
  "max_public_summary",
]);

const UNSAFE_SOURCE_FAULTS = new Set<ChallengeFault>([
  "persona_rhetoric_source",
  "role_title_en_source",
  "role_title_ko_source",
  "severe_slur_source",
  "evaluative_attack_source",
  "ambiguous_june_attribution_source",
  "ambiguous_min_attribution_source",
  "ambiguous_ko_attribution_source",
  "claim_harsh_attack_source",
]);

export function sourceFaultUsesValidDecision(fault: ChallengeFault): boolean {
  return SOURCE_FAULTS.has(fault);
}

export function sourcePositionStance(
  fault: ChallengeFault,
  original: string,
): "supports" | "opposes" | "uncertain" {
  if (UNSAFE_SOURCE_FAULTS.has(fault)) return "uncertain";
  if (
    original === "supports" ||
    original === "opposes" ||
    original === "uncertain"
  )
    return original;
  throw new TypeError("challenge source fixture has an invalid stance");
}

export function challengeSourceSummary(
  fault: ChallengeFault,
  roleId: SpecialistRoleId,
) {
  if (fault === "max_public_summary")
    return new Set(["market", "company", "financial", "risk"]).has(roleId)
      ? { en: "T".repeat(4_000), ko: "대".repeat(4_000) }
      : { en: "C".repeat(4_000), ko: "반".repeat(4_000) };
  const selectedCounter =
    roleId === "valuation" || roleId === "financial_quality";
  if (!selectedCounter)
    return {
      en: "Source-backed operating evidence",
      ko: "출처 기반 운영 근거",
    };
  if (fault === "persona_rhetoric_source")
    return {
      en: "Sofia says the analyst is incompetent and the valuation premise is weak",
      ko: "소피아는 분석가가 무능하다고 말하며 가치평가 전제가 약하다고 주장한다",
    };
  if (fault === "role_title_en_source")
    return {
      en: "According to the Financial Lead, leverage remains elevated",
      ko: "레버리지가 높게 유지된다",
    };
  if (fault === "role_title_ko_source")
    return {
      en: "Leverage remains elevated",
      ko: "재무 책임에 따르면 레버리지가 높게 유지된다",
    };
  if (fault === "severe_slur_source")
    return {
      en: "The evidence-backed analyst is a moron",
      ko: "근거는 문서에 기록되어 있다",
    };
  if (fault === "evaluative_attack_source")
    return {
      en: "That take is absurd despite the cited evidence",
      ko: "인용된 근거는 유지된다",
    };
  if (fault === "ambiguous_june_neutral_source")
    return { en: "June revenue increased", ko: "6월 매출이 증가했다" };
  if (fault === "ambiguous_min_neutral_source")
    return { en: "The interval was 5 min", ko: "간격은 5분이었다" };
  if (fault === "claim_wrong_en_source")
    return {
      en: "The claim is wrong because revenue declined",
      ko: "매출 감소가 근거와 일치한다",
    };
  if (fault === "claim_wrong_ko_source")
    return {
      en: "Revenue declined",
      ko: "그 주장은 매출 감소 때문에 틀렸다",
    };
  if (fault === "ambiguous_june_attribution_source")
    return {
      en: "According to June, revenue increased",
      ko: "매출이 증가했다",
    };
  if (fault === "ambiguous_min_attribution_source")
    return { en: "Min said leverage is stable", ko: "레버리지는 안정적이다" };
  if (fault === "ambiguous_ko_attribution_source")
    return { en: "Revenue increased", ko: "준에 따르면 매출이 증가했다" };
  if (fault === "claim_harsh_attack_source")
    return {
      en: "The claim is absurd despite the cited evidence",
      ko: "인용된 근거는 유지된다",
    };
  if (fault === "generic_finance_source")
    return {
      en: "Market lead indicators rose, earnings quality improved, and company reported stable results",
      ko: "시장 선행 지표와 이익의 질이 개선됐고 회사가 안정적인 실적을 보고했다",
    };
  if (fault === "generic_benchmark_source")
    return {
      en: "The supplied benchmark evidence covers Strategy rather than a semiconductor index",
      ko: "제공된 벤치마크 증거는 반도체 지수가 아닌 Strategy를 다룬다",
    };
  return { en: "Source-backed operating evidence", ko: "출처 기반 운영 근거" };
}
