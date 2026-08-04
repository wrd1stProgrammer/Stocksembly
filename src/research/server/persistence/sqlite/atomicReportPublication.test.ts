import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AuthoritativeReportCommit } from "../../../application/assembleReportPersistence";
import { persistAuthoritativeReport } from "../../../application/assembleReportPersistence";
import { ANTICIPATED_QUESTIONS_POLICY } from "../../../workflow/anticipatedQuestionsPublication";
import { createSqliteChairSynthesis } from "../../../workflow/chairSynthesis";
import { createPreparedChairRound } from "../../../workflow/chairSynthesis.testSupport";
import {
  deterministicMetadataRewrite,
  gateWithOneTargetedRewrite,
  type PrePublicationEditorialEnvelope,
} from "../../../workflow/prePublicationEditorialGate";
import {
  type AtomicPublicationInput,
  publishReportAtomically,
} from "./atomicReportPublication";
import { loadReportAuthority } from "./authoritativeReportAuthority";

const AcceptedSchema = z.object({
  artifact_id: z.string().uuid(),
  owner_id: z.string(),
  fence_token: z.number().int().positive(),
  ordinal: z.number().int().positive(),
  job_id: z.string().uuid(),
  attempt_id: z.string().uuid(),
});

function publicationState(databasePath: string, runId: string) {
  const database = new Database(databasePath);
  const state = database
    .prepare(`SELECT status, report_id, version, last_event_seq,
    (SELECT COUNT(*) FROM reports) AS reports,
    (SELECT COUNT(*) FROM report_versions) AS report_versions,
    (SELECT COUNT(*) FROM artifacts WHERE logical_key LIKE 'report_version:%') AS report_artifacts,
    (SELECT COUNT(*) FROM artifact_edges JOIN artifacts
      ON child_artifact_id = artifact_id
      WHERE logical_key LIKE 'report_version:%') AS report_edges,
    (SELECT COUNT(*) FROM run_events WHERE event_type = 'report_published') AS report_events
    FROM runs WHERE run_id = ?`)
    .get(runId);
  database.close();
  return state;
}

async function prepareAtomicInput() {
  const prepared = await createPreparedChairRound("none");
  const chair = createSqliteChairSynthesis(prepared.options);
  await chair.stage({ runId: prepared.runId });
  await chair.drain(prepared.runId);
  await chair.close();
  const database = new Database(prepared.options.databasePath);
  const accepted = AcceptedSchema.parse(
    database
      .prepare(`SELECT agent_output_commits.artifact_id,
      agent_output_commits.owner_id, agent_output_commits.fence_token,
      agent_output_commits.ordinal, attempts.job_id, attempts.attempt_id
      FROM agent_output_commits JOIN attempts USING(attempt_id)
      WHERE attempts.run_id = ? AND attempts.logical_artifact_key = 'chair_synthesis:chair'`)
      .get(prepared.runId),
  );
  database.close();
  const request = {
    runId: prepared.runId,
    acceptedChairArtifactId: accepted.artifact_id,
    fence: {
      jobId: accepted.job_id,
      attemptId: accepted.attempt_id,
      ordinal: accepted.ordinal,
      ownerId: accepted.owner_id,
      token: accepted.fence_token,
    },
  };
  const authority = await loadReportAuthority(
    prepared.options.databasePath,
    prepared.options.cas,
    request,
  );
  if (authority === undefined) throw new TypeError("missing report authority");
  const commits: AuthoritativeReportCommit[] = [];
  await persistAuthoritativeReport(
    {
      cas: prepared.options.cas,
      persistence: {
        save(commit) {
          commits.push(commit);
          return 1;
        },
      },
    },
    authority,
  );
  const commit = commits[0];
  if (commit === undefined) throw new TypeError("missing report commit");
  return {
    prepared,
    input: {
      ...request,
      expectedRunVersion: authority.runVersion,
      eventId: "00000000-0000-4000-8000-000000009991",
      commit: structuredClone(commit),
    } satisfies AtomicPublicationInput,
  };
}

