import { z } from "zod";
import { hashCanonical, timestampMillis } from "../domain/contractHelpers";
import { TickerSymbolSchema } from "../domain/ids";
import { normalizeResearchDirection } from "../domain/researchDirection";
import { normalizeResearchProfile } from "../domain/researchProfile";
import {
  WORKFLOW_V1_CHAIR_ID,
  WORKFLOW_V1_ROSTER_FINGERPRINT,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import type { SnapshotManifest } from "./buildSnapshot";
import type {
  CreateMandateDependencies,
  CreateMandateInput,
  ResearchMandateV1,
} from "./createMandateContracts";
import {
  MANDATE_PREREQUISITE_EVENTS,
  RESEARCH_LOCALES,
  RESEARCH_SCOPES,
} from "./createMandateContracts";
import { freezeDeep } from "./createMandateImmutable";
import {
  classifyMaterialCruxes,
  mandateLimitations,
} from "./createMandatePolicy";

export type {
  CreateMandateDependencies,
  CreateMandateInput,
  ResearchMandateV1,
} from "./createMandateContracts";

export class MandateAdmissionError extends Error {
  readonly name = "MandateAdmissionError";

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: string, message: string): never {
  throw new MandateAdmissionError(code, message);
}

function sameValues(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function validateSnapshotHash(
  requestedHash: string,
  snapshot: SnapshotManifest,
): void {
  const { manifestHash, ...body } = snapshot;
  if (manifestHash !== requestedHash || hashCanonical(body) !== manifestHash)
    fail("snapshot_hash_mismatch", "snapshot manifest is not authentic");
}

function validateSnapshotTimes(snapshot: SnapshotManifest): void {
  const requested = timestampMillis(snapshot.requestedAt);
  const started = timestampMillis(snapshot.collectionStartedAt);
  const closed = timestampMillis(snapshot.acquisitionClosedAt);
  const cutoff = timestampMillis(snapshot.evidenceCutoffAt);
  const sealed = timestampMillis(snapshot.snapshotSealedAt);
  if (
    requested > started ||
    started > closed ||
    closed >= cutoff ||
    cutoff >= sealed
  )
    fail("snapshot_lifecycle_order", "snapshot lifecycle is out of order");
}

const CURRENT_PRICE_REQUEST =
  /(?:current|live|today(?:'s)?|latest)\s+(?:share\s+)?price|(?:share\s+)?price\s+(?:now|today)|현재\s*(?:주가|가격)|실시간\s*(?:주가|가격)/i;

export async function createResearchMandate(
  input: CreateMandateInput,
  dependencies: CreateMandateDependencies,
): Promise<ResearchMandateV1> {
  const admission = await dependencies.repository.loadSnapshotAdmission(
    input.snapshotManifestHash,
  );
  if (admission === undefined)
    fail("snapshot_unsealed", "sealed snapshot admission is required");
  if (!sameValues(admission.lifecycle, MANDATE_PREREQUISITE_EVENTS))
    fail("snapshot_unsealed", "mandate requires the complete sealed lifecycle");
  validateSnapshotHash(input.snapshotManifestHash, admission.snapshot);
  validateSnapshotTimes(admission.snapshot);
  if (
    hashCanonical(input.capabilities) !==
    hashCanonical(admission.snapshot.capabilities)
  )
    fail(
      "capability_mismatch",
      "capabilities must come from the sealed snapshot",
    );
  const expectedRoster = [...WORKFLOW_V1_SPECIALIST_IDS, WORKFLOW_V1_CHAIR_ID];
  if (!sameValues(input.rosterIds, expectedRoster))
    fail("roster_drift", "runtime roster does not match WorkflowV1");
  const symbol = TickerSymbolSchema.parse(input.symbol);
  if (symbol !== admission.snapshot.identity.ticker)
    fail("symbol_mismatch", "symbol does not match the sealed identity");
  const locale = z.enum(RESEARCH_LOCALES).parse(input.locale);
  const scope = z.enum(RESEARCH_SCOPES).parse(input.scope);
  const researchProfile =
    input.researchProfile === undefined
      ? undefined
      : normalizeResearchProfile(input.researchProfile, symbol);
  const question =
    typeof input.question === "string"
      ? normalizeResearchDirection(input.question)
      : undefined;
  if (
    question !== undefined &&
    CURRENT_PRICE_REQUEST.test(question) &&
    admission.snapshot.capabilities.disclosures.find(
      (disclosure) => disclosure.key === "current_market_data",
    )?.state.availability !== "available"
  )
    fail("current_price_request", "current-price research is unavailable");
  const mandateSealedAt = dependencies.clock.mandateSealedAt();
  if (
    timestampMillis(mandateSealedAt) <
    timestampMillis(admission.snapshot.snapshotSealedAt)
  )
    fail("mandate_before_snapshot", "mandate cannot precede snapshot seal");
  const body = {
    schemaVersion: "ResearchMandateV1",
    runId: admission.snapshot.runId,
    snapshotId: admission.snapshot.snapshotId,
    manifestHash: admission.snapshot.manifestHash,
    symbol,
    ...(question === undefined ? {} : { question }),
    locale,
    scope,
    ...(researchProfile === undefined ? {} : { researchProfile }),
    capabilities: admission.snapshot.capabilities,
    materialCruxes: classifyMaterialCruxes(scope, question),
    limitations: mandateLimitations(
      admission.snapshot.capabilities,
      admission.snapshot.limitations,
    ),
    briefing: {
      kind: "mandate_briefing",
      author: "system",
      source: "code",
    },
    specialistRoleIds: WORKFLOW_V1_SPECIALIST_IDS,
    chairRoleId: WORKFLOW_V1_CHAIR_ID,
    rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
    mandateSealedAt,
  } as const;
  const immutableBody = structuredClone(body);
  return freezeDeep({
    ...immutableBody,
    mandateHash: hashCanonical(immutableBody),
  });
}
