import { rmSync } from "node:fs";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import {
  ArtifactIdSchema,
  ClaimIdSchema,
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import {
  ResearchReportSchema,
  WorkflowV2ResearchReportSchema,
  WorkflowV3ResearchReportSchema,
  workflowV3ReportFromCanonicalNarrative,
} from "../domain/report";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { publishAuthoritativeReportForRun } from "../server/persistence/sqlite/publishAuthoritativeReportForRun";
import { sqliteReportVersionPersistence } from "../server/persistence/sqlite/sqliteReportPersistence";
import { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import { temporaryDatabase } from "../server/persistence/sqlite/sqliteStore.contractFixtures";
import { createSqliteChairSynthesis } from "../workflow/chairSynthesis";
import {
  corruptAcceptedEnvelope,
  createPreparedChairRound,
} from "../workflow/chairSynthesis.testSupport";
import { loadChairPrompt } from "../workflow/chairSynthesisInput";
import type { PrePublicationEditorialEnvelope } from "../workflow/prePublicationEditorialGate";
import { composeWorkflowV2Report } from "../workflow/workflowV2PublicationComposer";
import { assembleReport } from "./assembleReport";
import {
  CountingArtifactCasFake,
  makeAuthoritativeReportInput,
  reportPersistenceSpy,
  seedAuthoritativeParents,
} from "./assembleReport.testSupport";
import { persistAuthoritativeReport } from "./assembleReportPersistence";
import { publishableDissent } from "./assembleReportValidation";

describe("persistAuthoritativeReport", () => {
  it("drops orphaned dissent instead of blocking an otherwise publishable report", () => {
    const supportedClaimId = "00000000-0000-4000-8000-000000000001";
    const orphanedClaimId = "00000000-0000-4000-8000-000000000002";
    const sourceId = "00000000-0000-4000-8000-000000000003";

    const recovered = publishableDissent(
      [
        {
          claimId: supportedClaimId,
          sourceIds: [sourceId],
          text: { en: "Supported dissent.", ko: "근거가 있는 이견입니다." },
        },
        {
          claimId: orphanedClaimId,
          sourceIds: [sourceId],
          text: { en: "Orphaned dissent.", ko: "고아 이견입니다." },
        },
      ],
      new Set([supportedClaimId]),
      new Set([sourceId]),
    );

    expect(recovered).toEqual([
      {
        claimId: supportedClaimId,
        sourceIds: [sourceId],
        text: { en: "Supported dissent.", ko: "근거가 있는 이견입니다." },
      },
    ]);
  });

  it("publishes a recovered editorial subset when the chair decision cites a removed claim", () => {
    const input = makeAuthoritativeReportInput();
    const baseline = assembleReport(input);
    expect(baseline.kind).toBe("assembled");
    if (baseline.kind !== "assembled") return;
    const publishedClaimId = input.editorialClaims[0]?.claimId;
    const removedClaimId = ClaimIdSchema.parse(
      "00000000-0000-4000-8000-000000009997",
    );
    if (publishedClaimId === undefined)
      throw new TypeError("missing claim fixture");
    const validChair = ChairSynthesisOutputSchema.parse(input.chair);
    const chair = {
      ...validChair,
      decisionBrief: {
        ...validChair.decisionBrief,
        primaryClaimIds: [removedClaimId],
      },
    };
    const chairSentences = input.chairSentences.map((sentence, index) =>
      index === 0 ? { ...sentence, claimIds: [removedClaimId] } : sentence,
    );
    const {
      editorialClaims: _editorialClaims,
      editorialDecision: _editorialDecision,
      comparators: _comparators,
      anticipatedQuestions: _anticipatedQuestions,
      ...commonReport
    } = baseline.report;
    const legacyReport = ResearchReportSchema.parse({
      ...commonReport,
      schemaVersion: "workflow-v1",
    });

    const result = composeWorkflowV2Report({
      legacyReport,
      chair,
      chairSentences,
      comparators: [],
      editorialClaims: input.editorialClaims,
    });

    expect(result.report.editorialDecision.primaryClaimIds).toEqual([
      publishedClaimId,
    ]);
    expect(
      result.envelope.candidate.sections.flatMap((section) => section.claimIds),
    ).not.toContain(removedClaimId);
  });

  it.each(["en", "ko"] as const)(
    "accepts a grounded mirrored %s chair summary for single-locale publication",
    (locale) => {
      const input = makeAuthoritativeReportInput();
      const chair = {
        ...input.chair,
        sections: input.chair.sections.map((section) => ({
          ...section,
          publicSummary: {
            en: section.publicSummary[locale],
            ko: section.publicSummary[locale],
          },
        })),
      };

      const result = assembleReport({ ...input, locale, chair });

      expect(result.kind, JSON.stringify(result)).toBe("assembled");
    },
  );

  it("stores a valid authoritative report in CAS and saves contiguous version one", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const input = makeAuthoritativeReportInput();
    await seedAuthoritativeParents(cas, input);

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    // Then
    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.version).toBe(1);
    expect(
      result.report.editorialClaims.map((claim) => claim.roleOwner),
    ).toEqual(["market"]);
    expect(
      result.report.editorialClaims.every((claim) =>
        WORKFLOW_V1_SPECIALIST_IDS.includes(
          claim.roleOwner as (typeof WORKFLOW_V1_SPECIALIST_IDS)[number],
        ),
      ),
    ).toBe(true);
    expect(result.descriptor.parentDigests).toEqual(
      input.parentArtifacts.map((parent) => parent.digest),
    );
    expect(await cas.has(result.descriptor.digest)).toBe(true);
    const savedEditorialPublication = persistence.saved[0]?.version
      .publicPayload.editorialPublication as
      | PrePublicationEditorialEnvelope
      | undefined;
    const sectionClaimIds = result.report.narrative.sections.flatMap(
      (section) => section.claimIds,
    );
    expect(new Set(sectionClaimIds).size).toBe(sectionClaimIds.length);
    expect(result.report.teamViews[0]?.position).toBe(
      "Revenue evidence favors waiting for proof.",
    );
    expect(result.report.narrative.sections).toEqual(
      expect.arrayContaining(
        savedEditorialPublication?.candidate.sections.map((section) =>
          expect.objectContaining({
            id: section.sectionKey,
            body: section.text.en,
            claimIds: section.claimIds,
          }),
        ) ?? [],
      ),
    );
    expect(persistence.saved).toHaveLength(1);
    expect(persistence.saved[0]?.version.publicPayload).toMatchObject({
      schemaVersion: "workflow-v3",
      sourceLocale: "en",
      reportArtifactDigest: result.descriptor.digest,
      version: 1,
      priorVersionId: null,
      anticipatedQuestions: expect.any(Array),
      editorialPublication: {
        gateVersion: "editorial-quality-v1",
        candidate: { confidence: result.report.editorialDecision?.confidence },
        fieldLineage: expect.objectContaining({ "position.en": "synthesis" }),
      },
    });
  });

  it("publishes an audited fallback when canonical prose is absent from its cited lineage", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const input = makeAuthoritativeReportInput();
    const chair = ChairSynthesisOutputSchema.parse(input.chair);
    const canonical = chair.canonicalNarrativeV3;
    if (canonical === undefined) throw new TypeError("missing v3 fixture");
    const forged = {
      ...input,
      chair: {
        ...chair,
        canonicalNarrativeV3: {
          ...canonical,
          decisiveReason: "Revenue reaches an invented 777%.",
        },
      },
    };
    await seedAuthoritativeParents(cas, input);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      forged,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.editorialDecision?.decisiveReason).not.toContain(
      "777%",
    );
    expect(result.report.status).toBe("complete_with_limitations");
    expect(persistence.saved).toHaveLength(1);
  });

  it("publishes the audited subset when optional canonical content includes unaudited claims", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const chair = ChairSynthesisOutputSchema.parse(valid.chair);
    const canonical = chair.canonicalNarrativeV3;
    if (canonical === undefined) throw new TypeError("missing v3 fixture");
    const unauditedClaimId = "00000000-0000-4000-8000-000000009999";
    const sourceArtifactId = chair.sourceArtifactIds[0];
    if (sourceArtifactId === undefined)
      throw new TypeError("missing source artifact fixture");
    const unauditedSentence = {
      sentenceId: "sentence:unaudited-optional",
      kind: "claim" as const,
      claimIds: [unauditedClaimId],
      sourceArtifactIds: [sourceArtifactId],
      text: {
        en: "An optional unaudited observation should not block publication.",
        ko: "감사되지 않은 선택 관찰은 발행을 막지 않아야 합니다.",
      },
    };
    const unauditedLineage = {
      sentenceIds: [unauditedSentence.sentenceId],
      claimIds: [...unauditedSentence.claimIds],
      sourceArtifactIds: [...unauditedSentence.sourceArtifactIds],
    };
    const input = {
      ...valid,
      chairSentences: [...valid.chairSentences, unauditedSentence],
      chair: {
        ...chair,
        canonicalNarrativeV3: {
          ...canonical,
          sections: canonical.sections.map((section) =>
            section.sectionKey === "dissent_unknowns"
              ? {
                  ...section,
                  narrative: unauditedSentence.text.en,
                  lineage: unauditedLineage,
                }
              : section,
          ),
          anticipatedQuestions: [
            {
              question: unauditedSentence.text.en,
              answer: unauditedSentence.text.en,
              lineage: unauditedLineage,
            },
          ],
        },
      },
    };
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.anticipatedQuestions).toEqual([]);
    expect(
      result.report.narrative.sections.find(
        (section) => section.id === "dissent_unknowns",
      )?.body,
    ).toBe("The retained dissent identifies unresolved execution risk.");
    expect(result.report.status).toBe("complete_with_limitations");
    expect(result.report.limitations).toContainEqual({
      id: "limitation:canonical_publication_reduction",
      capability: "canonical_optional_content",
    });
    expect(persistence.saved).toHaveLength(1);
  });

  it("keeps original Q&A identity when a middle canonical question is removed", () => {
    const input = makeAuthoritativeReportInput();
    const assembled = assembleReport(input);
    expect(assembled.kind).toBe("assembled");
    if (assembled.kind !== "assembled") return;
    const first = assembled.report.anticipatedQuestions[0];
    const second = assembled.report.anticipatedQuestions[1];
    if (first === undefined || second === undefined)
      throw new TypeError("missing Q&A fixtures");
    const third = {
      ...first,
      questionId: "00000000-0000-4000-8000-000000009998",
      decisionKey: "third_question",
      rank: 3,
    };
    const report = WorkflowV2ResearchReportSchema.parse({
      ...assembled.report,
      anticipatedQuestions: [first, second, third],
    });
    const canonical = ChairSynthesisOutputSchema.parse(
      input.chair,
    ).canonicalNarrativeV3;
    if (
      canonical === undefined ||
      canonical.anticipatedQuestions[0] === undefined
    )
      throw new TypeError("missing canonical Q&A fixture");
    const projected = workflowV3ReportFromCanonicalNarrative(
      report,
      {
        ...canonical,
        anticipatedQuestions: [
          canonical.anticipatedQuestions[0],
          canonical.anticipatedQuestions[0],
        ],
      },
      new Map(),
      [0, 2],
    );

    expect(
      projected.anticipatedQuestions.map((question) => question.questionId),
    ).toEqual([first.questionId, third.questionId]);
    expect(
      projected.anticipatedQuestions.some(
        (question) => question.questionId === second.questionId,
      ),
    ).toBe(false);
  });

  it("preserves registered metric identifiers that are not UUIDs", () => {
    const input = makeAuthoritativeReportInput();
    const assembled = assembleReport(input);
    expect(assembled.kind).toBe("assembled");
    if (assembled.kind !== "assembled") return;
    const firstClaim = assembled.report.editorialClaims[0];
    if (firstClaim === undefined) throw new TypeError("missing claim fixture");
    const report = WorkflowV2ResearchReportSchema.parse({
      ...assembled.report,
      editorialClaims: [
        { ...firstClaim, decisiveMetricIds: ["metric:ev_sales"] },
        ...assembled.report.editorialClaims.slice(1),
      ],
    });
    const canonical = ChairSynthesisOutputSchema.parse(
      input.chair,
    ).canonicalNarrativeV3;
    if (canonical === undefined)
      throw new TypeError("missing canonical narrative fixture");

    const projected = workflowV3ReportFromCanonicalNarrative(report, canonical);

    expect(projected.editorialClaims[0]?.decisiveMetricIds).toEqual([
      "metric:ev_sales",
    ]);
  });

  it("keeps canonical Q&A lineage aligned when a source question is absent", () => {
    const input = makeAuthoritativeReportInput();
    const assembled = assembleReport(input);
    expect(assembled.kind).toBe("assembled");
    if (assembled.kind !== "assembled") return;
    const canonical = ChairSynthesisOutputSchema.parse(
      input.chair,
    ).canonicalNarrativeV3;
    if (canonical === undefined || canonical.anticipatedQuestions.length === 0)
      throw new TypeError("missing canonical question fixtures");

    const projected = workflowV3ReportFromCanonicalNarrative(
      assembled.report,
      {
        ...canonical,
        anticipatedQuestions: [canonical.anticipatedQuestions[0]!],
      },
      new Map(),
      [999],
    );

    expect(projected.anticipatedQuestions).toEqual([]);
    expect(projected.narrativeLineage.anticipatedQuestions).toHaveLength(
      projected.anticipatedQuestions.length,
    );
  });

  it("publishes audited retained dissent when the chair did not tag a separate dissent sentence", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      chairSentences: valid.chairSentences.map((sentence) =>
        sentence.kind === "dissent"
          ? { ...sentence, kind: "claim" as const }
          : sentence,
      ),
    };
    await seedAuthoritativeParents(cas, input);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.narrative.dissent[0]?.text).not.toBe("");
  });

  it("retains qualified user-selected comparators in the published report", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const input = {
      ...makeAuthoritativeReportInput(),
      comparators: [
        {
          comparatorId: "NASDAQ:AAPL",
          role: "valuation_proxy" as const,
          rationale: {
            en: "User-selected valuation comparison using aligned TTM metrics.",
            ko: "사용자가 지정한 비교기업이며 정렬된 TTM 지표로 밸류에이션을 비교합니다.",
          },
          comparableMetricKeys: ["price_earnings_ttm"],
        },
      ],
    };
    await seedAuthoritativeParents(cas, input);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.comparators).toEqual(
      input.comparators.map((comparator) => ({
        ...comparator,
        rationale: comparator.rationale.en,
      })),
    );
  });

  it("fails closed before CAS when authenticated editorial claims are absent", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const { editorialClaims: _omitted, ...input } = valid;
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result).toEqual({ kind: "blocked", reason: "editorial_v2_invalid" });
    expect(cas.putCount).toBe(0);
    expect(persistence.saved).toHaveLength(0);
  });

  it("fails closed before CAS for an unregistered editorial claim owner", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = structuredClone(valid);
    const claim = input.editorialClaims[0];
    if (claim === undefined)
      throw new TypeError("missing editorial claim fixture");
    Reflect.set(claim, "roleOwner", "research_committee");
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result).toEqual({ kind: "blocked", reason: "editorial_v2_invalid" });
    expect(cas.putCount).toBe(0);
    expect(persistence.saved).toHaveLength(0);
  });

  it("publishes when a retained open question contains a sourced market level", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const questions = valid.structuralAudit.result.retainedOpenQuestions.map(
      (question, index) =>
        index === 0
          ? {
              ...question,
              text: {
                en: "Confirm whether price $313.03 remains below short-term resistance.",
                ko: question.text.ko,
              },
            }
          : question,
    );
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: {
          ...valid.structuralAudit.result,
          retainedOpenQuestions: questions,
        },
      },
      chair: {
        ...valid.chair,
        unknowns: questions.map((question) => question.text),
      },
    };
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
  });

  it("does not let a partial-only report drive a core conclusion", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: {
          ...valid.structuralAudit.result,
          capabilities: valid.structuralAudit.result.capabilities.map(
            (capability) => ({
              ...capability,
              availability: "available" as const,
            }),
          ),
        },
      },
      semanticAudit: {
        ...valid.semanticAudit,
        verdicts: valid.semanticAudit.verdicts.map((verdict, index) =>
          index === 0 ? { ...verdict, verdict: "partial" as const } : verdict,
        ),
      },
    };
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result).toEqual({
      kind: "blocked",
      reason: "no_grounded_core_answer",
    });
    expect(persistence.saved).toHaveLength(0);
  });

  it("recovers a numeric revenue scenario from an abbreviated chair sentence", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: {
          ...valid.structuralAudit.result,
          scenarios: [
            {
              field: "revenue",
              value:
                "Base: current trajectory; upside: adoption; downside: concentration",
            },
          ],
        },
      },
      chairSentences: valid.chairSentences.map((sentence) =>
        sentence.kind === "scenario"
          ? {
              ...sentence,
              text: {
                en: "Quarterly revenue reached $81.6B.",
                ko: "분기 매출은 816억달러를 기록했습니다.",
              },
            }
          : sentence,
      ),
      chair: {
        ...valid.chair,
        sections: valid.chair.sections.map((section) =>
          section.sectionKey === "operational_scenarios"
            ? {
                ...section,
                publicSummary: {
                  en: "Quarterly revenue reached $81.6B.",
                  ko: "분기 매출은 816억달러를 기록했습니다.",
                },
              }
            : section,
        ),
      },
    };
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.narrative.scenarios[0]?.assumptions[0]).toEqual({
      metric: "revenue",
      unit: "USD",
      value: "81600000000",
    });
  });

  it("publishes when neither the audit nor the chair defines a legacy operating scenario", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: { ...valid.structuralAudit.result, scenarios: [] },
      },
      chairScenarioIds: [],
    };
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result.kind, JSON.stringify(result)).toBe("published");
    if (result.kind !== "published") return;
    expect(result.report.narrative.scenarios).toEqual([]);
  });

  it("removes a contradicted retained-dissent claim from the report register", async () => {
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      semanticAudit: {
        ...valid.semanticAudit,
        verdicts: valid.semanticAudit.verdicts.map((verdict) => ({
          ...verdict,
          verdict: "contradicted" as const,
          contradictionSeverity: "severe" as const,
        })),
      },
      chair: {
        ...valid.chair,
        dissentClaimIds: [],
      },
    };
    await seedAuthoritativeParents(cas, valid);

    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    expect(result).toEqual({
      kind: "blocked",
      reason: "no_grounded_core_answer",
    });
    expect(persistence.saved).toHaveLength(0);
  });

  it("publishes from the audited retention ledger when chair retention metadata drifts", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      chair: { ...valid.chair, unknowns: [] },
    };
    await seedAuthoritativeParents(cas, input);

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    // Then
    expect(result.kind, JSON.stringify(result)).toBe("published");
    expect(persistence.saved).toHaveLength(1);
    expect(cas.putCount).toBeGreaterThan(0);
  });

  it("writes no CAS blob or version when a quality gate fails", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: {
          ...valid.structuralAudit.result,
          publishable: false,
          blockers: ["exact_span"],
        },
      },
    };

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    // Then
    expect(result).toEqual({ kind: "blocked", reason: "audit_failed" });
    expect(persistence.saved).toHaveLength(0);
    expect(cas.putCount).toBe(0);
  });

  it("rejects an empty authenticated capability posture before CAS or metadata", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const input = {
      ...valid,
      structuralAudit: {
        ...valid.structuralAudit,
        result: { ...valid.structuralAudit.result, capabilities: [] },
      },
    };

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      input,
    );

    // Then
    expect(result).toEqual({ kind: "blocked", reason: "report_invalid" });
    expect(cas.putCount).toBe(0);
    expect(persistence.saved).toHaveLength(0);
  });

  it("preserves bilingual citations, dissent, limitations, and immutable version lineage", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const firstInput = makeAuthoritativeReportInput();
    await seedAuthoritativeParents(cas, firstInput);
    const first = await persistAuthoritativeReport(
      { cas, persistence },
      firstInput,
    );
    if (first.kind !== "published") throw new TypeError("missing first report");
    const secondInput = {
      ...firstInput,
      reportArtifactId: "00000000-0000-4000-8000-000000000305",
      versionId: "00000000-0000-4000-8000-000000000306",
      version: 2,
      priorReport: first.report,
      semanticAudit: {
        ...firstInput.semanticAudit,
        reportVersionId: "00000000-0000-4000-8000-000000000306",
      },
    };

    // When
    const second = await persistAuthoritativeReport(
      { cas, persistence },
      secondInput,
    );

    // Then
    expect(second.kind).toBe("published");
    if (second.kind !== "published") return;
    expect(second.report.versionDelta.priorVersionId).toBe(
      first.report.versionId,
    );
    expect(second.descriptor.digest).not.toBe(first.descriptor.digest);
    const dissentClaimIds = second.report.narrative.dissent.map(
      (item) => item.claimId,
    );
    expect(new Set(dissentClaimIds).size).toBe(dissentClaimIds.length);
    expect(second.report.status).toBe("complete_with_limitations");
    expect(JSON.stringify(second.report)).not.toMatch(
      /current_price|target_price/,
    );
  });

  it.each([
    "missing",
    "duplicate",
    "wrong_role",
    "cross_run",
    "cross_snapshot",
  ])(
    "blocks %s accepted-artifact provenance before CAS or version metadata",
    async (fault) => {
      // Given
      const cas = new CountingArtifactCasFake();
      const persistence = reportPersistenceSpy();
      const valid = makeAuthoritativeReportInput();
      const artifacts = [...valid.artifacts];
      if (fault === "missing") artifacts.pop();
      else if (fault === "duplicate" && artifacts[0] !== undefined)
        artifacts[10] = artifacts[0];
      else if (fault === "wrong_role" && artifacts[0] !== undefined)
        artifacts[0] = { ...artifacts[0], roleId: "chair" };
      else if (fault === "cross_run" && artifacts[0] !== undefined)
        artifacts[0] = {
          ...artifacts[0],
          runId: "00000000-0000-4000-8000-000000000999",
        };
      else if (fault === "cross_snapshot" && artifacts[0] !== undefined)
        artifacts[0] = {
          ...artifacts[0],
          snapshotId: "00000000-0000-4000-8000-000000000998",
        };

      // When
      const result = await persistAuthoritativeReport(
        { cas, persistence },
        { ...valid, artifacts },
      );

      // Then
      expect(result.kind).toBe("blocked");
      expect(cas.putCount).toBe(0);
      expect(persistence.saved).toHaveLength(0);
    },
  );

  it("rejects caller-forged chair prose not present in the persisted prompt", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const first = valid.chair.sections[0];
    if (first === undefined) throw new TypeError("missing chair section");
    const chair = {
      ...valid.chair,
      sections: [
        {
          ...first,
          publicSummary: { en: "Invented fact.", ko: "조작된 사실입니다." },
        },
        ...valid.chair.sections.slice(1),
      ],
    };

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      { ...valid, chair },
    );

    // Then
    expect(result).toEqual({
      kind: "blocked",
      reason: "chair_content_mismatch",
    });
    expect(cas.putCount).toBe(0);
    expect(persistence.saved).toHaveLength(0);
  });

  it("rejects a bilingual summary when one locale is not grounded", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    const first = valid.chair.sections[0];
    if (first === undefined) throw new TypeError("missing chair section");
    const chair = {
      ...valid.chair,
      sections: [
        {
          ...first,
          publicSummary: {
            en: first.publicSummary.en,
            ko: "같은 근거를 자연스러운 한국어 표현으로 다시 종합했습니다.",
          },
        },
        ...valid.chair.sections.slice(1),
      ],
    };
    await seedAuthoritativeParents(cas, valid);

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence },
      { ...valid, chair },
    );

    // Then
    expect(result).toEqual({
      kind: "blocked",
      reason: "chair_content_mismatch",
    });
    expect(persistence.saved).toHaveLength(0);
  });

  it("rejects an unauthenticated parent digest and non-contiguous version", async () => {
    // Given
    const cas = new CountingArtifactCasFake();
    const persistence = reportPersistenceSpy();
    const valid = makeAuthoritativeReportInput();
    await seedAuthoritativeParents(cas, valid);
    const firstParent = valid.parentArtifacts[0];
    if (firstParent === undefined) throw new TypeError("missing report parent");

    // When
    const badDigest = await persistAuthoritativeReport(
      { cas, persistence },
      {
        ...valid,
        parentArtifacts: [
          { ...firstParent, digest: "f".repeat(64) },
          ...valid.parentArtifacts.slice(1),
        ],
      },
    );
    const skippedVersion = await persistAuthoritativeReport(
      { cas, persistence },
      { ...valid, version: 2 },
    );

    // Then
    expect(badDigest).toEqual({
      kind: "blocked",
      reason: "parent_artifact_authentication_failed",
    });
    expect(skippedVersion).toEqual({
      kind: "blocked",
      reason: "version_lineage_mismatch",
    });
    expect(cas.putCount).toBe(0);
    expect(persistence.saved).toHaveLength(0);
  });

  it("atomically links the CAS report, all parents, and contiguous SQLite version one", async () => {
    // Given
    const temporary = temporaryDatabase();
    const store = openSqliteStore(temporary.path);
    const cas = new CountingArtifactCasFake();
    const input = makeAuthoritativeReportInput();
    await seedAuthoritativeParents(cas, input);
    store.createRun({
      runId: RunIdSchema.parse(input.structuralAudit.runId),
      snapshotId: SnapshotIdSchema.parse(input.structuralAudit.snapshotId),
      requestedAt: "2026-07-23T00:00:00.000Z",
      initialJob: {
        jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000800"),
        kind: "research",
        logicalKey: "authoritative-report-test",
        inputHash: "a".repeat(64),
        createdAt: "2026-07-23T00:00:00.000Z",
      },
      initialEvent: {
        eventId: EventIdSchema.parse("00000000-0000-4000-8000-000000000801"),
        type: "run_queued",
        stateId: "queued",
        occurredAt: "2026-07-23T00:00:00.000Z",
      },
    });
    for (const parent of input.parentArtifacts)
      store.saveArtifactMetadata({
        artifactId: ArtifactIdSchema.parse(parent.artifactId),
        runId: RunIdSchema.parse(input.structuralAudit.runId),
        snapshotId: SnapshotIdSchema.parse(input.structuralAudit.snapshotId),
        contentHash: parent.digest,
        byteLength: parent.seed.length,
        mediaType: "application/json",
        logicalKey: `parent:${parent.artifactId}`,
        inputHash: parent.digest,
        createdAt: "2026-07-23T00:00:00.000Z",
      });

    // When
    const result = await persistAuthoritativeReport(
      { cas, persistence: sqliteReportVersionPersistence(store) },
      input,
    );

    // Then
    const database = new Database(temporary.path);
    const counts = database
      .prepare(`SELECT
        (SELECT COUNT(*) FROM report_versions) AS versions,
        (SELECT COUNT(*) FROM artifact_edges WHERE relation = 'derived-from') AS edges,
        (SELECT version FROM report_versions LIMIT 1) AS version`)
      .get();
    database.close();
    store.close();
    rmSync(temporary.directory, { recursive: true, force: true });
    expect(result.kind).toBe("published");
    expect(counts).toEqual({ versions: 1, edges: 14, version: 1 });
  });

  it("rolls back SQLite report metadata and version when a parent edge is missing", async () => {
    // Given
    const temporary = temporaryDatabase();
    const store = openSqliteStore(temporary.path);
    const cas = new CountingArtifactCasFake();
    const input = makeAuthoritativeReportInput();
    await seedAuthoritativeParents(cas, input);
    store.createRun({
      runId: RunIdSchema.parse(input.structuralAudit.runId),
      snapshotId: SnapshotIdSchema.parse(input.structuralAudit.snapshotId),
      requestedAt: "2026-07-23T00:00:00.000Z",
      initialJob: {
        jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000810"),
        kind: "research",
        logicalKey: "authoritative-report-rollback-test",
        inputHash: "b".repeat(64),
        createdAt: "2026-07-23T00:00:00.000Z",
      },
      initialEvent: {
        eventId: EventIdSchema.parse("00000000-0000-4000-8000-000000000811"),
        type: "run_queued",
        stateId: "queued",
        occurredAt: "2026-07-23T00:00:00.000Z",
      },
    });
    for (const parent of input.parentArtifacts.slice(1))
      store.saveArtifactMetadata({
        artifactId: ArtifactIdSchema.parse(parent.artifactId),
        runId: RunIdSchema.parse(input.structuralAudit.runId),
        snapshotId: SnapshotIdSchema.parse(input.structuralAudit.snapshotId),
        contentHash: parent.digest,
        byteLength: parent.seed.length,
        mediaType: "application/json",
        logicalKey: `parent:${parent.artifactId}`,
        inputHash: parent.digest,
        createdAt: "2026-07-23T00:00:00.000Z",
      });

    // When
    const action = async () =>
      await persistAuthoritativeReport(
        { cas, persistence: sqliteReportVersionPersistence(store) },
        input,
      );

    // Then
    await expect(action).rejects.toThrow(/FOREIGN KEY/);
    const database = new Database(temporary.path);
    const counts = database
      .prepare(`SELECT
        (SELECT COUNT(*) FROM report_versions) AS versions,
        (SELECT COUNT(*) FROM artifacts WHERE logical_key LIKE 'report_version:%') AS reports`)
      .get();
    database.close();
    store.close();
    rmSync(temporary.directory, { recursive: true, force: true });
    expect(counts).toEqual({ versions: 0, reports: 0 });
  });

  it("publishes only the authenticated accepted chair and terminates the real run atomically", async () => {
    // Given
    const prepared = await createPreparedChairRound("none");
    const chair = createSqliteChairSynthesis({
      ...prepared.options,
      workflowVersion: "workflow-v3",
    });
    await chair.stage({ runId: prepared.runId });
    await chair.drain(prepared.runId);
    await chair.close();
    const database = new Database(prepared.options.databasePath);
    const fence = z
      .object({
        artifact_id: z.string().uuid(),
        owner_id: z.string(),
        fence_token: z.number().int().positive(),
        ordinal: z.number().int().positive(),
        job_id: z.string().uuid(),
        attempt_id: z.string().uuid(),
        envelope_json: z.string(),
      })
      .parse(
        database
          .prepare(`SELECT agent_output_commits.artifact_id,
      agent_output_commits.owner_id, agent_output_commits.fence_token,
      agent_output_commits.ordinal, agent_output_commits.envelope_json,
      attempts.job_id, attempts.attempt_id
      FROM agent_output_commits JOIN attempts USING(attempt_id)
      WHERE attempts.run_id = ? AND attempts.logical_artifact_key = 'chair_synthesis:chair'`)
          .get(prepared.runId),
      );
    const chairOutput = ChairSynthesisOutputSchema.parse(
      z
        .object({ payload: z.unknown() })
        .passthrough()
        .parse(JSON.parse(fence.envelope_json)).payload,
    );
    const prompt = await loadChairPrompt(
      database,
      prepared.options.cas,
      prepared.runId,
    );
    if (prompt === undefined) throw new TypeError("missing chair prompt");
    database.close();

    // When
    const result = await publishAuthoritativeReportForRun(
      {
        databasePath: prepared.options.databasePath,
        cas: prepared.options.cas,
        now: () => "2026-07-23T00:10:00.000Z",
      },
      {
        runId: prepared.runId,
        acceptedChairArtifactId: fence.artifact_id,
        fence: {
          jobId: fence.job_id,
          attemptId: fence.attempt_id,
          ordinal: fence.ordinal,
          ownerId: fence.owner_id,
          token: fence.fence_token,
        },
      },
    );

    // Then
    const published = new Database(prepared.options.databasePath);
    const state = published
      .prepare(`SELECT runs.status, runs.report_id,
      runs.report_published_at,
      (SELECT COUNT(*) FROM report_versions) AS versions,
      (SELECT COUNT(*) FROM run_events WHERE event_type = 'report_published') AS events,
      (SELECT public_payload_json FROM report_versions LIMIT 1) AS version_payload_json,
      (SELECT payload_json FROM run_events
        WHERE event_type = 'report_published') AS payload_json
      FROM runs WHERE run_id = ?`)
      .get(prepared.runId);
    published.close();
    expect(result).toMatchObject({ kind: "published" });
    if (result.kind !== "published") return;
    const storedReport = await prepared.options.cas.get(
      ArtifactDigestSchema.parse(result.digest),
    );
    const report = WorkflowV3ResearchReportSchema.parse(
      JSON.parse(new TextDecoder().decode(storedReport?.bytes)),
    );
    expect(report.editorialClaims).not.toHaveLength(0);
    expect(
      report.editorialClaims.every((claim) =>
        WORKFLOW_V1_SPECIALIST_IDS.includes(
          claim.roleOwner as (typeof WORKFLOW_V1_SPECIALIST_IDS)[number],
        ),
      ),
    ).toBe(true);
    expect(JSON.stringify(report.editorialClaims)).not.toContain(
      "research_committee",
    );
    const operational = report.narrative.scenarios[0];
    const dissent = report.narrative.dissent[0];
    const scenarioSentence = prompt.sentences.find(
      (sentence) => sentence.sentenceId === prompt.scenarioIds[0],
    );
    expect(operational?.id).toBe(prompt.scenarioIds[0]);
    expect(report.narrative.scenarios[0]?.name).toBe(scenarioSentence?.text.en);
    expect(
      report.narrative.sections.map((section) => section.sourceIds),
    ).toEqual(chairOutput.sections.map((section) => section.sourceArtifactIds));
    if (dissent === undefined) throw new TypeError("missing retained dissent");
    const dissentSentence = prompt.sentences.find(
      (sentence) =>
        sentence.kind === "dissent" &&
        sentence.claimIds.includes(dissent.claimId),
    );
    expect(dissent.text).toContain(dissentSentence?.text.en);
    expect([...dissent.sourceIds]).toEqual(
      expect.arrayContaining([...(dissentSentence?.sourceArtifactIds ?? [])]),
    );
    expect(
      report.sources.every(
        (source) =>
          source.publisher !== "authenticated_artifact" &&
          source.retrievedAt !== "1970-01-01T00:00:00.000Z",
      ),
    ).toBe(true);
    expect(state).toMatchObject({
      status: "complete-with-limitations",
      versions: 1,
      events: 1,
      report_published_at: "2026-07-23T00:10:00.000Z",
    });
    const publicationPayload = JSON.parse(
      z.object({ payload_json: z.string() }).parse(state).payload_json,
    );
    const versionPayload = JSON.parse(
      z.object({ version_payload_json: z.string() }).passthrough().parse(state)
        .version_payload_json,
    );
    expect(versionPayload).toMatchObject({
      schemaVersion: "workflow-v3",
      sourceLocale: "en",
      anticipatedQuestions: report.anticipatedQuestions,
      editorialPublication: {
        qaPolicy: {
          moduleMinimum: 5,
          supportedCount: report.anticipatedQuestions.length,
        },
        candidate: { confidence: report.editorialDecision?.confidence },
      },
    });
    expect(publicationPayload).toEqual({
      schemaVersion: "workflow-v3",
      reportId: result.reportId,
      reportVersionId: result.versionId,
      artifactId: result.artifactId,
      participantIds: [],
      summary: {
        en: "Research report published.",
        ko: "리서치 보고서가 발행됐습니다.",
      },
      claimIds: report.claims.map((claim) => claim.claimId),
      sourceIds: report.sources.map((source) => source.sourceId),
      limitationIds: report.limitations.map((limitation) => limitation.id),
    });
    prepared.cleanup();
  }, 20_000);

  it.each(["stale_fence", "wrong_artifact"])(
    "leaves zero publication state for %s authority",
    async (fault) => {
      // Given
      const prepared = await createPreparedChairRound("none");
      const chair = createSqliteChairSynthesis(prepared.options);
      await chair.stage({ runId: prepared.runId });
      await chair.drain(prepared.runId);
      await chair.close();
      const database = new Database(prepared.options.databasePath);
      const accepted = z
        .object({
          artifact_id: z.string().uuid(),
          owner_id: z.string(),
          fence_token: z.number().int().positive(),
          ordinal: z.number().int().positive(),
          job_id: z.string().uuid(),
          attempt_id: z.string().uuid(),
        })
        .parse(
          database
            .prepare(`SELECT agent_output_commits.artifact_id,
              agent_output_commits.owner_id, agent_output_commits.fence_token,
              agent_output_commits.ordinal, attempts.job_id, attempts.attempt_id
              FROM agent_output_commits JOIN attempts USING(attempt_id)
              WHERE attempts.run_id = ? AND attempts.logical_artifact_key = 'chair_synthesis:chair'`)
            .get(prepared.runId),
        );
      database.close();

      // When
      const result = await publishAuthoritativeReportForRun(
        {
          databasePath: prepared.options.databasePath,
          cas: prepared.options.cas,
        },
        {
          runId: prepared.runId,
          acceptedChairArtifactId:
            fault === "wrong_artifact"
              ? "00000000-0000-4000-8000-000000009999"
              : accepted.artifact_id,
          fence: {
            jobId: accepted.job_id,
            attemptId: accepted.attempt_id,
            ordinal: accepted.ordinal,
            ownerId: accepted.owner_id,
            token:
              fault === "stale_fence"
                ? accepted.fence_token + 1
                : accepted.fence_token,
          },
        },
      );

      // Then
      const stored = new Database(prepared.options.databasePath);
      const state = stored
        .prepare(`SELECT runs.status, runs.report_id,
          (SELECT COUNT(*) FROM report_versions) AS versions,
          (SELECT COUNT(*) FROM run_events WHERE event_type = 'report_published') AS events
          FROM runs WHERE run_id = ?`)
        .get(prepared.runId);
      stored.close();
      prepared.cleanup();
      expect(result).toEqual({
        kind: "incomplete",
        reason: "authority_authentication_failed",
      });
      expect(state).toEqual({
        status: "running",
        report_id: null,
        versions: 0,
        events: 0,
      });
    },
    20_000,
  );

  it("leaves zero publication state when a post-chair authenticated source is tampered", async () => {
    // Given
    const prepared = await createPreparedChairRound("none");
    const chair = createSqliteChairSynthesis(prepared.options);
    await chair.stage({ runId: prepared.runId });
    await chair.drain(prepared.runId);
    await chair.close();
    const database = new Database(prepared.options.databasePath);
    const accepted = z
      .object({
        artifact_id: z.string().uuid(),
        owner_id: z.string(),
        fence_token: z.number().int().positive(),
        ordinal: z.number().int().positive(),
        job_id: z.string().uuid(),
        attempt_id: z.string().uuid(),
      })
      .parse(
        database
          .prepare(`SELECT agent_output_commits.artifact_id,
          agent_output_commits.owner_id, agent_output_commits.fence_token,
          agent_output_commits.ordinal, attempts.job_id, attempts.attempt_id
          FROM agent_output_commits JOIN attempts USING(attempt_id)
          WHERE attempts.run_id = ? AND attempts.logical_artifact_key = 'chair_synthesis:chair'`)
          .get(prepared.runId),
      );
    const source = z.object({ logical_key: z.string() }).parse(
      database
        .prepare(`SELECT logical_key FROM artifacts WHERE run_id = ?
          AND logical_key LIKE 'consolidation:%' ORDER BY logical_key LIMIT 1`)
        .get(prepared.runId),
    );
    database.close();
    await corruptAcceptedEnvelope(
      prepared.options.databasePath,
      prepared.options.cas,
      prepared.runId,
      source.logical_key,
    );

    // When
    const result = await publishAuthoritativeReportForRun(
      {
        databasePath: prepared.options.databasePath,
        cas: prepared.options.cas,
      },
      {
        runId: prepared.runId,
        acceptedChairArtifactId: accepted.artifact_id,
        fence: {
          jobId: accepted.job_id,
          attemptId: accepted.attempt_id,
          ordinal: accepted.ordinal,
          ownerId: accepted.owner_id,
          token: accepted.fence_token,
        },
      },
    );

    // Then
    const stored = new Database(prepared.options.databasePath);
    const state = stored
      .prepare(`SELECT runs.status, runs.report_id,
      (SELECT COUNT(*) FROM report_versions) AS versions,
      (SELECT COUNT(*) FROM run_events WHERE event_type = 'report_published') AS events
      FROM runs WHERE run_id = ?`)
      .get(prepared.runId);
    stored.close();
    prepared.cleanup();
    expect(result).toEqual({
      kind: "incomplete",
      reason: "authority_authentication_failed",
    });
    expect(state).toEqual({
      status: "running",
      report_id: null,
      versions: 0,
      events: 0,
    });
  }, 20_000);
});
