import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { normalizeEditorialText } from "../../../domain/editorialQuality";
import {
  ArtifactIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { parseStoredResearchReportVersioned } from "../../../domain/reportStorage";
import { ArtifactDigestSchema } from "../../../ports/artifacts";
import { createSqliteDepartmentRound } from "../../../workflow/departmentRound";
import { stageAcceptedSpecialists } from "../../../workflow/departmentRound.testSupport";
import {
  parseDepartmentMarketSnapshot,
  publishDepartmentReportForRun,
} from "./publishDepartmentReportForRun";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

const departmentPeerArtifactIds = {
  market: "90000000-0000-4000-8000-000000000001",
  company: "90000000-0000-4000-8000-000000000002",
  financial: "90000000-0000-4000-8000-000000000003",
  risk: "90000000-0000-4000-8000-000000000004",
} as const;

async function addDepartmentRequestAndPeers(
  prepared: Awaited<ReturnType<typeof stageAcceptedSpecialists>>,
  departmentId: keyof typeof departmentPeerArtifactIds,
) {
  const runId = RunIdSchema.parse(prepared.harness.input.mandate.runId);
  const snapshotId = SnapshotIdSchema.parse(prepared.replay.snapshotId);
  const artifactId = ArtifactIdSchema.parse(
    departmentPeerArtifactIds[departmentId],
  );
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      providerUpdatedAt: "2026-07-30T00:00:00.000Z",
      sector: "Accelerated Computing",
      subject: {
        symbol: "NASDAQ:SUBJ",
        name: "Subject",
        sector: "Accelerated Computing",
        primaryProductMarket: "accelerated computing",
        primaryCustomerMarket: "data center operators",
        priceEarningsTtm: 40,
        revenueGrowthTtm: 30,
        operatingMarginTtm: 25,
      },
      relativeValuation: [],
      peers: [20, 30, 25].map((priceEarningsTtm, index) => ({
        symbol: `NASDAQ:PEER${index + 1}`,
        name: `Peer ${index + 1}`,
        sector: "Accelerated Computing",
        primaryProductMarket: "accelerated computing",
        primaryCustomerMarket: "data center operators",
        classification: "direct_competitor",
        selectionReasons: ["same product and customer market"],
        priceEarningsTtm,
        revenueGrowthTtm: 20,
        operatingMarginTtm: 18,
      })),
    }),
  );
  const descriptor = await prepared.options.cas.put({
    artifactId,
    runId,
    snapshotId,
    mediaType: "application/json",
    parentDigests: [],
    bytes,
  });
  const database = new Database(prepared.options.databasePath);
  database
    .prepare(
      "INSERT INTO artifacts(artifact_id, run_id, snapshot_id, content_hash, byte_length, media_type, logical_key, input_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, 'evidence:insightsentry:peers', ?, ?)",
    )
    .run(
      descriptor.artifactId,
      runId,
      snapshotId,
      descriptor.digest,
      descriptor.byteLength,
      descriptor.mediaType,
      descriptor.digest,
      "2026-07-23T00:00:00.000Z",
    );
  database
    .prepare(
      "INSERT INTO research_requests(run_id, principal_id, symbol, question, locale, request_hash, created_at, research_kind, department_id) VALUES (?, ?, 'TSLA', 'Evaluate department evidence', 'en', ?, ?, 'department', ?)",
    )
    .run(
      runId,
      "a".repeat(64),
      "b".repeat(64),
      "2026-07-23T00:00:00.000Z",
      departmentId,
    );
  database.close();
  return descriptor.artifactId;
}

it("restores the observed price from sealed department quote evidence", () => {
  const snapshot = parseDepartmentMarketSnapshot(
    {
      kind: "licensed_provider",
      source: "insightsentry_rapidapi",
      dataset: "insightsentry_quote",
    },
    JSON.stringify({
      providerCode: "NASDAQ:TSLA",
      marketState: "PRE",
      observedAt: "2026-07-30T10:34:51.000Z",
      lastPrice: 302.75,
      currency: "USD",
    }),
  );

  expect(snapshot).toEqual({
    providerCode: "NASDAQ:TSLA",
    marketState: "PRE",
    observedAt: "2026-07-30T10:34:51.000Z",
    lastPrice: 302.75,
    currency: "USD",
  });
});

