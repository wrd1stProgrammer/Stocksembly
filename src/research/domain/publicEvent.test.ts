import { describe, expect, it } from "vitest";
import {
  PublicResearchEventSchema,
  ReportHistorySchema,
  ReportVersionSummarySchema,
  validatePublicEventArtifact,
} from "./publicEvent";

const event = {
  schemaVersion: "workflow-v1",
  eventId: "00000000-0000-4000-8000-000000000001",
  runId: "00000000-0000-4000-8000-000000000002",
  snapshotId: "00000000-0000-4000-8000-000000000003",
  sequence: 1,
  kind: "artifact_committed",
  artifactId: "00000000-0000-4000-8000-000000000004",
  actorId: "market",
  stage: "memo",
  artifact: {
    artifactId: "00000000-0000-4000-8000-000000000004",
    logicalArtifactId: "memo:market",
    roleId: "market",
    stage: "memo",
    status: "accepted",
    runId: "00000000-0000-4000-8000-000000000002",
    snapshotId: "00000000-0000-4000-8000-000000000003",
  },
  summary: { en: "Maya memo committed.", ko: "Maya 메모가 확정되었습니다." },
  detail: { en: "Evidence-backed summary.", ko: "근거 기반 요약입니다." },
  stateId: "memo-accepted",
  occurredAt: "2026-07-22T00:00:00.000Z",
} as const;

describe("PublicResearchEventSchema", () => {
  it("accepts a durable artifact-derived bilingual summary", () => {
    expect(PublicResearchEventSchema.parse(event).sequence).toBe(1);
  });

  it.each([
    "prompt",
    "reasoning",
    "trace",
    "progress",
    "eta",
    "percentage",
    "url",
    "rawUrl",
  ])("rejects private/live field %s", (field) =>
    expect(
      PublicResearchEventSchema.safeParse({ ...event, [field]: "private" })
        .success,
    ).toBe(false),
  );

  it("rejects missing locale and non-artifact summaries", () => {
    expect(
      PublicResearchEventSchema.safeParse({
        ...event,
        summary: { en: "Only English" },
      }).success,
    ).toBe(false);
    expect(
      PublicResearchEventSchema.safeParse({ ...event, artifactId: undefined })
        .success,
    ).toBe(false);
  });

  it("rejects a raw URL embedded in durable summary text", () => {
    expect(
      PublicResearchEventSchema.safeParse({
        ...event,
        detail: { en: "See https://private.example", ko: "비공개 링크" },
      }).success,
    ).toBe(false);
  });

  it("rejects event fields that do not match accepted artifact provenance", () => {
    expect(
      PublicResearchEventSchema.safeParse({
        ...event,
        artifactId: "00000000-0000-4000-8000-000000000099",
      }).success,
    ).toBe(false);
    expect(
      validatePublicEventArtifact(event, [
        {
          ...event.artifact,
          runId: "00000000-0000-4000-8000-000000000098",
        },
      ]),
    ).toEqual({ valid: false, reason: "accepted_artifact_not_found" });
    expect(validatePublicEventArtifact(event, [event.artifact])).toEqual({
      valid: true,
    });
    expect(
      PublicResearchEventSchema.safeParse({
        ...event,
        artifact: {
          ...event.artifact,
          logicalArtifactId: "memo:unexpected_market",
        },
      }).success,
    ).toBe(false);
  });

  it("never exposes the internal semantic gate as a public actor event", () => {
    expect(
      PublicResearchEventSchema.safeParse({
        ...event,
        actorId: "system",
        stage: "semantic_audit",
        artifact: {
          ...event.artifact,
          logicalArtifactId: "semantic_audit:system",
          roleId: "system",
          stage: "semantic_audit",
        },
      }).success,
    ).toBe(false);
  });
});

describe("history/version DTOs", () => {
  const version = {
    reportId: "00000000-0000-4000-8000-000000000010",
    versionId: "00000000-0000-4000-8000-000000000011",
    runId: "00000000-0000-4000-8000-000000000012",
    snapshotId: "00000000-0000-4000-8000-000000000013",
    version: 1,
    status: "complete_with_limitations",
    publishedAt: "2026-07-22T00:00:00.000Z",
    title: { en: "Research File", ko: "리서치 파일" },
  } as const;

  it("accepts strict report history with matching version lineage", () => {
    const parsed = ReportHistorySchema.parse({
      reportId: version.reportId,
      currentVersionId: version.versionId,
      versions: [version],
    });
    expect(parsed.versions).toHaveLength(1);
  });

  it("rejects invalid status, extra private fields, and cross-report lineage", () => {
    expect(
      ReportVersionSummarySchema.safeParse({ ...version, status: "finished" })
        .success,
    ).toBe(false);
    expect(
      ReportVersionSummarySchema.safeParse({ ...version, prompt: "secret" })
        .success,
    ).toBe(false);
    expect(
      ReportHistorySchema.safeParse({
        reportId: "00000000-0000-4000-8000-000000000099",
        currentVersionId: version.versionId,
        versions: [version],
      }).success,
    ).toBe(false);
  });
});
