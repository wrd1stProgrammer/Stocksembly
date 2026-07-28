import type { CapabilityManifest } from "../domain/capabilities";
import { hashCanonical } from "../domain/contractHelpers";
import {
  WORKFLOW_V1_CHAIR_ID,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import type {
  AllAgentAssignmentsV1,
  AssignmentRepositoryPort,
  ChairAssignmentV1,
  MandateTransactionPort,
  SpecialistAssignmentV1,
} from "./assignAllAgentsContracts";
import type { SnapshotManifest } from "./buildSnapshot";
import { makeHarness, requireSealed } from "./buildSnapshot.testSupport";
import { createResearchMandate } from "./createMandate";
import {
  type CreateMandateDependencies,
  type CreateMandateInput,
  MANDATE_PREREQUISITE_EVENTS,
  type MandatePrerequisiteEvent,
  type ResearchMandateRepositoryPort,
  type ResearchMandateV1,
  type SnapshotAdmission,
} from "./createMandateContracts";

export function admissionFor(
  snapshot: SnapshotManifest,
  lifecycle: readonly MandatePrerequisiteEvent[] = MANDATE_PREREQUISITE_EVENTS,
): SnapshotAdmission {
  return { snapshot, lifecycle };
}

class MemoryMandateRepository
  implements ResearchMandateRepositoryPort, AssignmentRepositoryPort
{
  admission: SnapshotAdmission | undefined;
  readonly operations: string[];
  readonly persistedMandates: ResearchMandateV1[] = [];
  readonly persistedAssignments: SpecialistAssignmentV1[] = [];
  readonly persistedEvents: string[] = [];
  persistedChair: ChairAssignmentV1 | undefined;
  failurePoint: AtomicFailurePoint | undefined;

  constructor(admission: SnapshotAdmission) {
    this.admission = admission;
    this.operations = [...admission.lifecycle];
  }

  async loadSnapshotAdmission(): Promise<SnapshotAdmission | undefined> {
    return this.admission;
  }

  async transaction<Result>(
    operation: (transaction: MandateTransactionPort) => Promise<Result>,
  ): Promise<Result> {
    const stagedMandates: ResearchMandateV1[] = [];
    const stagedAssignments: SpecialistAssignmentV1[] = [];
    let stagedChair: ChairAssignmentV1 | undefined;
    const stagedEvents: string[] = [];
    const transaction: MandateTransactionPort = {
      persistMandate: async (mandate) => {
        if (this.failurePoint === "mandate")
          throw new TypeError("mandate failure");
        stagedMandates.push(mandate);
      },
      persistAssignments: async (assignments) => {
        if (this.failurePoint === "assignments")
          throw new TypeError("assignments failure");
        stagedAssignments.push(...assignments);
      },
      persistChair: async (chair) => {
        if (this.failurePoint === "chair") throw new TypeError("chair failure");
        stagedChair = chair;
      },
      appendMandateSealedEvent: async () => {
        if (this.failurePoint === "event") throw new TypeError("event failure");
        stagedEvents.push("mandate_sealed");
      },
    };
    const result = await operation(transaction);
    this.persistedMandates.push(...stagedMandates);
    this.persistedAssignments.push(...stagedAssignments);
    this.persistedChair = stagedChair;
    this.persistedEvents.push(...stagedEvents);
    this.operations.push(
      "mandate_persisted",
      "assignments_persisted",
      "chair_persisted",
      "mandate_sealed",
    );
    return result;
  }
}

export const ATOMIC_FAILURE_POINTS = [
  "mandate",
  "assignments",
  "chair",
  "event",
] as const;
export type AtomicFailurePoint = (typeof ATOMIC_FAILURE_POINTS)[number];

type MandateHarnessOptions = {
  readonly scope?: "broad" | "focused";
  readonly question?: string;
  readonly lifecycle?: readonly MandatePrerequisiteEvent[];
  readonly rosterIds?: readonly string[];
  readonly mismatchCapabilities?: boolean;
  readonly mandateSealedAt?: string;
};

function mismatchedCapabilities(
  capabilities: CapabilityManifest,
): CapabilityManifest {
  return {
    version: "workflow-v1",
    disclosures: capabilities.disclosures.map((item) =>
      item.key === "current_market_data"
        ? {
            key: "current_market_data",
            state: { availability: "available", source: "licensed_provider" },
          }
        : item,
    ),
  };
}

export async function makeMandateHarness(
  options: MandateHarnessOptions = {},
): Promise<{
  readonly input: CreateMandateInput;
  readonly dependencies: CreateMandateDependencies;
  readonly repository: MemoryMandateRepository;
  readonly snapshot: SnapshotManifest;
}> {
  const snapshotHarness = makeHarness();
  const snapshot = requireSealed(
    await snapshotHarness.builder.build(snapshotHarness.input),
  ).manifest;
  const repository = new MemoryMandateRepository(
    admissionFor(snapshot, options.lifecycle),
  );
  const input: CreateMandateInput = {
    snapshotManifestHash: snapshot.manifestHash,
    symbol: snapshot.identity.ticker,
    locale: "en",
    scope: options.scope ?? "broad",
    capabilities:
      options.mismatchCapabilities === true
        ? mismatchedCapabilities(snapshot.capabilities)
        : snapshot.capabilities,
    rosterIds: options.rosterIds ?? [
      ...WORKFLOW_V1_SPECIALIST_IDS,
      WORKFLOW_V1_CHAIR_ID,
    ],
    ...(options.question === undefined ? {} : { question: options.question }),
  };
  return {
    input,
    dependencies: {
      clock: {
        mandateSealedAt: () =>
          options.mandateSealedAt ?? "2026-07-22T00:06:00.000Z",
      },
      repository,
    },
    repository,
    snapshot,
  };
}

type AssignmentHarnessOptions = MandateHarnessOptions & {
  readonly crossSnapshot?: boolean;
  readonly unsealedEvidence?: boolean;
  readonly failurePoint?: AtomicFailurePoint;
};

function rehashSnapshot(snapshot: SnapshotManifest): SnapshotManifest {
  const { manifestHash: _manifestHash, ...body } = snapshot;
  return { ...body, manifestHash: hashCanonical(body) };
}

function bindMandateToSnapshot(
  mandate: ResearchMandateV1,
  snapshot: SnapshotManifest,
): ResearchMandateV1 {
  const { mandateHash: _mandateHash, ...body } = mandate;
  const rebound = {
    ...body,
    runId: snapshot.runId,
    snapshotId: snapshot.snapshotId,
    manifestHash: snapshot.manifestHash,
  };
  return { ...rebound, mandateHash: hashCanonical(rebound) };
}

export async function makeAssignmentHarness(
  options: AssignmentHarnessOptions = {},
) {
  const mandateHarness = await makeMandateHarness({
    ...(options.scope === undefined ? {} : { scope: options.scope }),
    ...(options.question === undefined ? {} : { question: options.question }),
    ...(options.mandateSealedAt === undefined
      ? {}
      : { mandateSealedAt: options.mandateSealedAt }),
  });
  const mandate = await createResearchMandate(
    mandateHarness.input,
    mandateHarness.dependencies,
  );
  mandateHarness.repository.persistedAssignments.length = 0;
  mandateHarness.repository.persistedChair = undefined;
  mandateHarness.repository.failurePoint = options.failurePoint;
  const crossedSnapshot = rehashSnapshot({
    ...mandateHarness.snapshot,
    valueRegistry: {
      ...mandateHarness.snapshot.valueRegistry,
      snapshotId: "00000000-0000-4000-8000-000000000999",
    },
  });
  const firstArtifact = mandateHarness.snapshot.artifacts[0];
  if (firstArtifact === undefined)
    throw new TypeError("fixture needs evidence");
  const unsealedSnapshot = rehashSnapshot({
    ...mandateHarness.snapshot,
    artifacts: [
      { ...firstArtifact, rightsSource: "sec_exhibit" },
      ...mandateHarness.snapshot.artifacts.slice(1),
    ],
  });
  const snapshot =
    options.crossSnapshot === true
      ? crossedSnapshot
      : options.unsealedEvidence === true
        ? unsealedSnapshot
        : mandateHarness.snapshot;
  return {
    input: {
      mandate: bindMandateToSnapshot(mandate, snapshot),
      snapshot,
      rosterIds: options.rosterIds ?? WORKFLOW_V1_SPECIALIST_IDS,
    },
    repository: mandateHarness.repository,
    snapshot,
  };
}

export function requireMandate(result: ResearchMandateV1): ResearchMandateV1 {
  return result;
}

export function requireAssignments(
  result: AllAgentAssignmentsV1,
): AllAgentAssignmentsV1 {
  return result;
}
