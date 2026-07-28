import { z } from "zod";

export function assertNever(value: never): never {
  throw new Error(`unexpected exhaustive variant: ${JSON.stringify(value)}`);
}

export const TickerSymbolSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9.-]{0,11}$/)
  .transform((value) => value.toUpperCase())
  .brand<"TickerSymbol">();
export type TickerSymbol = z.infer<typeof TickerSymbolSchema>;

export const CikSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}$/)
  .transform((value) => value.padStart(10, "0"))
  .brand<"Cik">();
export type Cik = z.infer<typeof CikSchema>;

const UuidIdSchema = z.string().uuid();

export const IssuerIdSchema = UuidIdSchema.brand<"IssuerId">();
export type IssuerId = z.infer<typeof IssuerIdSchema>;
export const SecurityIdSchema = z
  .string()
  .regex(/^sec:[0-9]{10}:[A-Z][A-Z0-9.-]{0,11}:[A-Z_]+$/)
  .brand<"SecurityId">();
export type SecurityId = z.infer<typeof SecurityIdSchema>;
export const SecurityClassIdSchema = z
  .string()
  .min(3)
  .max(180)
  .regex(/^class:[A-Za-z0-9._:-]+$/)
  .brand<"SecurityClassId">();
export type SecurityClassId = z.infer<typeof SecurityClassIdSchema>;

export const RunIdSchema = UuidIdSchema.brand<"RunId">();
export type RunId = z.infer<typeof RunIdSchema>;
export const SnapshotIdSchema = UuidIdSchema.brand<"SnapshotId">();
export type SnapshotId = z.infer<typeof SnapshotIdSchema>;
export const ReportIdSchema = UuidIdSchema.brand<"ReportId">();
export type ReportId = z.infer<typeof ReportIdSchema>;
export const ReportVersionIdSchema = UuidIdSchema.brand<"ReportVersionId">();
export type ReportVersionId = z.infer<typeof ReportVersionIdSchema>;
export const QuestionIdSchema = UuidIdSchema.brand<"QuestionId">();
export type QuestionId = z.infer<typeof QuestionIdSchema>;
export const SourceIdSchema = UuidIdSchema.brand<"SourceId">();
export type SourceId = z.infer<typeof SourceIdSchema>;
export const EvidenceIdSchema = UuidIdSchema.brand<"EvidenceId">();
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;
export const ArtifactIdSchema = UuidIdSchema.brand<"ArtifactId">();
export type ArtifactId = z.infer<typeof ArtifactIdSchema>;
export const EventIdSchema = UuidIdSchema.brand<"EventId">();
export type EventId = z.infer<typeof EventIdSchema>;
export const JobIdSchema = UuidIdSchema.brand<"JobId">();
export type JobId = z.infer<typeof JobIdSchema>;
export const AttemptIdSchema = UuidIdSchema.brand<"AttemptId">();
export type AttemptId = z.infer<typeof AttemptIdSchema>;
export const ClaimIdSchema = UuidIdSchema.brand<"ClaimId">();
export type ClaimId = z.infer<typeof ClaimIdSchema>;
export const ObservationIdSchema = UuidIdSchema.brand<"ObservationId">();
export type ObservationId = z.infer<typeof ObservationIdSchema>;
export const MetricFactIdSchema = UuidIdSchema.brand<"MetricFactId">();
export type MetricFactId = z.infer<typeof MetricFactIdSchema>;
export const ResearchFileIdSchema = UuidIdSchema.brand<"ResearchFileId">();
export type ResearchFileId = z.infer<typeof ResearchFileIdSchema>;
export const CapabilityIdSchema = z
  .string()
  .regex(/^cap:[a-z][a-z0-9_]{1,63}$/)
  .brand<"CapabilityId">();
export type CapabilityId = z.infer<typeof CapabilityIdSchema>;
export const RightsPolicyIdSchema = z
  .string()
  .regex(/^rights:[a-z][a-z0-9_]{1,63}$/)
  .brand<"RightsPolicyId">();
export type RightsPolicyId = z.infer<typeof RightsPolicyIdSchema>;

export const parseTickerSymbol = (value: unknown): TickerSymbol | undefined =>
  TickerSymbolSchema.safeParse(value).data;

export const parseCik = (value: unknown): Cik | undefined =>
  CikSchema.safeParse(value).data;

export const parseIssuerId = (value: unknown): IssuerId | undefined =>
  IssuerIdSchema.safeParse(value).data;

export const parseSecurityId = (value: unknown): SecurityId | undefined =>
  SecurityIdSchema.safeParse(value).data;

export const parseSecurityClassId = (
  value: unknown,
): SecurityClassId | undefined => SecurityClassIdSchema.safeParse(value).data;

export const securityIdFor = (
  cik: Cik,
  ticker: TickerSymbol,
  exchange: string,
): SecurityId => SecurityIdSchema.parse(`sec:${cik}:${ticker}:${exchange}`);

export const issuerIdFor = (cik: Cik): IssuerId =>
  IssuerIdSchema.parse(
    `00000000-0000-4000-8000-${cik.slice(-12).padStart(12, "0")}`,
  );

export const securityClassIdFor = (
  ticker: TickerSymbol,
  normalizedTitle: string,
): SecurityClassId => {
  const slug = normalizedTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return SecurityClassIdSchema.parse(`class:${ticker.toLowerCase()}:${slug}`);
};