const faults = {
  cross_run_descriptor: (input: AtomicPublicationInput) =>
    Reflect.set(
      input.commit.descriptor,
      "runId",
      "00000000-0000-4000-8000-000000009992",
    ),
  wrong_version_run: (input: AtomicPublicationInput) =>
    Reflect.set(
      input.commit.version,
      "runId",
      "00000000-0000-4000-8000-000000009993",
    ),
  wrong_version_snapshot: (input: AtomicPublicationInput) =>
    Reflect.set(
      input.commit.version,
      "snapshotId",
      "00000000-0000-4000-8000-000000009994",
    ),
  wrong_version_artifact: (input: AtomicPublicationInput) =>
    Reflect.set(
      input.commit.version,
      "artifactId",
      "00000000-0000-4000-8000-000000009995",
    ),
  malformed_run_id: (input: AtomicPublicationInput) =>
    Reflect.set(input, "runId", "not-a-run-id"),
  malformed_descriptor_artifact: (input: AtomicPublicationInput) =>
    Reflect.set(input.commit.descriptor, "artifactId", "not-an-artifact-id"),
  malformed_version_id: (input: AtomicPublicationInput) =>
    Reflect.set(input.commit.version, "versionId", "not-a-version-id"),
} satisfies Record<string, (input: AtomicPublicationInput) => boolean>;