it("publishes accepted/revised/removed adjudication without resurrecting removed claims", async () => {
  const root = mkdtempSync(join(tmpdir(), "department-publication-"));
  roots.push(root);
  const prepared = await stageAcceptedSpecialists(root, "adjudication");
  const round = createSqliteDepartmentRound(prepared.options);
  const runId = prepared.harness.input.mandate.runId;
  await round.stage({
    runId: RunIdSchema.parse(runId),
    memberArtifactIds: round
      .acceptedMemos(runId)
      .map((memo) => memo.artifactId),
  });
  const replay = await round.drain(runId);
  await round.close();
  expect(replay.committedDepartmentIds).toContain("market");

  const database = new Database(prepared.options.databasePath);
  database
    .prepare(
      "INSERT INTO research_requests(run_id, principal_id, symbol, question, locale, request_hash, created_at, research_kind, department_id) VALUES (?, ?, 'TSLA', 'Evaluate market evidence', 'en', ?, ?, 'department', 'market')",
    )
    .run(runId, "a".repeat(64), "b".repeat(64), "2026-07-23T00:00:00.000Z");
  const publicationRow = database
    .prepare(
      "SELECT runs.snapshot_id, runs.status, runs.version, runs.report_id, research_requests.symbol, research_requests.question, research_requests.locale, research_requests.research_kind, research_requests.department_id FROM runs JOIN research_requests USING(run_id) WHERE runs.run_id = ?",
    )
    .get(runId);
  database.close();
  expect(publicationRow).toMatchObject({
    status: "running",
    report_id: null,
    research_kind: "department",
    department_id: "market",
  });

  const result = await publishDepartmentReportForRun(
    { databasePath: prepared.options.databasePath, cas: prepared.options.cas },
    runId,
  );
  if (result.kind === "incomplete") throw new Error(result.reason);
  expect(result).toMatchObject({ kind: "published" });
  const stored = await prepared.options.cas.get(
    ArtifactDigestSchema.parse(result.digest),
  );
  expect(stored).toBeDefined();
  const raw = new TextDecoder().decode(stored?.bytes);
  const report = parseStoredResearchReportVersioned(JSON.parse(raw));
  expect(report.schemaVersion).toBe("workflow-v2");
  if (report.schemaVersion !== "workflow-v2")
    throw new TypeError("missing v2 report");
  expect(report.anticipatedQuestions.length).toBeGreaterThan(0);
  expect(report.anticipatedQuestions.length).toBeLessThanOrEqual(10);
  const persistedDatabase = new Database(prepared.options.databasePath, {
    readonly: true,
  });
  const persistedPayload = JSON.parse(
    (
      persistedDatabase
        .prepare("SELECT public_payload_json AS payload FROM report_versions")
        .get() as { payload: string }
    ).payload,
  );
  persistedDatabase.close();
  expect(persistedPayload).toMatchObject({
    schemaVersion: "workflow-v2",
    editorialPublication: {
      qaPolicy: {
        moduleMinimum: 5,
        supportedCount: report.anticipatedQuestions.length,
      },
      candidate: { confidence: report.editorialDecision.confidence },
    },
  });
  const marketInput = prepared.codex.departmentInputs.find(
    (input) => input.department.id === "market",
  )!;
  const inputPositions = marketInput.memberArtifacts.flatMap(
    (member) => member.memo.positions,
  );
  const removed = inputPositions[2]!;
  const accepted = inputPositions[0]!;
  const revised = inputPositions[1]!;

  const adjudicatedClaimId = report.claims[1]?.claimId;
  expect(adjudicatedClaimId).toBeDefined();
  expect(adjudicatedClaimId).not.toBe(revised.claimId);
  expect(report.claims.map((claim) => claim.claimId)).toEqual([
    accepted.claimId,
    adjudicatedClaimId,
  ]);
  expect(report.versionDelta.removedClaimIds).toEqual([
    removed.claimId,
    revised.claimId,
  ]);
  expect(report.claims[1]).toMatchObject({
    claimId: adjudicatedClaimId,
    originClaimId: revised.claimId,
    disposition: "revised",
    semanticVerdict: "partial",
    sourceIds: revised.evidenceArtifactIds,
  });
  expect(report.claims.every((claim) => claim.checkpoint !== undefined)).toBe(
    true,
  );
  expect(new Set(report.claims.map((claim) => claim.checkpoint?.en)).size).toBe(
    report.claims.length,
  );
  expect(report.teamViews[0]?.position).not.toEqual(
    report.teamViews[0]?.rationale,
  );
  expect(
    report.locales.en.unknowns.every(
      (item) => item.impact !== item.nextEvidence,
    ),
  ).toBe(true);
  expect(JSON.stringify(report.locales)).not.toContain(
    removed.publicSummary.en,
  );
  expect(
    report.locales.en.sections.every(
      (section) => !section.claimIds.includes(removed.claimId),
    ),
  ).toBe(true);
  expect(
    report.locales.en.sections.every(
      (section) => !section.claimIds.includes(revised.claimId),
    ),
  ).toBe(true);
});

