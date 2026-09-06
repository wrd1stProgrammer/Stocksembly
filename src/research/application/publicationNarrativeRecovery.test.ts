import { describe, expect, it } from "vitest";
import {
  AtomicEditorialClaimSchema,
  ChairSynthesisOutputSchema,
} from "../domain/agentOutputs";
import { canonicalNarrativeV3IsGrounded } from "../workflow/chairSynthesisV3";
import { makeAuthoritativeReportInput } from "./assembleReport.testSupport";
import { reconcilePublicationNarrative } from "./publicationNarrativeRecovery";

describe("publication evidence reconciliation", () => {
  it("rewrites an excluded decisive claim and its narrative, without upgrading the audit or relabelling the old conclusion", () => {
    const fixture = makeAuthoritativeReportInput();
    const chair = ChairSynthesisOutputSchema.parse(fixture.chair);
    const original = chair.decisionBrief.primaryClaimIds[0]!;
    const survivor = AtomicEditorialClaimSchema.parse({
      ...fixture.editorialClaims[0],
      claimId: "00000000-0000-4000-8000-000000009996",
      publicThesis: {
        en: "Cash resources provide a buffer against near-term liabilities.",
        ko: "현금 자원은 단기 부채에 대한 완충 역할을 합니다.",
      },
    });
    const recovered = reconcilePublicationNarrative({
      chair,
      sentences: fixture.chairSentences,
      claims: [survivor],
      registeredClaimIds: new Set([original, survivor.claimId]),
      auditArtifactId: fixture.semanticAudit.artifactId,
    });
    expect(recovered.rebuilt).toBe(true);
    expect(recovered.chair.decisionBrief).toMatchObject({
      stance: "insufficient_evidence",
      confidence: "low",
      primaryClaimIds: [survivor.claimId],
    });
    expect(recovered.chair.decisionBrief.decisiveReason.en).toContain(
      survivor.publicThesis.en,
    );
    expect(recovered.chair.decisionBrief.decisiveReason.en).not.toBe(
      chair.decisionBrief.decisiveReason.en,
    );
    expect(chair.decisionBrief.primaryClaimIds).toEqual([original]);
    const canonical = recovered.chair.canonicalNarrativeV3!;
    const units = [
      ...Object.values(canonical.decisionLineage),
      ...canonical.sections.map((s) => s.lineage),
      ...canonical.teamViews.map((s) => s.lineage),
      ...canonical.anticipatedQuestions.map((s) => s.lineage),
    ];
    expect(units.flatMap((unit) => unit.claimIds)).not.toContain(original);
    expect(
      canonicalNarrativeV3IsGrounded({
        canonical,
        sentences: recovered.sentences,
        auditedClaimIds: [survivor.claimId],
        sourceArtifactIds: recovered.chair.sourceArtifactIds.concat(
          survivor.evidenceArtifactIds,
        ),
      }),
    ).toBe(true);
  });

  it("does not repair invented primary identities or manufacture a core answer without surviving evidence", () => {
    const fixture = makeAuthoritativeReportInput();
    const chair = ChairSynthesisOutputSchema.parse(fixture.chair);
    const common = {
      chair,
      sentences: fixture.chairSentences,
      auditArtifactId: fixture.semanticAudit.artifactId,
    };
    expect(
      reconcilePublicationNarrative({
        ...common,
        claims: fixture.editorialClaims,
        registeredClaimIds: new Set(),
      }).chair,
    ).toBe(chair);
    expect(
      reconcilePublicationNarrative({
        ...common,
        claims: [],
        registeredClaimIds: new Set(chair.decisionBrief.primaryClaimIds),
      }).chair,
    ).toBe(chair);
  });
});