describe("publishReportAtomically identity boundary", () => {
  it("repairs one named duplicate, publishes once, and preserves confidence", async () => {
    const { prepared, input } = await prepareAtomicInput();
    const envelope = (
      input.commit.version.publicPayload as unknown as {
        editorialPublication: PrePublicationEditorialEnvelope;
      }
    ).editorialPublication;
    const firstSection = envelope.candidate.sections[0]!;
    const invalid = {
      ...envelope.candidate,
      sections: [
        ...envelope.candidate.sections,
        { ...firstSection, sectionKey: `${firstSection.sectionKey}_duplicate` },
      ],
    };
    let rewrites = 0;
    const gated = await gateWithOneTargetedRewrite(invalid, async (request) => {
      rewrites += 1;
      return deterministicMetadataRewrite(invalid, request);
    });
    expect(gated.kind, JSON.stringify(gated)).toBe("accepted");
    if (gated.kind !== "accepted") return;
    expect(rewrites).toBe(1);
    expect(gated.candidate.confidence).toBe(invalid.confidence);
    Reflect.set(input.commit.version, "publicPayload", {
      ...input.commit.version.publicPayload,
      schemaVersion: "workflow-v2",
      anticipatedQuestions: gated.candidate.anticipatedQuestions,
      editorialPublication: {
        ...envelope,
        candidate: gated.candidate,
        fieldLineage: gated.fieldLineage,
        qaPolicy: {
          ...envelope.qaPolicy,
          supportedCount: gated.candidate.anticipatedQuestions.length,
          moduleVisible:
            gated.candidate.anticipatedQuestions.length >=
            envelope.qaPolicy.moduleMinimum,
        },
      },
    });

    expect(publishReportAtomically(prepared.options.databasePath, input)).toBe(
      1,
    );
    expect(
      publicationState(prepared.options.databasePath, prepared.runId),
    ).toMatchObject({
      reports: 1,
      report_versions: 1,
      report_events: 1,
    });
    prepared.cleanup();
  }, 20_000);

  it("leaves zero rows when the sole rewrite adds an unsupported metric", async () => {
    const { prepared, input } = await prepareAtomicInput();
    const envelope = (
      input.commit.version.publicPayload as unknown as {
        editorialPublication: PrePublicationEditorialEnvelope;
      }
    ).editorialPublication;
    const invalid = {
      ...envelope.candidate,
      sections: [
        ...envelope.candidate.sections,
        {
          ...envelope.candidate.sections[0]!,
          sectionKey: "duplicate_for_failure",
        },
      ],
    };
    const gated = await gateWithOneTargetedRewrite(invalid, async (request) => {
      const repaired = deterministicMetadataRewrite(invalid, request);
      return {
        ...repaired,
        sections: repaired.sections.map((section, index) =>
          index === 0
            ? {
                ...section,
                text: {
                  ...section.text,
                  en: "Unsupported margin reached 99%.",
                },
              }
            : section,
        ),
      };
    });
    expect(gated).toMatchObject({
      kind: "rejected",
      reason: "editorial_quality_failed:unsupported_number",
    });
    expect(
      publicationState(prepared.options.databasePath, prepared.runId),
    ).toMatchObject({
      reports: 0,
      report_versions: 0,
      report_events: 0,
    });
    prepared.cleanup();
  }, 20_000);

  it("leaves zero rows when a named repair also mutates an unnamed sibling", async () => {
    const { prepared, input } = await prepareAtomicInput();
    const envelope = (
      input.commit.version.publicPayload as unknown as {
        editorialPublication: PrePublicationEditorialEnvelope;
      }
    ).editorialPublication;
    const original = envelope.candidate;
    const invalid = {
      ...original,
      sections: original.sections.map((section, index) =>
        index === 1
          ? {
              ...section,
              text: { ...section.text, en: original.sections[0]!.text.en },
            }
          : section,
      ),
    };
    const gated = await gateWithOneTargetedRewrite(invalid, async () => ({
      ...original,
      sections: original.sections.map((section, index) =>
        index === 0
          ? { ...section, sectionKey: "silently_changed_section" }
          : section,
      ),
    }));

    expect(gated).toMatchObject({
      kind: "rejected",
      reason: "editorial_quality_failed:rewrite_scope:sections[0].sectionKey",
    });
    expect(
      publicationState(prepared.options.databasePath, prepared.runId),
    ).toMatchObject({
      reports: 0,
      report_versions: 0,
      report_events: 0,
    });
    prepared.cleanup();
  }, 20_000);

  it("publishes one gated workflow-v2 row with persisted Q&A metadata", async () => {
    const { prepared, input } = await prepareAtomicInput();
    const claimA = "00000000-0000-4000-8000-000000000001";
    const claimB = "00000000-0000-4000-8000-000000000003";
    const evidenceA = "00000000-0000-4000-8000-000000000002";
    const evidenceB = "00000000-0000-4000-8000-000000000004";
    const anticipatedQuestions = [
      {
        questionId: "00000000-0000-4000-8000-000000000011",
        decisionKey: "dominant_growth",
        question: {
          en: "At the current price, which thesis dominates and why?",
          ko: "현재 가격에서는 어떤 논지가 우세하며, 그 이유는 무엇인가요?",
        },
        answer: {
          en: "Enterprise adoption is the decisive growth evidence.",
          ko: "기업 도입이 성장 판단의 결정적 근거입니다.",
        },
        primaryClaimIds: [claimA],
        evidenceArtifactIds: [evidenceA],
        rank: 1,
      },
      {
        questionId: "00000000-0000-4000-8000-000000000012",
        decisionKey: "valuation_reset",
        question: {
          en: "What would invalidate the valuation proxy?",
          ko: "무엇이 밸류에이션 대용 비교를 무효화하나요?",
        },
        answer: {
          en: "Period misalignment would invalidate the valuation proxy.",
          ko: "기간 불일치는 밸류에이션 대용 비교를 무효화합니다.",
        },
        primaryClaimIds: [claimB],
        evidenceArtifactIds: [evidenceB],
        rank: 2,
      },
    ];
    const candidate = {
      position: {
        en: "Demand evidence favors durable expansion.",
        ko: "수요 근거는 지속 가능한 확장 논지를 지지합니다.",
      },
      rationale: {
        en: "Cash conversion confirms operating discipline.",
        ko: "현금 전환은 운영 규율을 확인합니다.",
      },
      sections: [
        {
          sectionKey: "supported_analysis",
          text: {
            en: "Enterprise adoption broadened across customer cohorts.",
            ko: "기업 도입은 고객군 전반으로 확대됐습니다.",
          },
          claimIds: [claimA],
          checkpoint: {
            en: "Adoption remains broad.",
            ko: "도입 범위가 넓게 유지됩니다.",
          },
        },
        {
          sectionKey: "valuation_comparison",
          text: {
            en: "The proxy shares normalized revenue growth and margin periods.",
            ko: "해당 대용 기업은 정규화된 매출 성장과 마진 기간을 공유합니다.",
          },
          claimIds: [claimB],
          checkpoint: {
            en: "Period alignment remains valid.",
            ko: "기간 정렬이 유효하게 유지됩니다.",
          },
        },
      ],
      comparators: [
        {
          comparatorId: "peer",
          role: "valuation_proxy",
          rationale: {
            en: "The same period and normalized revenue metric are available.",
            ko: "동일 기간의 정규화된 매출 지표를 사용할 수 있습니다.",
          },
          comparableMetricKeys: ["revenue_growth"],
        },
      ],
      anticipatedQuestions,
      supportedNumbers: [],
      permittedClaimIds: [claimA, claimB],
      permittedEvidenceArtifactIds: [evidenceA, evidenceB],
      confidence: "medium",
    } as const;
    Reflect.set(input.commit.version, "publicPayload", {
      ...input.commit.version.publicPayload,
      schemaVersion: "workflow-v2",
      anticipatedQuestions,
      editorialPublication: {
        gateVersion: "editorial-quality-v1",
        qaPolicy: {
          ...ANTICIPATED_QUESTIONS_POLICY,
          supportedCount: anticipatedQuestions.length,
          moduleVisible: false,
        },
        candidate,
      },
    });

    expect(publishReportAtomically(prepared.options.databasePath, input)).toBe(
      1,
    );
    const database = new Database(prepared.options.databasePath, {
      readonly: true,
    });
    const rows = database
      .prepare("SELECT public_payload_json FROM report_versions")
      .all() as readonly { public_payload_json: string }[];
    database.close();
    expect(rows).toHaveLength(1);
    const persisted = JSON.parse(rows[0]!.public_payload_json);
    expect(persisted).toMatchObject({
      schemaVersion: "workflow-v2",
      editorialPublication: { candidate: { confidence: "medium" } },
    });
    expect(persisted.anticipatedQuestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ decisionKey: "dominant_growth", rank: 1 }),
      ]),
    );
    prepared.cleanup();
  }, 20_000);

  it("rejects workflow-v2 without a passed pre-publication artifact and leaves no row", async () => {
    const { prepared, input } = await prepareAtomicInput();
    Reflect.set(input.commit.version, "publicPayload", {
      ...input.commit.version.publicPayload,
      schemaVersion: "workflow-v2",
      anticipatedQuestions: [],
      editorialPublication: undefined,
    });
    const before = publicationState(
      prepared.options.databasePath,
      prepared.runId,
    );

    expect(() =>
      publishReportAtomically(prepared.options.databasePath, input),
    ).toThrow("editorial_quality_failed:missing_prepublication_artifact");
    expect(
      publicationState(prepared.options.databasePath, prepared.runId),
    ).toEqual(before);
    prepared.cleanup();
  }, 20_000);

  it.each(Object.entries(faults))(
    "rejects %s without durable publication mutation",
    async (_fault, mutate) => {
      const { prepared, input } = await prepareAtomicInput();
      const before = publicationState(
        prepared.options.databasePath,
        prepared.runId,
      );
      mutate(input);

      expect(() =>
        publishReportAtomically(prepared.options.databasePath, input),
      ).toThrow();
      expect(
        publicationState(prepared.options.databasePath, prepared.runId),
      ).toEqual(before);
      prepared.cleanup();
    },
    20_000,
  );

  it("rejects a cross-run parent artifact without durable publication mutation", async () => {
    const { prepared, input } = await prepareAtomicInput();
    const foreignRunId = "00000000-0000-4000-8000-000000009996";
    const foreignSnapshotId = "00000000-0000-4000-8000-000000009997";
    const foreignArtifactId = "00000000-0000-4000-8000-000000009998";
    const database = new Database(prepared.options.databasePath);
    database.pragma("foreign_keys = ON");
    database.transaction(() => {
      database
        .prepare(`INSERT INTO runs(run_id, snapshot_id, status, created_at)
        VALUES (?, ?, 'running', ?)`)
        .run(foreignRunId, foreignSnapshotId, "2026-07-23T00:00:00.000Z");
      database
        .prepare(`INSERT INTO snapshots(snapshot_id, run_id, state,
        requested_at, evidence_cutoff_at, sealed_at)
        VALUES (?, ?, 'sealed', ?, ?, ?)`)
        .run(
          foreignSnapshotId,
          foreignRunId,
          "2026-07-23T00:00:00.000Z",
          "2026-07-23T00:00:00.000Z",
          "2026-07-23T00:00:00.000Z",
        );
      database
        .prepare(`INSERT INTO artifacts(artifact_id, run_id, snapshot_id,
        content_hash, byte_length, media_type, logical_key, input_hash, created_at)
        VALUES (?, ?, ?, ?, 1, 'application/json', 'foreign:parent', ?, ?)`)
        .run(
          foreignArtifactId,
          foreignRunId,
          foreignSnapshotId,
          "a".repeat(64),
          "b".repeat(64),
          "2026-07-23T00:00:00.000Z",
        );
    })();
    database.close();
    Reflect.set(input.commit.parentArtifactIds, "0", foreignArtifactId);
    const before = publicationState(
      prepared.options.databasePath,
      prepared.runId,
    );

    expect(() =>
      publishReportAtomically(prepared.options.databasePath, input),
    ).toThrow();
    expect(
      publicationState(prepared.options.databasePath, prepared.runId),
    ).toEqual(before);
    prepared.cleanup();
  }, 20_000);
});
