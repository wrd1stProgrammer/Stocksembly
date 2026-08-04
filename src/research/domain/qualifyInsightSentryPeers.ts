import { z } from "zod";
import {
  ComparatorQualificationInputSchema,
  qualifyComparators,
} from "./comparatorQualification";
import type { ComparatorQualificationResult } from "./comparatorQualificationContracts";

const MetricFieldsSchema = z.object({
  priceEarningsTtm: z.number().finite().optional(),
  enterpriseValueEbitdaTtm: z.number().finite().optional(),
  enterpriseValueRevenueTtm: z.number().finite().optional(),
  revenueGrowthTtm: z.number().finite().optional(),
  grossMarginTtm: z.number().finite().optional(),
  operatingMarginTtm: z.number().finite().optional(),
});
const SubjectSchema = MetricFieldsSchema.extend({
  symbol: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sector: z.string().trim().min(1),
  primaryProductMarket: z.string().trim().min(1).optional(),
  primaryCustomerMarket: z.string().trim().min(1).optional(),
}).passthrough();
const PeerSchema = SubjectSchema.extend({
  classification: z.enum([
    "direct_competitor",
    "operating_comparable",
    "valuation_proxy",
  ]),
  selectionReasons: z.array(z.string().trim().min(1)).min(1),
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
  ["priceEarningsTtm", "price_earnings_ttm", "multiple"],
  ["enterpriseValueEbitdaTtm", "enterprise_value_ebitda_ttm", "multiple"],
  [
    "enterpriseValueRevenueTtm",
    "enterprise_value_to_revenue_ttm",
    "multiple",
  ],
  ["revenueGrowthTtm", "revenue_growth_ttm", "percent"],
  ["grossMarginTtm", "gross_margin_ttm", "percent"],
  ["operatingMarginTtm", "operating_margin_ttm", "percent"],
] as const;

function metrics(
  profile: z.infer<typeof SubjectSchema>,
  evidenceArtifactId: string,
) {
  return METRIC_FIELDS.flatMap(([field, key, unit]) => {
    const value = profile[field];
    return value === undefined
      ? []
      : [
          {
            key,
            value,
            period: "TTM",
            unit,
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
  const qualificationInput = ComparatorQualificationInputSchema.safeParse({
    rawPeerArtifactId: input.rawPeerArtifactId,
    subject: {
      comparatorId: parsed.data.subject.symbol,
      name: parsed.data.subject.name,
      primaryProductMarket:
        parsed.data.subject.primaryProductMarket ??
        `unverified-product:${parsed.data.subject.symbol}`,
      primaryCustomerMarket:
        parsed.data.subject.primaryCustomerMarket ??
        `unverified-customer:${parsed.data.subject.symbol}`,
      metrics: metrics(parsed.data.subject, input.rawPeerArtifactId),
    },
    comparators: parsed.data.peers.map((peer) => {
      const userSelected = peer.selectionReasons.some(
        (reason) => reason.toLocaleLowerCase("und") === "user-selected comparator",
      );
      return {
        comparatorId: peer.symbol,
        name: peer.name,
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
              ko: peer.selectionReasons.join("; "),
            },
        primaryProductMarket:
          peer.primaryProductMarket ?? `unverified-product:${peer.symbol}`,
        primaryCustomerMarket:
          peer.primaryCustomerMarket ?? `unverified-customer:${peer.symbol}`,
        metrics: metrics(peer, input.rawPeerArtifactId),
      };
    }),
  });
  return qualificationInput.success
    ? qualifyComparators(qualificationInput.data)
    : undefined;
}
