import { describe, expect, it } from "vitest";
import { createResearchTestDatabase } from "../../test/researchPostgres";
import { MemoOutputSchema } from "../domain/agentOutputs";
import { canonicalJson, hashBytes } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import type {
  AgentOutputCommitBinding,
  AgentOutputCommitStorePort,
  AtomicAgentOutputCommit,
  MalformedAgentOutputRejection,
} from "../ports/agentOutputCommit";
import type { ArtifactCasPort } from "../ports/artifacts";
import { StrictArtifactCasFake } from "../ports/test/serviceFakes";
import { CODEX_RUNTIME_PINS } from "../server/codex/codexPolicy";
import { PostgresAgentOutputCommitStore } from "../server/persistence/postgres/postgresAgentOutputCommitStore";
import { openPostgresStore } from "../server/persistence/postgres/postgresStore";
import { PostgresLeaseEngineStore } from "../worker/leaseEnginePostgres";
import { commitAgentOutput } from "./commitAgentOutput";

const id = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const hash = (value: string): string => value.repeat(64);
const sourceBytes = new TextEncoder().encode("verified filing bytes");
const sourceHash = hashBytes(sourceBytes);
const trustedBinaryHash = CODEX_RUNTIME_PINS.originSha256;
const trustedCliVersion = CODEX_RUNTIME_PINS.version;

const ids = {
  runId: RunIdSchema.parse(id(1)),
  snapshotId: SnapshotIdSchema.parse(id(2)),
  jobId: JobIdSchema.parse(id(3)),
  attemptId: AttemptIdSchema.parse(id(4)),
  artifactId: ArtifactIdSchema.parse(id(5)),
  sourceArtifactId: ArtifactIdSchema.parse(id(6)),
  eventId: EventIdSchema.parse(id(7)),
  replacementAttemptId: AttemptIdSchema.parse(id(8)),
  replacementEventId: EventIdSchema.parse(id(9)),
} as const;

const locator = {
  kind: "sec_filing",
  source: "sec_primary_filing",
  sourceUrl: "https://www.sec.gov/Archives/example.htm",
  accession: "0000000000-26-000001",
  form: "10-K",
  filedAt: "2026-01-20T00:00:00.000Z",
  acceptedAt: "2026-01-20T00:01:00.000Z",
  periodEnd: "2025-12-31",
  unit: "USD",
} as const;

function binding(overrides: Partial<AgentOutputCommitBinding> = {}) {
  return {
    runId: ids.runId,
    snapshotId: ids.snapshotId,
    jobId: ids.jobId,
    attemptId: ids.attemptId,
    ordinal: 1,
    logicalArtifactId: "memo:market",
    inputHash: hash("a"),
    jobInputManifestHash: hash("f"),
    attemptInputManifestHash: hash("f"),
    promptHash: hash("d"),
    schemaHash: hash("e"),
    runnerBinaryHash: trustedBinaryHash,
    runnerCliVersion: trustedCliVersion,
    runnerInputHash: hash("a"),
    runnerStage: "memo",
    runnerModel: "gpt-5.6-luna",
    runnerReasoning: "low",
    runnerBrowsingPolicy: "audited_web",
    runnerToolTranscriptHash:
      "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
    status: "running",
    currentFence: { ownerId: "worker-a", token: 4 },
    citableArtifacts: [
      {
        artifactId: ids.sourceArtifactId,
        runId: ids.runId,
        snapshotId: ids.snapshotId,
        contentHash: sourceHash,
        locator,
      },
    ],
    ...overrides,
  } satisfies AgentOutputCommitBinding;
}

async function casWithSource(): Promise<StrictArtifactCasFake> {
  const cas = new StrictArtifactCasFake();
  await cas.put({
    artifactId: ids.sourceArtifactId,
    runId: ids.runId,
    snapshotId: ids.snapshotId,
    mediaType: "application/json",
    parentDigests: [],
    bytes: sourceBytes,
  });
  return cas;
}

function citableArtifact() {
  return (
    binding().citableArtifacts[0] ??
    (() => {
      throw new Error("fixture missing");
    })()
  );
}

const candidate = MemoOutputSchema.parse({
  kind: "memo",
  sourceArtifactIds: [ids.sourceArtifactId],
  positions: [
    {
      claimId: id(10),
      stance: "supports",
      publicSummary: {
        en: "Supported finding.",
        ko: "근거가 있는 결론입니다.",
      },
      evidenceArtifactIds: [ids.sourceArtifactId],
    },
  ],
  dissent: [],
  unknowns: [],
});

