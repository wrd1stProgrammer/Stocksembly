import { z } from "zod";
import {
  ComparatorQualificationInputSchema,
  qualifyComparators,
} from "./comparatorQualification";
import type { ComparatorQualificationResult } from "./comparatorQualificationContracts";

const MetricFieldsSchema = z.object({
  marketCap: z.number().finite().nonnegative().optional(),
  priceEarningsTtm: z.number().finite().optional(),
  enterpriseValueEbitdaTtm: z.number().finite().optional(),
  enterpriseValueRevenueTtm: z.number().finite().optional(),
  revenueGrowthTtm: z.number().finite().optional(),
  grossMarginTtm: z.number().finite().optional(),
  operatingMarginTtm: z.number().finite().optional(),
  performance3Month: z.number().finite().optional(),
  performance1Year: z.number().finite().optional(),
});
const SubjectSchema = MetricFieldsSchema.extend({
  symbol: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sector: z.string().trim().min(1),
  primaryProductMarket: z.string().trim().min(1).optional(),
  primaryCustomerMarket: z.string().trim().min(1).optional(),
}).passthrough();
const CanonicalIdentitySchema = z
  .object({
    cik: z.string().trim().min(1),
    ticker: z.string().trim().min(1),
    legalName: z.string().trim().min(1),
    exchange: z.enum(["NASDAQ", "NYSE", "NYSE_AMERICAN"]),
    title: z.string().trim().min(1),
    securityClass: z.string().trim().min(1),
    sector: z.string().trim().min(1),
    industry: z.string().trim().min(1).optional(),
    primaryProductMarket: z.string().trim().min(1).optional(),
    primaryCustomerMarket: z.string().trim().min(1).optional(),
  })
  .strict();
const QualificationSchema = z
  .object({
    status: z.enum(["eligible", "not_eligible"]),
    sourcePurpose: z.string().trim().min(1),
    reason: z.string().trim().min(1).optional(),
  })
  .passthrough();
const PeerSchema = SubjectSchema.extend({
  classification: z.enum([
    "direct_competitor",
    "operating_comparable",
    "valuation_proxy",
  ]),
  selectionReasons: z.array(z.string().trim().min(1)).min(1),
  marketOverlapVerified: z.boolean().optional(),
  canonicalIdentity: CanonicalIdentitySchema.optional(),
  securityQualification: QualificationSchema.optional(),
  businessQualification: QualificationSchema.optional(),
  valuationQualification: QualificationSchema.optional(),
}).passthrough();
const PeerEvidenceSchema = z
  .object({
    providerUpdatedAt: z.string().datetime(),
    sector: z.string().trim().min(1),
    subject: SubjectSchema,
    peers: z.array(PeerSchema).max(64),
  })
  .passthrough();

const METRIC_FIELDS = [
  ["marketCap", "market_cap", "currency", "point_in_time"],
  ["priceEarningsTtm", "price_earnings_ttm", "multiple", "TTM"],
  [
    "enterpriseValueEbitdaTtm",
    "enterprise_value_ebitda_ttm",
    "multiple",
    "TTM",
  ],
  [
    "enterpriseValueRevenueTtm",
    "enterprise_value_to_revenue_ttm",
    "multiple",
    "TTM",
  ],
  ["revenueGrowthTtm", "revenue_growth_ttm", "percent", "TTM"],
  ["grossMarginTtm", "gross_margin_ttm", "percent", "TTM"],
  ["operatingMarginTtm", "operating_margin_ttm", "percent", "TTM"],
  ["performance3Month", "performance_3_month", "percent", "trailing_3_months"],
  ["performance1Year", "performance_1_year", "percent", "trailing_1_year"],
] as const;

const KOREAN_SELECTION_REASONS: Readonly<Record<string, string>> = {
  "issuer filing names the company near competition language":
    "회사의 공식 공시에서 경쟁 관계로 확인됨",
  "issuer filing references the company": "회사의 공식 공시에서 언급됨",
  "same provider sector": "동일한 업종 분류",
  "similar growth and margin profile": "성장률과 마진 구조가 유사함",
  "comparable market-cap scale": "시가총액 규모가 유사함",
  "available relative-value metrics": "상대가치 비교 지표를 확보함",
};

function koreanRationale(reasons: readonly string[]): string {
  return reasons
    .map((reason) => KOREAN_SELECTION_REASONS[reason] ?? reason)
    .join("; ");
}

function metrics(
  profile: z.infer<typeof SubjectSchema>,
  evidenceArtifactId: string,
  sourcePurpose?: "valuation_metric" | "operating_metric",
) {
  return METRIC_FIELDS.flatMap(([field, key, unit, period]) => {
    const value = profile[field];
    return value === undefined
      ? []
      : [
          {
            key,
            value,
            period,
            unit,
            ...(unit === "currency" ? { currency: "USD" } : {}),
            ...(sourcePurpose === undefined
              ? {}
              : {
                  sourcePurpose:
                    key === "price_earnings_ttm" ||
                    key === "enterprise_value_ebitda_ttm" ||
                    key === "enterprise_value_to_revenue_ttm"
                      ? "valuation_metric"
                      : "operating_metric",
                }),
            evidenceArtifactIds: [evidenceArtifactId],
          },
        ];
  });
}