it.each(["market", "company", "financial", "risk"] as const)(
  "publishes %s adjudication through real SQLite/CAS with comparator lineage",
  async (departmentId) => {
    const root = mkdtempSync(
      join(tmpdir(), `department-publication-${departmentId}-`),
    );
    roots.push(root);
    const prepared = await stageAcceptedSpecialists(
      root,
      "adjudication_all_departments",
    );
    const round = createSqliteDepartmentRound(prepared.options);
    const runId = prepared.harness.input.mandate.runId;
    await round.stage({
      runId: RunIdSchema.parse(runId),
      memberArtifactIds: round
        .acceptedMemos(runId)
        .map((memo) => memo.artifactId),
    });
    const replay = await round.drain(runId);
    await round.close();
    expect(replay.committedDepartmentIds).toContain(departmentId);
    const peerArtifactId = await addDepartmentRequestAndPeers(
      prepared,
      departmentId,
    );

    const result = await publishDepartmentReportForRun(
      {
        databasePath: prepared.options.databasePath,
        cas: prepared.options.cas,
      },
      runId,
    );
    if (result.kind === "incomplete") throw new Error(result.reason);
    const stored = await prepared.options.cas.get(
      ArtifactDigestSchema.parse(result.digest),
    );
    expect(stored).toBeDefined();
    const report = parseStoredResearchReportVersioned(
      JSON.parse(new TextDecoder().decode(stored?.bytes)),
    );
    const departmentInput = prepared.codex.departmentInputs.find(
      (input) => input.department.id === departmentId,
    )!;
    const inputPositions = departmentInput.memberArtifacts.flatMap(
      (member) => member.memo.positions,
    );
    const acceptedOrigin = inputPositions[0]!.claimId;
    const revisedOrigin = inputPositions[1]!.claimId;
    const removedOrigins = inputPositions.slice(2).map((item) => item.claimId);
    const revisedClaim = report.claims.find(
      (claim) => claim.disposition === "revised",
    );
    const ownersByOriginClaim = new Map(
      inputPositions.map((position) => [position.claimId, position.roleOwner]),
    );
    const registeredDepartmentOwners = new Set<string>(
      departmentInput.memberArtifacts.map((member) => member.ownership.roleId),
    );

    expect(report.researchTarget).toEqual({
      kind: "department",
      departmentId,
    });
    expect(report.editorialClaims).not.toHaveLength(0);
    for (const claim of report.editorialClaims ?? []) {
      const registeredClaim = report.claims.find(
        (candidate) => candidate.claimId === claim.claimId,
      );
      const originClaimId = registeredClaim?.originClaimId ?? claim.claimId;
      expect(claim.roleOwner).toBe(ownersByOriginClaim.get(originClaimId));
      expect(registeredDepartmentOwners.has(claim.roleOwner)).toBe(true);
      expect(claim.roleOwner).not.toBe("research_committee");
      expect(claim.roleOwner).not.toBe(`${departmentId}_team`);
    }
    expect(report.claims[0]?.claimId).toBe(acceptedOrigin);
    expect(revisedClaim).toMatchObject({
      originClaimId: revisedOrigin,
      disposition: "revised",
      semanticVerdict: "partial",
    });
    expect(revisedClaim?.claimId).not.toBe(revisedOrigin);
    expect(report.versionDelta.removedClaimIds).toEqual([
      ...removedOrigins,
      revisedOrigin,
    ]);
    expect(report.claims.some((claim) => claim.claimId === revisedOrigin)).toBe(
      false,
    );
    expect(
      report.locales.en.sections.every(
        (section) => !section.claimIds.includes(revisedOrigin),
      ),
    ).toBe(true);
    expect(normalizeEditorialText(report.teamViews[0]!.position.en)).not.toBe(
      normalizeEditorialText(report.teamViews[0]!.rationale.en),
    );
    expect(
      report.locales.en.unknowns.every(
        (unknown) =>
          normalizeEditorialText(unknown.impact) !==
          normalizeEditorialText(unknown.nextEvidence),
      ),
    ).toBe(true);
    expect(
      new Set(
        report.claims.map((claim) =>
          normalizeEditorialText(claim.checkpoint?.en ?? ""),
        ),
      ).size,
    ).toBe(report.claims.length);
    expect(report.metricSnapshot?.comparatorQualification).toMatchObject({
      status: "qualified",
      rawPeerArtifactId: peerArtifactId,
    });
  },
);

