import { z } from "zod";
import { isStrictIsoDate, isStrictRfc3339 } from "./contractHelpers";

export const TimestampSchema = z
  .string()
  .refine(isStrictRfc3339, "invalid RFC3339 timestamp");
export const UuidSchema = z.string().uuid();
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const SourceUrlSchema = z.string().url();

const SEC_SOURCE_VALUES = [
  "sec_ticker_exchange",
  "sec_submissions",
  "sec_company_facts",
  "sec_primary_filing",
  "sec_exhibit",
] as const;
const MACRO_SOURCE_VALUES = ["bls_allowlist", "treasury_yield"] as const;
const MARKET_SOURCE_VALUES = [
  "alpaca_market_data",
  "insightsentry_rapidapi",
] as const;
const WEB_SOURCE_VALUES = ["captured_web"] as const;
export const EVIDENCE_SOURCES = [
  ...SEC_SOURCE_VALUES,
  ...MACRO_SOURCE_VALUES,
  ...MARKET_SOURCE_VALUES,
  ...WEB_SOURCE_VALUES,
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];
export const EVIDENCE_DATASETS = [
  "identity",
  "sec_filing",
  "sec_company_facts",
  "sec_insider_transactions",
  "sec_institutional_holdings",
  "bls_macro",
  "treasury_yield",
  "market_bars",
  "insightsentry_quote",
  "sec_exhibit",
  "insightsentry_fundamentals",
  "insightsentry_news",
  "insightsentry_news_company",
  "insightsentry_news_market",
  "insightsentry_news_risk",
  "insightsentry_documents",
  "insightsentry_calendar",
  "insightsentry_peers",
  "insightsentry_options",
  "insightsentry_request_ledger",
  "captured_web",
] as const;
export type EvidenceDataset = (typeof EVIDENCE_DATASETS)[number];

const SecLocatorSchema = z
  .object({
    kind: z.literal("sec_filing"),
    source: z.enum(SEC_SOURCE_VALUES),
    sourceUrl: SourceUrlSchema,
    canonicalUrl: SourceUrlSchema.optional(),
    accession: z.string().regex(/^\d{10}-\d{2}-\d{6}$/),
    form: z.string().trim().min(1).max(30),
    filedAt: TimestampSchema,
    acceptedAt: TimestampSchema,
    periodStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isStrictIsoDate, "invalid period start date")
      .optional(),
    periodEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isStrictIsoDate, "invalid period end date")
      .optional(),
    instantAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isStrictIsoDate, "invalid instant date")
      .optional(),
    unit: z.string().trim().min(1).max(64),
    tag: z.string().trim().min(1).max(240).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.periodStart !== undefined &&
      value.periodEnd !== undefined &&
      value.periodStart > value.periodEnd
    ) {
      context.addIssue({
        code: "custom",
        message: "period is reversed",
        path: ["periodEnd"],
      });
    }
  });

const BlsLocatorSchema = z
  .object({
    kind: z.literal("macro"),
    source: z.literal("bls_allowlist"),
    sourceUrl: SourceUrlSchema,
    seriesId: z.enum([
      "CUUR0000SA0",
      "CUUR0000SA0L1E",
      "LNS14000000",
      "CES0000000001",
      "CES0500000003",
      "WPUFD4",
    ]),
    period: z.string().trim().min(1).max(32),
    observationDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isStrictIsoDate, "invalid observation date")
      .optional(),
    unit: z.string().trim().min(1).max(64),
  })
  .strict();

const TreasuryLocatorSchema = z
  .object({
    kind: z.literal("treasury"),
    source: z.literal("treasury_yield"),
    sourceUrl: SourceUrlSchema,
    observationDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isStrictIsoDate, "invalid observation date"),
    tenor: z.string().trim().min(1).max(32),
    unit: z.string().trim().min(1).max(64),
  })
  .strict();

const MarketLocatorSchema = z
  .object({
    kind: z.literal("market"),
    source: z.literal("alpaca_market_data"),
    sourceUrl: SourceUrlSchema,
    symbol: z.string().trim().min(1).max(16),
    periodStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isStrictIsoDate, "invalid period start date"),
    periodEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(isStrictIsoDate, "invalid period end date"),
    timeframe: z.literal("1Day"),
    adjustment: z.literal("all"),
    unit: z.literal("USD"),
  })
  .strict();

const LicensedProviderLocatorSchema = z
  .object({
    kind: z.literal("licensed_provider"),
    source: z.literal("insightsentry_rapidapi"),
    sourceUrl: SourceUrlSchema,
    endpoint: z.string().trim().min(1).max(240),
    symbol: z.string().trim().min(1).max(32),
    dataset: z.enum(EVIDENCE_DATASETS),
    unit: z.string().trim().min(1).max(64),
  })
  .strict();

const CapturedWebLocatorSchema = z
  .object({
    kind: z.literal("captured_web"),
    source: z.literal("captured_web"),
    sourceUrl: SourceUrlSchema,
    publisher: z.string().trim().min(1).max(240),
    title: z.string().trim().min(1).max(500),
  })
  .strict();

export const SourceLocatorSchema = z.discriminatedUnion("kind", [
  SecLocatorSchema,
  BlsLocatorSchema,
  TreasuryLocatorSchema,
  MarketLocatorSchema,
  LicensedProviderLocatorSchema,
  CapturedWebLocatorSchema,
]);
export type SourceLocator = z.infer<typeof SourceLocatorSchema>;
