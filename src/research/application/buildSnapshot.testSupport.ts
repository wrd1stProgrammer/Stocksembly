import { RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { createValueRegistry, registerValue } from "../domain/valueRegistry";
import {
  SnapshotBuilderV1,
  type SnapshotBuildInput,
  type SnapshotBuildResult,
  type SnapshotEvidence,
  type SnapshotRegister,
} from "./buildSnapshot";
import { trustedCapabilityManifest } from "./buildSnapshotCapabilityFixtures.testSupport";
import {
  MemoryCas,
  MemorySnapshotClock,
  MemorySnapshotRepository,
} from "./buildSnapshotFakes.testSupport";

export {
  MemoryCas,
  MemorySnapshotClock,
  MemorySnapshotRepository,
} from "./buildSnapshotFakes.testSupport";

export const RUN_ID = RunIdSchema.parse("00000000-0000-4000-8000-000000000016");
export const SNAPSHOT_ID = SnapshotIdSchema.parse(
  "00000000-0000-4000-8000-000000000116",
);
export const LATER_SNAPSHOT_ID = SnapshotIdSchema.parse(
  "00000000-0000-4000-8000-000000000216",
);

type HarnessOptions = {
  readonly snapshotId?: string;
  readonly cutoffAt?: string;
  readonly evidenceRetrievedAt?: string;
  readonly collectionStartedAt?: string;
  readonly acquisitionClosedAt?: string;
  readonly includeIdentity?: boolean;
  readonly include10k?: boolean;
  readonly includeFacts?: boolean;
  readonly includeMacro?: boolean;
  readonly includeExhibit?: boolean;
  readonly macroFailure?: boolean;
  readonly factsRightsDenied?: boolean;
  readonly relabelIdentityCapability?: boolean;
  readonly snapshotSealedAt?: string;
  readonly mandateSealedAt?: string;
};

export function makeHarness(
  options: HarnessOptions = {},
  shared?: {
    readonly cas: MemoryCas;
    readonly repository: MemorySnapshotRepository;
  },
): {
  readonly builder: SnapshotBuilderV1;
  readonly cas: MemoryCas;
  readonly repository: MemorySnapshotRepository;
  readonly clock: MemorySnapshotClock;
  readonly input: SnapshotBuildInput;
  readonly evidence: readonly SnapshotEvidence[];
  readonly captureLateRegister: (value: SnapshotRegister) => void;
  readonly lateRegister: () => SnapshotRegister | undefined;
} {
  const cas = shared?.cas ?? new MemoryCas();
  const repository = shared?.repository ?? new MemorySnapshotRepository();
  const snapshotId = options.snapshotId ?? SNAPSHOT_ID;
  const lineage = { runId: RUN_ID, snapshotId };
  const retrievedAt = options.evidenceRetrievedAt ?? "2026-07-22T00:02:00.000Z";
  const rawIdentity = cas.add("identity", lineage);
  const raw10k = cas.add("10-k", lineage);
  const normalized10k = cas.add("normalized-10-k", lineage, [raw10k.digest]);
  const rawFacts = cas.add("facts", lineage);
  const rawAmendment = cas.add("10-k-amendment", lineage);
  const rawMacro = cas.add("macro", lineage);
  const rawExhibit = cas.add("exhibit", lineage);
  const evidence: SnapshotEvidence[] = [];
  if (options.includeIdentity !== false)
    evidence.push({
      evidenceId: "identity",
      dataset: "identity",
      rightsSource: "sec_ticker_exchange",
      retrievedAt,
      raw: rawIdentity,
    });
  if (options.include10k !== false)
    evidence.push(
      {
        evidenceId: "annual",
        dataset: "sec_filing",
        rightsSource: "sec_primary_filing",
        retrievedAt,
        raw: raw10k,
        normalized: normalized10k,
        form: "10-K",
        accessionNumber: "0000000000-26-000001",
        cik: "0000000000",
        filedAt: "2026-07-21T00:00:00.000Z",
        acceptedAt: "2026-07-21T00:01:00.000Z",
      },
      {
        evidenceId: "annual-amendment",
        dataset: "sec_filing",
        rightsSource: "sec_primary_filing",
        retrievedAt,
        raw: rawAmendment,
        form: "10-K/A",
        accessionNumber: "0000000000-26-000002",
        parentAccessionNumber: "0000000000-26-000001",
        cik: "0000000000",
        filedAt: "2026-07-21T01:00:00.000Z",
        acceptedAt: "2026-07-21T01:01:00.000Z",
      },
    );
  if (options.includeFacts !== false)
    evidence.push({
      evidenceId: "facts",
      dataset: "sec_company_facts",
      rightsSource: "sec_company_facts",
      retrievedAt,
      raw: rawFacts,
      current: true,
    });
  if (options.includeMacro !== false)
    evidence.push({
      evidenceId: "macro",
      dataset: "bls_macro",
      rightsSource: "bls_allowlist",
      retrievedAt,
      raw: rawMacro,
    });
  if (options.includeExhibit === true)
    evidence.push({
      evidenceId: "withheld-exhibit",
      dataset: "sec_exhibit",
      rightsSource: "sec_exhibit",
      retrievedAt,
      raw: rawExhibit,
    });
  let registry = createValueRegistry({ runId: RUN_ID, snapshotId });
  registry = registerValue(registry, {
    valueId: "revenue",
    runId: RUN_ID,
    snapshotId,
    metric: "revenue_annual",
    value: "100",
    unit: "USD",
    source: "sec_company_facts",
    accession: "0000000000-26-000001",
    form: "10-K",
    filedAt: "2026-07-21T00:00:00.000Z",
    acceptedAt: "2026-07-21T00:01:00.000Z",
    period: "FY:2025-12-31",
    evidenceCutoffAt: options.cutoffAt ?? "2026-07-22T00:04:00.000Z",
  }).registry;
  let late: SnapshotRegister | undefined;
  const captureLateRegister = (value: SnapshotRegister): void => {
    late = value;
  };
  const input: SnapshotBuildInput = {
    runId: RUN_ID,
    snapshotId,
    identity: {
      cik: "0000000000",
      ticker: "TEST",
      legalName: "Test Corporation",
      exchange: "NASDAQ",
      identityHash: "a".repeat(64),
    },
    requestedAt: "2026-07-22T00:00:00.000Z",
    versions: {
      schema: "snapshot-v1",
      marketPack: "market-pack-v1",
      normalizationPolicy: "financial-v1",
      rightsPolicy: "rights-v1",
      adapters: { sec: "1", bls: "1" },
      parsers: { filing: "1", facts: "1" },
      calculations: { registry: "1" },
    },
    capabilities: trustedCapabilityManifest({
      ...(options.macroFailure === true ? { macroFailure: true } : {}),
      ...(options.factsRightsDenied === true
        ? { factsRightsDenied: true }
        : {}),
      ...(options.relabelIdentityCapability === true
        ? { relabelIdentity: true }
        : {}),
    }),
    valueRegistry: registry,
    failures:
      options.macroFailure === true
        ? [{ dataset: "bls_macro", code: "transport_unavailable" }]
        : [],
    collect: async (register) => {
      captureLateRegister(register);
      for (const item of evidence) await register(item);
    },
  };
  const clock = new MemorySnapshotClock({
    collectionStartedAt:
      options.collectionStartedAt ?? "2026-07-22T00:01:00.000Z",
    close: {
      acquisitionClosedAt:
        options.acquisitionClosedAt ?? "2026-07-22T00:03:00.000Z",
      evidenceCutoffAt: options.cutoffAt ?? "2026-07-22T00:04:00.000Z",
    },
    snapshotSealedAt: options.snapshotSealedAt ?? "2026-07-22T00:05:00.000Z",
    mandateSealedAt: options.mandateSealedAt ?? "2026-07-22T00:06:00.000Z",
  });
  return {
    builder: new SnapshotBuilderV1({ cas, clock, repository }),
    cas,
    clock,
    repository,
    input,
    evidence,
    captureLateRegister,
    lateRegister: () => late,
  };
}

export function requireSealed(result: SnapshotBuildResult) {
  if (result.kind !== "sealed") throw new TypeError("expected sealed result");
  return result;
}