it("publishes a revised strongest claim through its origin disposition", async () => {
  const root = mkdtempSync(join(tmpdir(), "department-revised-strongest-"));
  roots.push(root);
  const prepared = await stageAcceptedSpecialists(
    root,
    "adjudication_revised_strongest",
  );
  const round = createSqliteDepartmentRound(prepared.options);
  const runId = prepared.harness.input.mandate.runId;
  await round.stage({
    runId: RunIdSchema.parse(runId),
    memberArtifactIds: round
      .acceptedMemos(runId)
      .map((memo) => memo.artifactId),
  });
  await round.drain(runId);
  await round.close();
  await addDepartmentRequestAndPeers(prepared, "market");

  const result = await publishDepartmentReportForRun(
    { databasePath: prepared.options.databasePath, cas: prepared.options.cas },
    runId,
  );
  expect(result.kind).toBe("published");
  if (result.kind !== "published") return;
  const stored = await prepared.options.cas.get(
    ArtifactDigestSchema.parse(result.digest),
  );
  expect(stored).toBeDefined();
  const report = parseStoredResearchReportVersioned(
    JSON.parse(new TextDecoder().decode(stored?.bytes)),
  );
  const input = prepared.codex.departmentInputs.find(
    (candidate) => candidate.department.id === "market",
  )!;
  const positions = input.memberArtifacts.flatMap(
    (member) => member.memo.positions,
  );
  const revisedOrigin = positions[1]!.claimId;
  const removedOrigin = positions[2]!.claimId;
  const strongest = report.claims.find(
    (claim) => claim.materiality === "material",
  );

  expect(strongest).toMatchObject({
    disposition: "revised",
    originClaimId: revisedOrigin,
    semanticVerdict: "partial",
  });
  expect(strongest?.claimId).not.toBe(revisedOrigin);
  expect(report.teamViews[0]?.position).not.toEqual(
    report.teamViews[0]?.rationale,
  );
  expect(report.claims.some((claim) => claim.claimId === removedOrigin)).toBe(
    false,
  );
  expect(
    report.locales.en.sections.every(
      (section) => !section.claimIds.includes(removedOrigin),
    ),
  ).toBe(true);
});

it("fails closed when the lead position is reused as its rationale", async () => {
  const root = mkdtempSync(join(tmpdir(), "department-publication-invalid-"));
  roots.push(root);
  const prepared = await stageAcceptedSpecialists(
    root,
    "position_rationale_same",
  );
  const round = createSqliteDepartmentRound(prepared.options);
  const runId = prepared.harness.input.mandate.runId;
  await round.stage({
    runId: RunIdSchema.parse(runId),
    memberArtifactIds: round
      .acceptedMemos(runId)
      .map((memo) => memo.artifactId),
  });
  await round.drain(runId);
  await round.close();
  const database = new Database(prepared.options.databasePath);
  database
    .prepare(
      "INSERT INTO research_requests(run_id, principal_id, symbol, question, locale, request_hash, created_at, research_kind, department_id) VALUES (?, ?, 'TSLA', 'Evaluate market evidence', 'en', ?, ?, 'department', 'market')",
    )
    .run(runId, "a".repeat(64), "b".repeat(64), "2026-07-23T00:00:00.000Z");
  database.close();

  await expect(
    publishDepartmentReportForRun(
      {
        databasePath: prepared.options.databasePath,
        cas: prepared.options.cas,
      },
      runId,
    ),
  ).resolves.toEqual({
    kind: "incomplete",
    reason: "department_report_inputs_invalid",
  });
});

it("fails closed when lead position and rationale normalize to the same text", async () => {
  const root = mkdtempSync(
    join(tmpdir(), "department-publication-normalized-"),
  );
  roots.push(root);
  const prepared = await stageAcceptedSpecialists(
    root,
    "position_rationale_normalized",
  );
  const round = createSqliteDepartmentRound(prepared.options);
  const runId = prepared.harness.input.mandate.runId;
  await round.stage({
    runId: RunIdSchema.parse(runId),
    memberArtifactIds: round
      .acceptedMemos(runId)
      .map((memo) => memo.artifactId),
  });
  await round.drain(runId);
  await round.close();
  const database = new Database(prepared.options.databasePath);
  database
    .prepare(
      "INSERT INTO research_requests(run_id, principal_id, symbol, question, locale, request_hash, created_at, research_kind, department_id) VALUES (?, ?, 'TSLA', 'Evaluate market evidence', 'en', ?, ?, 'department', 'market')",
    )
    .run(runId, "a".repeat(64), "b".repeat(64), "2026-07-23T00:00:00.000Z");
  database.close();

  await expect(
    publishDepartmentReportForRun(
      {
        databasePath: prepared.options.databasePath,
        cas: prepared.options.cas,
      },
      runId,
    ),
  ).resolves.toEqual({
    kind: "incomplete",
    reason: "department_report_inputs_invalid",
  });
});
