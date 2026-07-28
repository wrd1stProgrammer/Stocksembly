import {
  ContractViolation,
  hashBytes,
  hashCanonical,
  timestampMillis,
} from "./contractHelpers";
import {
  artifactContentHash,
  type EvidenceRecord,
  type EvidenceDataset,
  EvidenceRecordSchema,
  type EvidenceSource,
  type RawArtifact,
  type RawArtifactInput,
  RawArtifactInputSchema,
  RawArtifactSchema,
  TimestampSchema,
} from "./evidenceSchemas";

export type RawArtifactDraft = RawArtifactInput;

export function createRawArtifact(input: RawArtifactDraft): RawArtifact {
  const parsedInput = RawArtifactInputSchema.parse(input);
  if (parsedInput.statusCode < 200 || parsedInput.statusCode >= 300)
    throw new ContractViolation(
      "http_status",
      `HTTP ${parsedInput.statusCode} response is quarantined`,
    );
  const bodyHash = hashBytes(parsedInput.body);
  const envelope = {
    ...parsedInput,
    kind: "raw" as const,
    parentHashes: [],
    bodyHash,
    createdAt: parsedInput.retrievedAt,
    releaseTimeAvailability:
      parsedInput.sourcePublishedAt === undefined
        ? ("unavailable" as const)
        : ("known" as const),
    semanticStatus: "accepted" as const,
  };
  return RawArtifactSchema.parse({
    ...envelope,
    contentHash: artifactContentHash({
      ...envelope,
      contentHash: "0".repeat(64),
    }),
  });
}

export type EvidenceRecordDraft = Omit<
  EvidenceRecord,
  | "kind"
  | "recordHash"
  | "provider"
  | "dataset"
  | "evidenceKind"
  | "currentValidity"
  | "supersedesEvidenceIds"
  | "releaseTimeAvailability"
  | "evidenceCutoffAt"
  | "source"
> & {
  readonly source?: EvidenceSource;
  readonly provider?: string;
  readonly dataset?: EvidenceDataset;
  readonly evidenceKind?: EvidenceRecord["evidenceKind"];
  readonly currentValidity?: EvidenceRecord["currentValidity"];
  readonly supersedesEvidenceIds?: readonly string[];
  readonly evidenceCutoffAt?: string;
};

function calculateEvidenceRecordHash(value: object): string {
  return hashCanonical(value);
}

const DEFAULT_DATASET_BY_SOURCE = {
  sec_ticker_exchange: "identity",
  sec_submissions: "sec_filing",
  sec_company_facts: "sec_company_facts",
  sec_primary_filing: "sec_filing",
  sec_exhibit: "sec_exhibit",
  bls_allowlist: "bls_macro",
  treasury_yield: "treasury_yield",
  alpaca_market_data: "market_bars",
  insightsentry_rapidapi: "market_bars",
  captured_web: "captured_web",
} as const satisfies Readonly<Record<EvidenceSource, EvidenceDataset>>;

export function createEvidenceRecord(
  input: EvidenceRecordDraft,
): EvidenceRecord {
  const { evidenceCutoffAt, ...recordInput } = input;
  if (evidenceCutoffAt !== undefined) {
    TimestampSchema.parse(evidenceCutoffAt);
    const times = [
      recordInput.retrievedAt,
      recordInput.sourcePublishedAt,
      recordInput.locator.kind === "sec_filing"
        ? recordInput.locator.filedAt
        : undefined,
      recordInput.locator.kind === "sec_filing"
        ? recordInput.locator.acceptedAt
        : undefined,
    ];
    for (const timestamp of times) {
      if (
        timestamp !== undefined &&
        timestampMillis(timestamp) > timestampMillis(evidenceCutoffAt)
      )
        throw new ContractViolation(
          "post_cutoff",
          "evidence was first available after the snapshot cutoff",
        );
    }
  }
  const record = {
    ...recordInput,
    kind: "evidence_record" as const,
    source: recordInput.source ?? recordInput.locator.source,
    provider: recordInput.provider ?? "official",
    dataset:
      recordInput.dataset ?? DEFAULT_DATASET_BY_SOURCE[recordInput.locator.source],
    evidenceKind:
      recordInput.evidenceKind ??
      (recordInput.locator.kind === "sec_filing" ? "filing" : "macro_release"),
    releaseTimeAvailability:
      recordInput.sourcePublishedAt === undefined
        ? ("unavailable" as const)
        : ("known" as const),
    supersedesEvidenceIds: recordInput.supersedesEvidenceIds ?? [],
    currentValidity: recordInput.currentValidity ?? ("active" as const),
  };
  return EvidenceRecordSchema.parse({
    ...record,
    recordHash: calculateEvidenceRecordHash(record),
  });
}

export function evidenceRecordHashFor(value: EvidenceRecord): string {
  const { recordHash: _recordHash, ...withoutHash } = value;
  return calculateEvidenceRecordHash(withoutHash);
}
export const evidenceRecordHash = evidenceRecordHashFor;