function command(candidateValue: unknown = candidate) {
  return {
    claim: {
      key: {
        runId: ids.runId,
        jobId: ids.jobId,
        attemptId: ids.attemptId,
        ordinal: 1,
      },
      fence: { ownerId: "worker-a", token: 4 },
    },
    stage: "memo",
    candidate: candidateValue,
    artifactId: ids.artifactId,
    eventId: ids.eventId,
    replacementAttemptId: ids.replacementAttemptId,
    replacementEventId: ids.replacementEventId,
    occurredAt: "2026-07-23T00:00:00.000Z",
    workerProvenance: {
      roleId: "market",
      model: "gpt-5.6-luna",
      cliVersion: trustedCliVersion,
      cliBinaryHash: hash("c"),
      promptHash: hash("d"),
      schemaHash: hash("e"),
      inputHash: hash("a"),
      inputManifestHash: hash("f"),
    },
  } as const;
}

class MemoryCommitStore implements AgentOutputCommitStorePort {
  readonly events: string[] = [];
  readonly accepted: AtomicAgentOutputCommit[] = [];
  readonly rejected: MalformedAgentOutputRejection[] = [];
  current: unknown = binding();

  async inspect(): Promise<unknown> {
    return this.current;
  }

  async commitAccepted(input: AtomicAgentOutputCommit) {
    if (this.accepted.length > 0) return { kind: "duplicate" } as const;
    this.events.push("metadata", "edges", "attempt", "job", "public-event");
    this.accepted.push(input);
    return { kind: "committed", sequence: 2 } as const;
  }

  async rejectMalformed(input: MalformedAgentOutputRejection) {
    this.rejected.push(input);
    return { kind: "replacement_reserved", ordinal: 2 } as const;
  }
}

async function createPostgresCommitFixture(
  _prefix: string,
  eventBase: number,
  transcriptHash = "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
) {
  const temporary = await createResearchTestDatabase();
  const database = temporary.pool;
  const store = await openPostgresStore(database);
  await store.createRun({
    runId: ids.runId,
    snapshotId: ids.snapshotId,
    requestedAt: "2026-07-23T00:00:00.000Z",
    initialJob: {
      jobId: ids.jobId,
      kind: "research",
      logicalKey: "memo:market",
      inputHash: hash("a"),
      inputManifestHash: hash("f"),
      createdAt: "2026-07-23T00:00:00.000Z",
    },
    initialEvent: {
      eventId: EventIdSchema.parse(id(eventBase)),
      type: "run_queued",
      stateId: "queued",
      occurredAt: "2026-07-23T00:00:00.000Z",
    },
  });
  await store.saveArtifactMetadata({
    artifactId: ids.sourceArtifactId,
    runId: ids.runId,
    snapshotId: ids.snapshotId,
    contentHash: sourceHash,
    byteLength: sourceBytes.byteLength,
    mediaType: "application/json",
    logicalKey: "evidence:filing",
    inputHash: hash("1"),
    createdAt: "2026-07-23T00:00:00.000Z",
    locator,
  });
  const citationBindingStore = new PostgresAgentOutputCommitStore(database);
  await citationBindingStore.bindJobInputArtifact({
    jobId: ids.jobId,
    artifactId: ids.sourceArtifactId,
  });
  await citationBindingStore.close();
  await store.close();
  const engine = new PostgresLeaseEngineStore(database);
  expect(
    await engine.activateNextRun(id(eventBase + 1), "2026-07-23T00:00:01.000Z"),
  ).toBe(true);
  const claim = await engine.claim(
    "worker-a",
    "2026-07-23T00:00:01.000Z",
    "2026-07-23T00:01:00.000Z",
  );
  if (claim === undefined) throw new RangeError("fixture lease missing");
  expect(
    await engine.reserve({
      claim,
      attemptId: ids.attemptId,
      eventId: id(eventBase + 2),
      now: "2026-07-23T00:00:02.000Z",
    }),
  ).toEqual({ kind: "reserved", ordinal: 1 });
  await engine.close();
  const commitStore = new PostgresAgentOutputCommitStore(database);
  expect(
    await commitStore.recordRunnerEvidence({
      runId: ids.runId,
      jobId: ids.jobId,
      attemptId: ids.attemptId,
      ordinal: 1,
      ownerId: "worker-a",
      token: claim.leaseToken,
      now: "2026-07-23T00:00:02.500Z",
      stage: "memo",
      promptHash: hash("d"),
      schemaHash: hash("e"),
      inputHash: hash("a"),
      binaryHash: trustedBinaryHash,
      cliVersion: trustedCliVersion,
      model: "gpt-5.6-luna",
      reasoning: "low",
      browsingPolicy: "audited_web",
      toolTranscriptHash: transcriptHash,
    }),
  ).toBe(true);
  return {
    database,
    close: temporary.close,
    commitStore,
    postgresCommand: {
      ...command(),
      claim: {
        key: command().claim.key,
        fence: { ownerId: "worker-a", token: claim.leaseToken },
      },
      occurredAt: "2026-07-23T00:00:03.000Z",
    } as const,
  };
}

