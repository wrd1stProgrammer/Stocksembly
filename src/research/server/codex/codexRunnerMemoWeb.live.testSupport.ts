import { randomUUID } from "node:crypto";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoOutputSchema } from "../../domain/agentOutputs";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../domain/ids";
import { SqliteLeaseEngineStore } from "../../worker/leaseEngineSqlite";
import { createFilesystemArtifactStore } from "../artifacts/filesystemArtifactStore";
import { MemoryArtifactMetadata } from "../artifacts/filesystemArtifactStore.contract.fixtures";
import { SqliteAgentOutputCommitStore } from "../persistence/sqlite/sqliteAgentOutputCommitStore";
import { openSqliteStore } from "../persistence/sqlite/sqliteStore";
import { codexInputHash } from "./codexRunner";
import { FakeLaunchReservationStore } from "./codexRunnerTestSupport";

export class LiveMemoWebVerificationError extends Error {
  readonly name = "LiveMemoWebVerificationError";

  constructor(readonly reason: string) {
    super(reason);
  }
}

export async function prepareLiveMemoWebFixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "stocksembly-live-memo-web-")),
  );
  const databasePath = join(root, "research.sqlite");
  const attemptDir = join(root, "attempt");
  const runId = RunIdSchema.parse(randomUUID());
  const snapshotId = SnapshotIdSchema.parse(randomUUID());
  const jobId = JobIdSchema.parse(randomUUID());
  const attemptId = AttemptIdSchema.parse(randomUUID());
  const sourceArtifactId = ArtifactIdSchema.parse(randomUUID());
  const claimId = randomUUID();
  const metadata = new MemoryArtifactMetadata();
  const cas = createFilesystemArtifactStore({
    dataDirectory: join(root, "cas"),
    maxBlobBytes: 24 * 1_024 * 1_024,
    metadata,
  });
  const source = await cas.put({
    artifactId: sourceArtifactId,
    runId,
    snapshotId,
    mediaType: "text/plain",
    parentDigests: [],
    bytes: new TextEncoder().encode(
      "Live-path fixture: consult the requested public SEC page.",
    ),
  });
  const prompt = [
    "Use the native hosted web search exactly once. Search for and open the",
    "official SEC About the SEC page, then summarize only the agency mission.",
    "Do not call shell, browser, MCP, or any other tool.",
    `Return memo JSON with sourceArtifactIds ["${sourceArtifactId}"].`,
    `Use claimId "${claimId}" and evidenceArtifactIds ["${sourceArtifactId}"].`,
    "Include one concise English/Korean position, empty dissent, and empty unknowns.",
  ].join("\n");
  const inputHash = codexInputHash({
    stage: "memo",
    prompt,
    outputSchema: MemoOutputSchema,
  });
  const store = openSqliteStore(databasePath);
  store.createRun({
    runId,
    snapshotId,
    requestedAt: "2026-07-24T00:00:00.000Z",
    initialJob: {
      jobId,
      kind: "research",
      logicalKey: "memo:market",
      inputHash,
      inputManifestHash: "f".repeat(64),
      createdAt: "2026-07-24T00:00:00.000Z",
    },
    initialEvent: {
      eventId: EventIdSchema.parse(randomUUID()),
      type: "run_queued",
      stateId: "queued",
      occurredAt: "2026-07-24T00:00:00.000Z",
    },
  });
  store.saveArtifactMetadata({
    ...source,
    contentHash: source.digest,
    logicalKey: "evidence:live-path",
    inputHash: source.digest,
    createdAt: "2026-07-24T00:00:00.000Z",
    locator: {
      kind: "captured_web",
      source: "captured_web",
      sourceUrl: "https://www.sec.gov/about",
      title: "About the SEC",
      publisher: "U.S. Securities and Exchange Commission",
    },
  });
  store.close();
  const commitStore = new SqliteAgentOutputCommitStore(databasePath);
  commitStore.bindJobInputArtifact({ jobId, artifactId: sourceArtifactId });
  const engine = new SqliteLeaseEngineStore(databasePath);
  if (!engine.activateNextRun(randomUUID(), "2026-07-24T00:00:01.000Z")) {
    engine.close();
    throw new LiveMemoWebVerificationError("activation_failed");
  }
  const leased = engine.claim(
    "live-memo-web",
    "2026-07-24T00:00:02.000Z",
    "2026-07-24T01:00:00.000Z",
  );
  if (leased === undefined) {
    engine.close();
    throw new LiveMemoWebVerificationError("lease_missing");
  }
  const reserved = engine.reserve({
    claim: leased,
    attemptId,
    eventId: randomUUID(),
    now: "2026-07-24T00:00:03.000Z",
  });
  engine.close();
  if (reserved.kind !== "reserved")
    throw new LiveMemoWebVerificationError(`reserve_${reserved.kind}`);
  const claim = {
    key: { runId, jobId, attemptId, ordinal: reserved.ordinal },
    fence: { ownerId: leased.ownerId, token: leased.leaseToken },
  } as const;
  const reservations = new FakeLaunchReservationStore();
  reservations.commit({
    ...claim.key,
    status: "spawn_reserved",
    committed: true,
    inputHash,
    reservationFence: claim.fence,
    currentFence: claim.fence,
  });
  return {
    root,
    databasePath,
    attemptDir,
    runId,
    snapshotId,
    jobId,
    attemptId,
    prompt,
    inputHash,
    cas,
    commitStore,
    leased,
    reserved,
    claim,
    reservations,
  } as const;
}