export function qualifyInsightSentryPeers(input: {
  readonly rawPeerArtifactId: string;
  readonly peers: unknown;
}): ComparatorQualificationResult | undefined {
  const parsed = PeerEvidenceSchema.safeParse(input.peers);
  if (!parsed.success) return undefined;
  const overlapKey = `issuer-verified-competition:${parsed.data.subject.symbol}`;
  const hasVerifiedOverlap = parsed.data.peers.some(
    (peer) => peer.marketOverlapVerified === true,
  );
  const qualificationInput = ComparatorQualificationInputSchema.safeParse({
    rawPeerArtifactId: input.rawPeerArtifactId,
    subject: {
      comparatorId: parsed.data.subject.symbol,
      name: parsed.data.subject.name,
      sector: parsed.data.subject.sector,
      primaryProductMarket:
        parsed.data.subject.primaryProductMarket ??
        (hasVerifiedOverlap
          ? overlapKey
          : `unverified-product:${parsed.data.subject.symbol}`),
      primaryCustomerMarket:
        parsed.data.subject.primaryCustomerMarket ??
        (hasVerifiedOverlap
          ? overlapKey
          : `unverified-customer:${parsed.data.subject.symbol}`),
      metrics: metrics(parsed.data.subject, input.rawPeerArtifactId),
    },
    comparators: parsed.data.peers.map((peer) => {
      const userSelected = peer.selectionReasons.some(
        (reason) =>
          reason.toLocaleLowerCase("und") === "user-selected comparator",
      );
      const canonicalIdentity = peer.canonicalIdentity;
      const sealedQualification =
        canonicalIdentity !== undefined &&
        peer.securityQualification !== undefined &&
        peer.businessQualification !== undefined &&
        peer.valuationQualification !== undefined;
      const businessEligible =
        sealedQualification &&
        peer.businessQualification?.status === "eligible" &&
        peer.businessQualification.sourcePurpose === "business_overlap";
      return {
        comparatorId: canonicalIdentity?.cik ?? peer.symbol,
        name: peer.name,
        sector: peer.sector,
        // A user choice establishes comparison intent, not verified product-market
        // overlap. Keep it visible as a valuation proxy until overlap evidence exists.
        role: userSelected ? ("valuation_proxy" as const) : peer.classification,
        rationale: userSelected
          ? {
              en: "User-selected valuation comparison using aligned TTM metrics.",
              ko: "사용자가 지정한 비교기업이며 정렬된 TTM 지표로 밸류에이션을 비교합니다.",
            }
          : {
              en: peer.selectionReasons.join("; "),
              ko: koreanRationale(peer.selectionReasons),
            },
        primaryProductMarket:
          canonicalIdentity?.primaryProductMarket ??
          peer.primaryProductMarket ??
          (peer.marketOverlapVerified === true
            ? overlapKey
            : `unverified-product:${peer.symbol}`),
        primaryCustomerMarket:
          canonicalIdentity?.primaryCustomerMarket ??
          peer.primaryCustomerMarket ??
          (peer.marketOverlapVerified === true
            ? overlapKey
            : `unverified-customer:${peer.symbol}`),
        metrics: metrics(
          peer,
          input.rawPeerArtifactId,
          sealedQualification &&
            peer.valuationQualification?.sourcePurpose === "valuation_metric"
            ? "valuation_metric"
            : undefined,
        ),
        ...(canonicalIdentity === undefined || !sealedQualification
          ? {}
          : {
              canonicalIdentity: {
                cik: canonicalIdentity.cik,
                ticker: canonicalIdentity.ticker,
                exchange: canonicalIdentity.exchange,
                securityClass:
                  canonicalIdentity.securityClass === "common_stock"
                    ? ("common_stock" as const)
                    : canonicalIdentity.securityClass === "fund" ||
                        canonicalIdentity.securityClass === "adr" ||
                        canonicalIdentity.securityClass === "preferred" ||
                        canonicalIdentity.securityClass === "unit" ||
                        canonicalIdentity.securityClass === "warrant" ||
                        canonicalIdentity.securityClass === "debt"
                      ? canonicalIdentity.securityClass
                      : ("unknown" as const),
                sector: canonicalIdentity.sector,
                ...(canonicalIdentity.industry === undefined
                  ? {}
                  : { industry: canonicalIdentity.industry }),
                primaryProductMarket:
                  canonicalIdentity.primaryProductMarket ??
                  `unverified-product:${peer.symbol}`,
                primaryCustomerMarket:
                  canonicalIdentity.primaryCustomerMarket ??
                  `unverified-customer:${peer.symbol}`,
                sourcePurposes: [
                  ...(peer.securityQualification?.sourcePurpose ===
                  "issuer_identity"
                    ? (["issuer_identity"] as const)
                    : []),
                  ...(businessEligible ? (["business_overlap"] as const) : []),
                ],
              },
              securityQualification:
                peer.securityQualification?.status === "eligible" &&
                peer.securityQualification.sourcePurpose === "issuer_identity"
                  ? ("eligible" as const)
                  : ("not_eligible" as const),
            }),
      };
    }),
  });
  return qualificationInput.success
    ? qualifyComparators(qualificationInput.data)
    : undefined;
}