describe("commitAgentOutput", () => {
  it("commits a citation only when its web artifact is fenced to the attempt transcript", async () => {
    // Given
    const transcriptHash = hash("9");
    const fixture = await createPostgresCommitFixture(
      "stocksembly-web-citation-",
      80,
      transcriptHash,
    );
    const cas = new StrictArtifactCasFake();
    const webArtifactId = ArtifactIdSchema.parse(id(66));
    const webBytes = new TextEncoder().encode("captured web evidence");
    const descriptor = await cas.put({
      artifactId: webArtifactId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      mediaType: "application/vnd.stocksembly.web-capture",
      parentDigests: [],
      bytes: webBytes,
    });
    expect(
      await fixture.commitStore.registerAttemptWebEvidence({
        claim: fixture.postgresCommand.claim,
        transcriptHash,
        now: "2026-07-23T00:00:02.750Z",
        artifacts: [
          {
            descriptor,
            url: "https://example.com/research",
            title: "Research",
            publisher: "Example",
            retrievedAt: "2026-07-23T00:00:02.700Z",
            excerpt: "captured web evidence",
          },
        ],
      }),
    ).toBe(true);
    const webCandidate = MemoOutputSchema.parse({
      ...candidate,
      sourceArtifactIds: [webArtifactId],
      positions: candidate.positions.map((position) => ({
        ...position,
        evidenceArtifactIds: [webArtifactId],
      })),
    });

    try {
      // When
      const result = await commitAgentOutput(
        { cas, store: fixture.commitStore },
        { ...fixture.postgresCommand, candidate: webCandidate },
      );

      // Then
      expect(result).toMatchObject({ kind: "committed" });
    } finally {
      await fixture.commitStore.close();
      await fixture.close();
    }
  });

  it("reserves a corrective attempt for a citation that was not bound to the attempt", async () => {
    // Given
    const fixture = await createPostgresCommitFixture(
      "stocksembly-uncaptured-web-",
      90,
      hash("9"),
    );
    const cas = new StrictArtifactCasFake();
    const webArtifactId = ArtifactIdSchema.parse(id(67));
    await cas.put({
      artifactId: webArtifactId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      mediaType: "application/vnd.stocksembly.web-capture",
      parentDigests: [],
      bytes: new TextEncoder().encode("uncaptured web evidence"),
    });
    const webCandidate = MemoOutputSchema.parse({
      ...candidate,
      sourceArtifactIds: [webArtifactId],
      positions: candidate.positions.map((position) => ({
        ...position,
        evidenceArtifactIds: [webArtifactId],
      })),
    });

    try {
      // When
      const result = await commitAgentOutput(
        { cas, store: fixture.commitStore },
        { ...fixture.postgresCommand, candidate: webCandidate },
      );

      // Then
      expect(result).toEqual({
        kind: "citation_replacement_reserved",
        ordinal: 2,
        invalidArtifactIds: [webArtifactId],
        allowedArtifactIds: [ids.sourceArtifactId],
      });
    } finally {
      await fixture.commitStore.close();
      await fixture.close();
    }
  });

  it("canonicalizes an unambiguous content-hash citation alias to its bound artifact", async () => {
    // Given
    const store = new MemoryCommitStore();
    const hashPrefix = sourceHash.slice(0, 12);
    const hashAlias = ArtifactIdSchema.parse(
      `${hashPrefix.slice(0, 8)}-${hashPrefix.slice(8)}-4000-8000-000000000001`,
    );
    const aliasedCandidate = MemoOutputSchema.parse({
      ...candidate,
      sourceArtifactIds: [ids.sourceArtifactId],
      positions: candidate.positions.map((position) => ({
        ...position,
        evidenceArtifactIds: [hashAlias],
      })),
    });

    // When
    const result = await commitAgentOutput(
      { cas: await casWithSource(), store },
      command(aliasedCandidate),
    );

    // Then
    expect(result).toMatchObject({ kind: "committed" });
    expect(store.accepted[0]?.envelope.payload).toMatchObject({
      positions: [{ evidenceArtifactIds: [ids.sourceArtifactId] }],
    });
    expect(store.accepted[0]?.envelope.citations).toEqual([
      {
        artifactId: ids.sourceArtifactId,
        contentHash: sourceHash,
        locator,
      },
    ]);
  });

  it("attaches worker provenance and atomically emits one event after a canonical CAS commit", async () => {
    // Given
    const store = new MemoryCommitStore();
    const cas = await casWithSource();

    // When
    const result = await commitAgentOutput({ cas, store }, command());
    const replay = await commitAgentOutput({ cas, store }, command());

    // Then
    expect(result).toMatchObject({ kind: "committed", sequence: 2 });
    expect(replay).toEqual({ kind: "duplicate" });
    expect(store.events).toEqual([
      "metadata",
      "edges",
      "attempt",
      "job",
      "public-event",
    ]);
    const committed = store.accepted[0];
    expect(committed?.envelope).toMatchObject({
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      jobId: ids.jobId,
      attemptId: ids.attemptId,
      ordinal: 1,
      roleId: "market",
      stage: "memo",
      model: "gpt-5.6-luna",
      reasoning: "low",
      browsingPolicy: "audited_web",
      toolTranscriptHash:
        "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
      cliVersion: trustedCliVersion,
      inputHash: hash("a"),
      inputManifestHash: hash("f"),
    });
    expect(committed?.descriptor.digest).toBe(
      hashBytes(new TextEncoder().encode(canonicalJson(committed?.envelope))),
    );
    expect(committed?.event.outputHash).toBe(committed?.envelope.outputHash);
  });

  it("accepts a cited artifact when identical CAS bytes were first stored by another run", async () => {
    const store = new MemoryCommitStore();
    const delegate = await casWithSource();
    const cas: ArtifactCasPort = {
      put: delegate.put.bind(delegate),
      has: delegate.has.bind(delegate),
      get: async (digest) => {
        const read = await delegate.get(digest);
        return read === undefined
          ? undefined
          : {
              bytes: read.bytes,
              descriptor: {
                ...read.descriptor,
                artifactId: ArtifactIdSchema.parse(id(90)),
                runId: RunIdSchema.parse(id(91)),
                snapshotId: SnapshotIdSchema.parse(id(92)),
              },
            };
      },
    };

    const result = await commitAgentOutput({ cas, store }, command());

    expect(result).toMatchObject({ kind: "committed" });
    expect(store.accepted[0]?.envelope.citations).toEqual([
      {
        artifactId: ids.sourceArtifactId,
        contentHash: sourceHash,
        locator,
      },
    ]);
  });

  it.each([
    [
      "role/stage",
      command(),
      binding({ logicalArtifactId: "memo:company" }),
      "rejected",
    ],
    [
      "cross-snapshot citation",
      command(),
      binding({
        citableArtifacts: [
          {
            ...citableArtifact(),
            snapshotId: SnapshotIdSchema.parse(id(21)),
          },
        ],
      }),
      "rejected",
    ],
    [
      "unknown locator",
      command(),
      binding({
        citableArtifacts: [
          { ...citableArtifact(), locator: { kind: "invented" } },
        ],
      }),
      "rejected",
    ],
  ])(
    "rejects %s without a public event",
    async (_name, input, stored, expectedKind) => {
      // Given
      const store = new MemoryCommitStore();
      store.current = stored;

      // When
      const result = await commitAgentOutput(
        { cas: new StrictArtifactCasFake(), store },
        input,
      );

      // Then
      expect(result.kind).toBe(expectedKind);
      expect(store.events).toEqual([]);
      expect(store.accepted).toEqual([]);
    },
  );

  it("accepts an explicitly bound parent-run citation from the same snapshot", async () => {
    const parentRunId = RunIdSchema.parse(id(20));
    const cas = new StrictArtifactCasFake();
    await cas.put({
      artifactId: ids.sourceArtifactId,
      runId: parentRunId,
      snapshotId: ids.snapshotId,
      mediaType: "application/json",
      parentDigests: [],
      bytes: sourceBytes,
    });
    const store = new MemoryCommitStore();
    store.current = binding({
      citableArtifacts: [{ ...citableArtifact(), runId: parentRunId }],
    });

    const result = await commitAgentOutput({ cas, store }, command());

    expect(result).toMatchObject({ kind: "committed" });
  });

  it("rejects legacy Terra provenance after the Luna migration", async () => {
    const store = new MemoryCommitStore();
    store.current = binding({
      logicalArtifactId: "memo:valuation",
      runnerModel: "gpt-5.6-terra",
      runnerReasoning: "medium",
    });

    const result = await commitAgentOutput(
      { cas: await casWithSource(), store },
      command(),
    );

    expect(result).toEqual({ kind: "rejected" });
    expect(store.accepted).toEqual([]);
  });

  it.each([
    ["model", { ...binding(), runnerModel: "gpt-5.6-sol" }],
    ["reasoning", { ...binding(), runnerReasoning: "high" }],
    ["browsing policy", { ...binding(), runnerBrowsingPolicy: "enabled" }],
  ] as const)(
    "rejects forged %s launch provenance before publication",
    async (_field, forgedBinding) => {
      // Given
      const store = new MemoryCommitStore();
      store.current = forgedBinding;

      // When
      const result = await commitAgentOutput(
        { cas: await casWithSource(), store },
        command(),
      );

      // Then
      expect(result).toEqual({ kind: "rejected" });
      expect(store.accepted).toEqual([]);
      expect(store.events).toEqual([]);
    },
  );

  it("rejects a stale ordinal, fence, attempt, or durable input binding", async () => {
    // Given
    const cases: readonly AgentOutputCommitBinding[] = [
      binding({ ordinal: 2 }),
      binding({ attemptId: AttemptIdSchema.parse(id(30)) }),
      binding({ currentFence: { ownerId: "worker-b", token: 5 } }),
      binding({ inputHash: hash("9") }),
    ];

    // When
    const results = await Promise.all(
      cases.map(async (current) => {
        const store = new MemoryCommitStore();
        store.current = current;
        return await commitAgentOutput(
          { cas: new StrictArtifactCasFake(), store },
          command(),
        );
      }),
    );

    // Then
    expect(results.every((result) => result.kind === "rejected")).toBe(true);
  });

  it("ignores caller-forged provenance and uses trusted launch evidence", async () => {
    // Given
    const store = new MemoryCommitStore();
    const forged = {
      ...command(),
      workerProvenance: {
        ...command().workerProvenance,
        cliBinaryHash: hash("9"),
        promptHash: hash("9"),
        schemaHash: hash("9"),
        inputManifestHash: hash("9"),
      },
    } as const;

    // When
    const result = await commitAgentOutput(
      { cas: await casWithSource(), store },
      forged,
    );

    // Then
    expect(result.kind).toBe("committed");
    expect(store.accepted[0]?.envelope).toMatchObject({
      cliBinaryHash: trustedBinaryHash,
      promptHash: hash("d"),
      schemaHash: hash("e"),
      inputManifestHash: hash("f"),
    });
  });

  it("rejects a manifest hash that is not durably bound to the launch", async () => {
    // Given
    const store = new MemoryCommitStore();
    store.current = binding({ attemptInputManifestHash: hash("9") });

    // When
    const result = await commitAgentOutput(
      { cas: await casWithSource(), store },
      command(),
    );

    // Then
    expect(result).toEqual({ kind: "rejected" });
    expect(store.accepted).toEqual([]);
    expect(store.events).toEqual([]);
  });

  it.each(["missing", "tampered"] as const)(
    "rejects a %s cited CAS parent without committing",
    async (failure) => {
      // Given
      const store = new MemoryCommitStore();
      const honest = await casWithSource();
      const cas: ArtifactCasPort =
        failure === "missing"
          ? new StrictArtifactCasFake()
          : {
              put: async (artifact) => await honest.put(artifact),
              has: async (digest) => await honest.has(digest),
              get: async (digest) => {
                const read = await honest.get(digest);
                return read === undefined
                  ? undefined
                  : {
                      descriptor: read.descriptor,
                      bytes: new TextEncoder().encode("tampered bytes"),
                    };
              },
            };

      // When
      const result = await commitAgentOutput({ cas, store }, command());

      // Then
      expect(result).toEqual({ kind: "rejected" });
      expect(store.accepted).toEqual([]);
      expect(store.events).toEqual([]);
    },
  );

  it("burns malformed required output and reserves one replacement with a new ordinal", async () => {
    // Given
    const store = new MemoryCommitStore();

    // When
    const result = await commitAgentOutput(
      { cas: new StrictArtifactCasFake(), store },
      command({ ...candidate, claimedRole: "chair" }),
    );

    // Then
    expect(result).toEqual({ kind: "replacement_reserved", ordinal: 2 });
    expect(store.rejected).toHaveLength(1);
    expect(store.rejected[0]).toMatchObject({
      attemptId: ids.attemptId,
      burnedOrdinal: 1,
      replacementAttemptId: ids.replacementAttemptId,
    });
    expect(store.events).toEqual([]);
  });

  it("commits CAS metadata, edges, fenced states, and one event in real PostgreSQL", async () => {
    // Given
    const temporary = await createResearchTestDatabase();
    const database = temporary.pool;
    const store = await openPostgresStore(database);
    await store.createRun({
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      requestedAt: "2026-07-23T00:00:00.000Z",
      initialJob: {
        jobId: ids.jobId,
        kind: "research",
        logicalKey: "memo:market",
        inputHash: hash("a"),
        inputManifestHash: hash("f"),
        createdAt: "2026-07-23T00:00:00.000Z",
      },
      initialEvent: {
        eventId: EventIdSchema.parse(id(40)),
        type: "run_queued",
        stateId: "queued",
        occurredAt: "2026-07-23T00:00:00.000Z",
      },
    });
    await store.saveArtifactMetadata({
      artifactId: ids.sourceArtifactId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      contentHash: sourceHash,
      byteLength: 12,
      mediaType: "application/json",
      logicalKey: "evidence:filing",
      inputHash: hash("1"),
      createdAt: "2026-07-23T00:00:00.000Z",
      locator,
    });
    const citationBindingStore = new PostgresAgentOutputCommitStore(database);
    await citationBindingStore.bindJobInputArtifact({
      jobId: ids.jobId,
      artifactId: ids.sourceArtifactId,
    });
    await citationBindingStore.close();
    await store.close();
    const engine = new PostgresLeaseEngineStore(database);
    expect(
      await engine.activateNextRun(id(42), "2026-07-23T00:00:01.000Z"),
    ).toBe(true);
    const claim = await engine.claim(
      "worker-a",
      "2026-07-23T00:00:01.000Z",
      "2026-07-23T00:01:00.000Z",
    );
    if (claim === undefined) throw new RangeError("fixture lease missing");
    const reservation = await engine.reserve({
      claim,
      attemptId: ids.attemptId,
      eventId: id(41),
      now: "2026-07-23T00:00:02.000Z",
    });
    expect(reservation).toEqual({ kind: "reserved", ordinal: 1 });
    await engine.close();
    const commitStore = new PostgresAgentOutputCommitStore(database);
    expect(
      await commitStore.recordRunnerEvidence({
        runId: ids.runId,
        jobId: ids.jobId,
        attemptId: ids.attemptId,
        ordinal: 1,
        ownerId: "worker-a",
        token: claim.leaseToken,
        now: "2026-07-23T00:00:02.500Z",
        stage: "memo",
        promptHash: hash("d"),
        schemaHash: hash("e"),
        inputHash: hash("a"),
        binaryHash: trustedBinaryHash,
        cliVersion: trustedCliVersion,
        model: "gpt-5.6-luna",
        reasoning: "low",
        browsingPolicy: "audited_web",
        toolTranscriptHash:
          "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
      }),
    ).toBe(true);
    const verificationStore = await openPostgresStore(database);
    const postgresCommand = {
      ...command(),
      claim: {
        key: command().claim.key,
        fence: { ownerId: "worker-a", token: claim.leaseToken },
      },
      occurredAt: "2026-07-23T00:00:03.000Z",
    } as const;

    try {
      // When
      const cas = await casWithSource();
      const result = await commitAgentOutput(
        { cas, store: commitStore },
        postgresCommand,
      );
      const replay = await commitAgentOutput(
        { cas, store: commitStore },
        postgresCommand,
      );

      // Then
      expect(result).toEqual({ kind: "committed", sequence: 4 });
      expect(replay).toEqual({ kind: "duplicate" });
      expect(await verificationStore.findAttempt(ids.attemptId)).toMatchObject({
        status: "succeeded",
        outcome: "accepted",
        ordinal: 1,
      });
      const publicCommit = (
        await verificationStore.eventsAfter(ids.runId, 0)
      ).find((event) => event.type === "specialist_memo_committed");
      expect(publicCommit?.payload).toEqual({
        schemaVersion: "workflow-v1",
        artifactId: ids.artifactId,
        logicalArtifactId: "memo:market",
        actorId: "market",
        participantIds: ["market"],
        stage: "memo",
        summary: {
          en: "Supported finding.",
          ko: "근거가 있는 결론입니다.",
        },
        claimIds: [id(10)],
        sourceIds: [ids.sourceArtifactId],
        limitationIds: [],
      });
      expect(JSON.stringify(publicCommit?.payload)).not.toMatch(
        /prompt|reasoning|stderr|token/i,
      );
      const provenanceDatabase = database;
      expect(
        (
          await provenanceDatabase.query(
            `SELECT model, reasoning, browsing_policy, tool_transcript_hash
              FROM agent_runner_evidence WHERE attempt_id = $1`,
            [ids.attemptId],
          )
        ).rows[0],
      ).toEqual({
        model: "gpt-5.6-luna",
        reasoning: "low",
        browsing_policy: "audited_web",
        tool_transcript_hash:
          "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
      });
    } finally {
      await commitStore.close();
      await verificationStore.close();
      await temporary.close();
    }
  });

  it("rejects a durable PostgreSQL manifest mismatch without mutating workflow state", async () => {
    // Given
    const fixture = await createPostgresCommitFixture(
      "stocksembly-agent-manifest-mismatch-",
      60,
    );
    const database = fixture.database;
    await database.query(
      "UPDATE attempts SET input_manifest_hash = $1 WHERE attempt_id = $2",
      [hash("9"), ids.attemptId],
    );

    try {
      // When
      const result = await commitAgentOutput(
        { cas: await casWithSource(), store: fixture.commitStore },
        fixture.postgresCommand,
      );

      // Then
      expect(result).toEqual({ kind: "rejected" });
      expect(
        (
          await database.query(
            `SELECT attempts.status AS attempt_status, attempts.outcome,
            jobs.status AS job_status, jobs.result_artifact_id
            FROM attempts JOIN jobs USING (job_id)
            WHERE attempts.attempt_id = $1`,
            [ids.attemptId],
          )
        ).rows[0],
      ).toEqual({
        attempt_status: "running",
        outcome: null,
        job_status: "running",
        result_artifact_id: null,
      });
      expect(
        (
          await database.query(
            "SELECT COUNT(*)::integer AS count FROM artifacts WHERE artifact_id = $1",
            [ids.artifactId],
          )
        ).rows[0],
      ).toEqual({ count: 0 });
      expect(
        (
          await database.query(
            "SELECT COUNT(*)::integer AS count FROM run_events WHERE event_type = $1",
            ["specialist_memo_committed"],
          )
        ).rows[0],
      ).toEqual({ count: 0 });
    } finally {
      await fixture.commitStore.close();
      await fixture.close();
    }
  });

  it("rejects stale PostgreSQL launch evidence without policy provenance", async () => {
    // Given
    const fixture = await createPostgresCommitFixture(
      "stocksembly-agent-stale-provenance-",
      65,
    );
    const database = fixture.database;
    await database.query(
      "UPDATE agent_runner_evidence SET model = NULL WHERE attempt_id = $1",
      [ids.attemptId],
    );

    try {
      // When
      const result = await commitAgentOutput(
        { cas: await casWithSource(), store: fixture.commitStore },
        fixture.postgresCommand,
      );

      // Then
      expect(result).toEqual({ kind: "rejected" });
      expect(
        (
          await database.query(
            "SELECT COUNT(*)::integer AS count FROM agent_output_commits WHERE attempt_id = $1",
            [ids.attemptId],
          )
        ).rows[0],
      ).toEqual({ count: 0 });
    } finally {
      await fixture.commitStore.close();
      await fixture.close();
    }
  });

  it("rolls back every PostgreSQL commit mutation when the final event insert fails", async () => {
    // Given
    const fixture = await createPostgresCommitFixture(
      "stocksembly-agent-transaction-rollback-",
      70,
    );
    const database = fixture.database;
    const duplicateEventCommand = {
      ...fixture.postgresCommand,
      eventId: EventIdSchema.parse(id(70)),
    } as const;

    try {
      // When / Then
      await expect(
        commitAgentOutput(
          { cas: await casWithSource(), store: fixture.commitStore },
          duplicateEventCommand,
        ),
      ).rejects.toThrow(/duplicate key/);
      expect(
        (
          await database.query(
            `SELECT attempts.status AS attempt_status, attempts.outcome,
            jobs.status AS job_status, jobs.result_artifact_id
            FROM attempts JOIN jobs USING (job_id)
            WHERE attempts.attempt_id = $1`,
            [ids.attemptId],
          )
        ).rows[0],
      ).toEqual({
        attempt_status: "running",
        outcome: null,
        job_status: "running",
        result_artifact_id: null,
      });
      for (const table of [
        "artifacts",
        "artifact_edges",
        "agent_output_commits",
      ] as const) {
        const where =
          table === "artifacts"
            ? "artifact_id"
            : table === "artifact_edges"
              ? "child_artifact_id"
              : "artifact_id";
        expect(
          (
            await database.query(
              `SELECT COUNT(*)::integer AS count FROM ${table} WHERE ${where} = $1`,
              [ids.artifactId],
            )
          ).rows[0],
        ).toEqual({ count: 0 });
      }
      expect(
        (
          await database.query(
            "SELECT COUNT(*)::integer AS count FROM run_events WHERE event_type = $1",
            ["specialist_memo_committed"],
          )
        ).rows[0],
      ).toEqual({ count: 0 });
    } finally {
      await fixture.commitStore.close();
      await fixture.close();
    }
  });

  it("persists a malformed ordinal burn and one event-free replacement", async () => {
    // Given
    const temporary = await createResearchTestDatabase();
    const database = temporary.pool;
    const store = await openPostgresStore(database);
    await store.createRun({
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      requestedAt: "2026-07-23T00:00:00.000Z",
      initialJob: {
        jobId: ids.jobId,
        kind: "research",
        logicalKey: "memo:market",
        inputHash: hash("a"),
        inputManifestHash: hash("f"),
        createdAt: "2026-07-23T00:00:00.000Z",
      },
      initialEvent: {
        eventId: EventIdSchema.parse(id(50)),
        type: "run_queued",
        stateId: "queued",
        occurredAt: "2026-07-23T00:00:00.000Z",
      },
    });
    await store.close();
    const engine = new PostgresLeaseEngineStore(database);
    await engine.activateNextRun(id(51), "2026-07-23T00:00:01.000Z");
    const claim = await engine.claim(
      "worker-a",
      "2026-07-23T00:00:01.000Z",
      "2026-07-23T00:01:00.000Z",
    );
    if (claim === undefined) throw new RangeError("fixture lease missing");
    await engine.reserve({
      claim,
      attemptId: ids.attemptId,
      eventId: id(52),
      now: "2026-07-23T00:00:02.000Z",
    });
    await engine.close();
    const commitStore = new PostgresAgentOutputCommitStore(database);
    expect(
      await commitStore.recordRunnerEvidence({
        runId: ids.runId,
        jobId: ids.jobId,
        attemptId: ids.attemptId,
        ordinal: 1,
        ownerId: "worker-a",
        token: claim.leaseToken,
        now: "2026-07-23T00:00:02.500Z",
        stage: "memo",
        promptHash: hash("d"),
        schemaHash: hash("e"),
        inputHash: hash("a"),
        binaryHash: trustedBinaryHash,
        cliVersion: trustedCliVersion,
        model: "gpt-5.6-luna",
        reasoning: "low",
        browsingPolicy: "audited_web",
        toolTranscriptHash:
          "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
      }),
    ).toBe(true);
    const verificationStore = await openPostgresStore(database);
    const malformedCommand = {
      ...command({ ...candidate, claimedRole: "chair" }),
      claim: {
        key: command().claim.key,
        fence: { ownerId: "worker-a", token: claim.leaseToken },
      },
      occurredAt: "2026-07-23T00:00:03.000Z",
    } as const;

    try {
      // When
      const result = await commitAgentOutput(
        { cas: new StrictArtifactCasFake(), store: commitStore },
        malformedCommand,
      );

      // Then
      expect(result).toEqual({ kind: "replacement_reserved", ordinal: 2 });
      expect(await verificationStore.researchOrdinals(ids.runId)).toEqual([
        1, 2,
      ]);
      expect(await verificationStore.findAttempt(ids.attemptId)).toMatchObject({
        status: "failed",
        outcome: "failed",
        ordinal: 1,
      });
      expect(await verificationStore.eventsAfter(ids.runId, 3)).toEqual([]);
    } finally {
      await commitStore.close();
      await verificationStore.close();
      await temporary.close();
    }
  });
});
