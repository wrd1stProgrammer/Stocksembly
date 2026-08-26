import { describe, expect, it } from "vitest";
import { ChairSynthesisOutputSchema } from "../domain/agentOutputs";
import { schemaDocument } from "../server/codex/codexArtifacts";
import { mixedClaimValidationFixture } from "./chairSynthesis.testSupport";
import {
  ChairSynthesisModelOutputSchema,
  ChairSynthesisPromptSchema,
} from "./chairSynthesisContracts";
import { chairSynthesisModelPrompt } from "./chairSynthesisPrompts";
import {
  chairCandidateIssue,
  nextChairSectionRewrite,
  projectChairAssignments,
  repairChairCandidate,
  validChairCandidate,
} from "./chairSynthesisValidation";

describe("chair synthesis directional contract", () => {
  it("rejects duplicate sentence identifiers before the chair is called", () => {
    const { prompt } = mixedClaimValidationFixture();
    const duplicate = prompt.sentences[0];
    if (duplicate === undefined) throw new TypeError("fixture is empty");

    expect(
      ChairSynthesisPromptSchema.safeParse({
        ...prompt,
        sentences: [...prompt.sentences, duplicate],
      }).success,
    ).toBe(false);
  });

  it("routes thin prose from a real research request back to its owning section", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const requestPrompt = {
      ...prompt,
      mandate: {
        ...prompt.mandate,
        question: "Is the current growth thesis investable?",
      },
    };

    expect(
      chairCandidateIssue(JSON.stringify(requestPrompt), candidate),
    ).toEqual({
      sectionKey: "ten_second_brief",
      reason: "low_information_summary",
    });
  });

  it("allows a detailed section to carry forward the executive brief conclusion", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const brief = candidate.sections.find(
      (section) => section.sectionKey === "ten_second_brief",
    );
    if (brief === undefined) throw new TypeError("missing brief fixture");
    const consistent = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "supported_analysis"
          ? { ...section, publicSummary: brief.publicSummary }
          : section,
      ),
    };

    expect(
      chairCandidateIssue(JSON.stringify(prompt), consistent)?.reason,
    ).not.toBe("semantic_repetition");
  });

  it("publishes a verifiable disjoint sentence ownership ledger", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const modelPrompt = JSON.parse(chairSynthesisModelPrompt(prompt)) as {
      ownershipContract: {
        maxSectionsPerSentence: number;
        ledger: readonly {
          sentenceId: string;
          eligibleSectionKeys: readonly string[];
        }[];
      };
      primaryClaimOwnershipContract: {
        maxPrimarySectionsPerClaim: number;
        ledger: readonly {
          claimId: string;
          eligiblePrimarySentenceIds: readonly string[];
          eligibleSectionKeys: readonly string[];
        }[];
      };
      decisionRoleOwnershipContract: {
        decisiveSentenceIds: readonly string[];
        countercaseSentenceIds: readonly string[];
        falsifierSentenceIds: readonly string[];
      };
      teamConflictContract: {
        detected: boolean;
        targetSectionKey: string;
        conflictAdjudicationRequired: boolean;
        allowedDepartmentDecisionSentenceIds: readonly string[];
        requiredOwnedPositionSentenceIds: readonly string[];
        requiredDepartmentDecisionSentenceIds: readonly string[];
        reasonSentenceRule: string;
        allowedReasonSentenceIds: readonly string[];
        nullSectionKeys: readonly string[];
      };
      directionalBriefContract: {
        allowedStances: readonly string[];
        requiredStance: string;
        requiredConfidence: string;
        primarySectionKey: string;
        allowedPrimaryClaimIds: readonly string[];
        roles: {
          decisive: {
            allowedSentenceIds: readonly string[];
            assignedSentenceId: string;
            canonicalText: { en: string; ko: string };
          };
          countercase: {
            allowedSentenceIds: readonly string[];
            assignedSentenceId: string;
            canonicalText: { en: string; ko: string };
          };
          falsifier: {
            allowedSentenceIds: readonly string[];
            assignedSentenceId: string;
            canonicalText: { en: string; ko: string };
          };
        };
        requiredPrimarySentenceIds: readonly string[];
        requiredPrimaryClaimIds: readonly string[];
        distinctRoleSentenceIds: boolean;
        forbiddenHedgeClassifierCodes: readonly string[];
      };
      sectionPrimaryAssignments: readonly {
        sectionKey: string;
        primarySentenceId: string;
        primaryClaimIds: readonly string[];
      }[];
    };

    expect(modelPrompt.ownershipContract.maxSectionsPerSentence).toBe(1);
    expect(modelPrompt.ownershipContract.ledger).toHaveLength(
      prompt.sentences.length,
    );
    expect(
      new Set(
        modelPrompt.ownershipContract.ledger.map((entry) => entry.sentenceId),
      ).size,
    ).toBe(prompt.sentences.length);
    expect(
      modelPrompt.ownershipContract.ledger.every(
        (entry) => entry.eligibleSectionKeys.length > 0,
      ),
    ).toBe(true);
    expect(
      modelPrompt.primaryClaimOwnershipContract.maxPrimarySectionsPerClaim,
    ).toBe(1);
    expect(modelPrompt.primaryClaimOwnershipContract.ledger).toHaveLength(
      prompt.auditedClaimIds.length,
    );
    expect(
      new Set(
        modelPrompt.primaryClaimOwnershipContract.ledger.map(
          (entry) => entry.claimId,
        ),
      ).size,
    ).toBe(prompt.auditedClaimIds.length);
    expect(
      modelPrompt.primaryClaimOwnershipContract.ledger.every(
        (entry) =>
          entry.eligiblePrimarySentenceIds.length > 0 &&
          entry.eligibleSectionKeys.length > 0,
      ),
    ).toBe(true);
    expect(
      modelPrompt.decisionRoleOwnershipContract.decisiveSentenceIds,
    ).toEqual(
      prompt.sentences
        .filter((sentence) => sentence.kind === "claim")
        .map((sentence) => sentence.sentenceId),
    );
    expect(
      modelPrompt.decisionRoleOwnershipContract.countercaseSentenceIds,
    ).toEqual(
      prompt.sentences
        .filter((sentence) => sentence.kind === "dissent")
        .map((sentence) => sentence.sentenceId),
    );
    expect(
      modelPrompt.decisionRoleOwnershipContract.falsifierSentenceIds,
    ).toEqual(
      prompt.sentences
        .filter((sentence) => sentence.kind === "change_condition")
        .map((sentence) => sentence.sentenceId),
    );
    expect(modelPrompt.teamConflictContract).toMatchObject({
      detected: true,
      targetSectionKey: "supported_analysis",
      conflictAdjudicationRequired: true,
    });
    expect(
      modelPrompt.teamConflictContract.allowedDepartmentDecisionSentenceIds,
    ).toEqual(
      prompt.sentences
        .filter(
          (sentence) =>
            sentence.kind === "position" || sentence.kind === "ballot",
        )
        .map((sentence) => sentence.sentenceId),
    );
    const positionIds = prompt.sentences
      .filter((sentence) => sentence.kind === "position")
      .map((sentence) => sentence.sentenceId);
    expect(
      modelPrompt.teamConflictContract.requiredOwnedPositionSentenceIds,
    ).toEqual(positionIds);
    expect(
      modelPrompt.teamConflictContract.requiredDepartmentDecisionSentenceIds,
    ).toEqual(positionIds);
    expect(modelPrompt.teamConflictContract.reasonSentenceRule).toBe(
      "use_primarySentenceId",
    );
    expect(
      modelPrompt.teamConflictContract.allowedReasonSentenceIds.length,
    ).toBeGreaterThan(0);
    expect(modelPrompt.teamConflictContract.nullSectionKeys).not.toContain(
      "supported_analysis",
    );
    expect(modelPrompt.directionalBriefContract).toMatchObject({
      allowedStances: ["upside_skewed", "wait_for_proof", "downside_skewed"],
      requiredStance: "wait_for_proof",
      requiredConfidence: "medium",
      primarySectionKey: "ten_second_brief",
      distinctRoleSentenceIds: true,
      forbiddenHedgeClassifierCodes: ["symmetric_hedge"],
    });
    expect(modelPrompt.directionalBriefContract.allowedPrimaryClaimIds).toEqual(
      prompt.auditedClaimIds,
    );
    expect(
      Object.values(modelPrompt.directionalBriefContract.roles).every(
        (role) => role.allowedSentenceIds.length > 0,
      ),
    ).toBe(true);
    expect(
      modelPrompt.directionalBriefContract.roles.decisive.assignedSentenceId,
    ).toBe(`claim:${prompt.auditedClaimIds[0]}`);
    expect(
      modelPrompt.directionalBriefContract.roles.countercase.assignedSentenceId,
    ).toBe(`dissent:${prompt.dissentClaimIds[0]}`);
    expect(
      modelPrompt.directionalBriefContract.roles.falsifier.assignedSentenceId,
    ).toBe(`change_condition:${prompt.changeConditionClaimIds[0]}`);
    expect(
      modelPrompt.directionalBriefContract.roles.decisive.canonicalText,
    ).toEqual(
      prompt.sentences.find(
        (sentence) =>
          sentence.sentenceId ===
          modelPrompt.directionalBriefContract.roles.decisive
            .assignedSentenceId,
      )?.text,
    );
    expect(
      modelPrompt.directionalBriefContract.requiredPrimarySentenceIds,
    ).toEqual([`claim:${prompt.auditedClaimIds[0]}`]);
    expect(
      modelPrompt.directionalBriefContract.requiredPrimaryClaimIds,
    ).toEqual([prompt.auditedClaimIds[0]]);
    expect(modelPrompt.sectionPrimaryAssignments).toHaveLength(6);
    expect(
      new Set(
        modelPrompt.sectionPrimaryAssignments.map(
          (assignment) => assignment.primarySentenceId,
        ),
      ).size,
    ).toBe(6);
    const assignedClaimIds = modelPrompt.sectionPrimaryAssignments.flatMap(
      (assignment) => assignment.primaryClaimIds,
    );
    expect(new Set(assignedClaimIds).size).toBe(assignedClaimIds.length);

    const promptJson = JSON.stringify(prompt);
    const projection = projectChairAssignments(promptJson, candidate);
    if (projection === undefined)
      throw new TypeError("chair assignment projection fixture failed");
    const accepted = ChairSynthesisOutputSchema.parse(
      validChairCandidate(promptJson, projection.candidate),
    );
    const ownedSentenceIds = accepted.sections.flatMap(
      (section) => section.sentenceIds,
    );
    expect(new Set(ownedSentenceIds).size).toBe(ownedSentenceIds.length);
    expect(accepted.decisionBrief).toMatchObject({
      decisiveSentenceId:
        modelPrompt.directionalBriefContract.roles.decisive.assignedSentenceId,
      countercaseSentenceId:
        modelPrompt.directionalBriefContract.roles.countercase
          .assignedSentenceId,
      falsifierSentenceId:
        modelPrompt.directionalBriefContract.roles.falsifier.assignedSentenceId,
    });
    expect(
      accepted.sections.every(
        (section) =>
          /\p{Script=Latin}/u.test(section.publicSummary.en) &&
          /\p{Script=Hangul}/u.test(section.publicSummary.ko) &&
          section.publicSummary.en
            .normalize("NFKC")
            .toLocaleLowerCase("und") !==
            section.publicSummary.ko.normalize("NFKC").toLocaleLowerCase("und"),
      ),
    ).toBe(true);
  });

  it("fails closed before launch when six unique section primaries cannot be assigned", () => {
    const { prompt } = mixedClaimValidationFixture();

    expect(() =>
      chairSynthesisModelPrompt({
        ...prompt,
        sentences: prompt.sentences.slice(0, 1),
      }),
    ).toThrow("chair_primary_assignment_incomplete");
  });

  it("repairs an invalid directional brief during deterministic assignment projection", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      decisionBrief: {
        ...candidate.decisionBrief,
        decisiveReason: { en: "Generic outlook.", ko: "일반적 전망입니다." },
        strongestCountercase: {
          en: "Generic outlook.",
          ko: "일반적 전망입니다.",
        },
        falsifier: { en: "Generic outlook.", ko: "일반적 전망입니다." },
      },
    };

    const projection = projectChairAssignments(JSON.stringify(prompt), invalid);
    expect(projection).toBeDefined();
    if (projection === undefined) return;
    expect(
      validChairCandidate(JSON.stringify(prompt), projection.candidate),
    ).not.toEqual({});
    expect(
      new Set(
        [
          projection.candidate.decisionBrief.decisiveReason,
          projection.candidate.decisionBrief.strongestCountercase,
          projection.candidate.decisionBrief.falsifier,
        ].map((value) => `${value.en}\n${value.ko}`),
      ).size,
    ).toBe(3);
  });

  it("deduplicates model-selected evidence across projected sections", () => {
    const { prompt, candidate, claimB } = mixedClaimValidationFixture();
    const duplicatedSentenceId = `dissent:${claimB}`;
    const duplicated = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "dissent_unknowns"
          ? {
              ...section,
              sentenceIds: [...section.sentenceIds, duplicatedSentenceId],
            }
          : section,
      ),
    };

    const projection = projectChairAssignments(
      JSON.stringify(prompt),
      duplicated,
    );
    expect(projection).toBeDefined();
    if (projection === undefined) return;
    const owned = projection.candidate.sections.flatMap(
      (section) => section.sentenceIds,
    );
    expect(new Set(owned).size).toBe(owned.length);
    expect(
      projection.candidate.sections.find(
        (section) => section.sectionKey === "dissent_unknowns",
      )?.sentenceIds,
    ).not.toContain(duplicatedSentenceId);
  });

  it("drops section-ineligible evidence during deterministic projection", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const claim = prompt.sentences.find(
      (sentence) => sentence.kind === "claim",
    );
    if (claim === undefined) throw new TypeError("missing claim fixture");
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "change_conditions"
          ? {
              ...section,
              sentenceIds: [...section.sentenceIds, claim.sentenceId],
            }
          : section,
      ),
    };

    const projection = projectChairAssignments(JSON.stringify(prompt), invalid);
    expect(projection).toBeDefined();
    expect(
      projection?.candidate.sections.find(
        (section) => section.sectionKey === "change_conditions",
      )?.sentenceIds,
    ).not.toContain(claim.sentenceId);
    expect(
      validChairCandidate(JSON.stringify(prompt), projection?.candidate),
    ).not.toEqual({});
  });

  it("fails closed before launch when an exact directional role is unavailable", () => {
    const { prompt } = mixedClaimValidationFixture();

    expect(() =>
      chairSynthesisModelPrompt({
        ...prompt,
        sentences: prompt.sentences.filter(
          (sentence) =>
            sentence.kind !== "dissent" && sentence.kind !== "change_condition",
        ),
      }),
    ).toThrow("chair_directional_assignment_incomplete");
  });

  it("requires every chair section property in the strict model schema", () => {
    const document = schemaDocument(ChairSynthesisModelOutputSchema) as Record<
      string,
      any
    >;

    expect(document["properties"]["sections"]["items"]["required"]).toContain(
      "conflictAdjudication",
    );
    expect(
      document["properties"]["decisionBrief"]["properties"]["teamAssessment"],
    ).toBeUndefined();
  });

  it("preserves authenticated ballot and citation IDs while rejecting grounded-number failure", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const forged = {
      ...candidate,
      sourceArtifactIds: ["99999999-9999-4999-8999-999999999999"],
      ballotArtifactIds: [
        "99999999-9999-4999-8999-999999999991",
        "99999999-9999-4999-8999-999999999992",
        "99999999-9999-4999-8999-999999999993",
        "99999999-9999-4999-8999-999999999994",
      ],
    };
    const unsupportedNumber = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? {
              ...section,
              publicSummary: {
                en: `${section.publicSummary.en} 999%`,
                ko: `${section.publicSummary.ko} 999%`,
              },
            }
          : section,
      ),
    };

    // When
    const authenticated = ChairSynthesisOutputSchema.parse(
      validChairCandidate(JSON.stringify(prompt), forged),
    );
    const rejected = validChairCandidate(
      JSON.stringify(prompt),
      unsupportedNumber,
    );

    // Then
    expect(authenticated.sourceArtifactIds).toEqual(prompt.sourceArtifactIds);
    expect(authenticated.ballotArtifactIds).toEqual(
      prompt.ballots.map((ballot) => ballot.artifactId),
    );
    expect(rejected).toEqual({});
  });

  it("fails closed when a draft omits a section instead of cloning one", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const incomplete = {
      ...candidate,
      sections: candidate.sections.filter(
        (section) => section.sectionKey !== "operational_scenarios",
      ),
    };

    // When
    const repaired = repairChairCandidate(JSON.stringify(prompt), incomplete);

    // Then
    expect(repaired).toEqual({});
  });

  it("merges exactly one valid targeted rewrite into a partial candidate", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const missing = candidate.sections.find(
      (section) => section.sectionKey === "operational_scenarios",
    );
    if (missing === undefined)
      throw new TypeError("missing rewrite fixture section");
    const incomplete = {
      ...candidate,
      sections: candidate.sections.filter(
        (section) => section.sectionKey !== missing.sectionKey,
      ),
    };
    const rewrite = {
      kind: "chair_section_rewrite",
      section: {
        sectionKey: missing.sectionKey,
        publicSummary: missing.publicSummary,
        primarySentenceId: missing.primarySentenceId,
        sentenceIds: missing.sentenceIds,
        conflictAdjudication: null,
      },
    };

    // When
    const issue = chairCandidateIssue(JSON.stringify(prompt), incomplete);
    const repaired = repairChairCandidate(
      JSON.stringify(prompt),
      incomplete,
      rewrite,
    );

    // Then
    expect(issue).toEqual({
      sectionKey: "operational_scenarios",
      reason: "missing_section",
    });
    expect(ChairSynthesisOutputSchema.parse(repaired).sections).toHaveLength(6);
  });

  it("moves a targeted repair to the next invalid section", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const supported = candidate.sections.find(
      (section) => section.sectionKey === "supported_analysis",
    );
    const valuation = candidate.sections.find(
      (section) => section.sectionKey === "valuation_comparison",
    );
    if (
      supported?.conflictAdjudication === undefined ||
      valuation === undefined
    )
      throw new TypeError("missing sequential repair fixture");
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) => {
        if (section.sectionKey === "supported_analysis")
          return {
            ...section,
            conflictAdjudication: {
              ...supported.conflictAdjudication,
              reasonSentenceId: "sentence:not-owned",
            },
          };
        if (section.sectionKey === "valuation_comparison")
          return {
            ...section,
            publicSummary: {
              en: "Buy now.",
              ko: "지금 매수.",
            },
          };
        return section;
      }),
    };
    const promptJson = JSON.stringify(prompt);
    const rewriteSection = (section: (typeof candidate.sections)[number]) => ({
      sectionKey: section.sectionKey,
      publicSummary: section.publicSummary,
      primarySentenceId: section.primarySentenceId,
      sentenceIds: section.sentenceIds,
      conflictAdjudication: section.conflictAdjudication ?? null,
    });

    expect(chairCandidateIssue(promptJson, invalid)).toEqual({
      sectionKey: "supported_analysis",
      reason: "team_conflict_not_adjudicated",
    });
    const afterConflict = nextChairSectionRewrite(promptJson, invalid, {
      kind: "chair_section_rewrite",
      section: rewriteSection(supported),
    });
    expect(afterConflict?.issue).toEqual({
      sectionKey: "valuation_comparison",
      reason: "invalid_bilingual_summary",
    });
    expect(
      nextChairSectionRewrite(promptJson, afterConflict?.originalCandidate, {
        kind: "chair_section_rewrite",
        section: rewriteSection(valuation),
      }),
    ).toBeUndefined();
  });

  it("repairs only the bilingual leaf while preserving sentence ownership", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const original = candidate.sections.find(
      (section) => section.sectionKey === "ten_second_brief",
    );
    if (original === undefined) throw new TypeError("missing brief fixture");
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? {
              ...section,
              publicSummary: {
                en: section.publicSummary.en,
                ko: "검증되지않은표현",
              },
            }
          : section,
      ),
    };
    const rewrite = {
      kind: "chair_section_rewrite",
      section: {
        sectionKey: original.sectionKey,
        publicSummary: original.publicSummary,
        primarySentenceId: original.primarySentenceId,
        sentenceIds: original.sentenceIds,
        conflictAdjudication: original.conflictAdjudication ?? null,
      },
    };

    expect(chairCandidateIssue(JSON.stringify(prompt), invalid)).toEqual({
      sectionKey: "ten_second_brief",
      reason: "invalid_bilingual_summary",
    });
    expect(
      ChairSynthesisOutputSchema.parse(
        repairChairCandidate(JSON.stringify(prompt), invalid, rewrite),
      ).sections,
    ).toHaveLength(6);
    const structurallyDriftedRewrite = ChairSynthesisOutputSchema.parse(
      repairChairCandidate(JSON.stringify(prompt), invalid, {
        ...rewrite,
        section: {
          ...rewrite.section,
          primarySentenceId: "sentence:not-preserved",
          sentenceIds: ["sentence:not-preserved"],
        },
      }),
    ).sections.find((section) => section.sectionKey === "ten_second_brief");
    expect(structurallyDriftedRewrite?.primarySentenceId).toBe(
      original.primarySentenceId,
    );
    expect(structurallyDriftedRewrite?.sentenceIds).toEqual(
      original.sentenceIds,
    );
  });

  it("uses approved section evidence when a bilingual leaf rewrite is still invalid", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const original = candidate.sections.find(
      (section) => section.sectionKey === "ten_second_brief",
    );
    if (original === undefined) throw new TypeError("missing brief fixture");
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? {
              ...section,
              publicSummary: { en: "Abstract output", ko: "추상 결론" },
            }
          : section,
      ),
    };
    const rewrite = {
      kind: "chair_section_rewrite",
      section: {
        sectionKey: original.sectionKey,
        publicSummary: { en: "Another abstraction", ko: "또 다른 추상 결론" },
        primarySentenceId: original.primarySentenceId,
        sentenceIds: original.sentenceIds,
        conflictAdjudication: original.conflictAdjudication ?? null,
      },
    };

    const repairedRaw = repairChairCandidate(
      JSON.stringify(prompt),
      invalid,
      rewrite,
    );
    const repaired = ChairSynthesisOutputSchema.parse(repairedRaw);
    const brief = repaired.sections.find(
      (section) => section.sectionKey === "ten_second_brief",
    );

    expect(brief?.publicSummary.en).toBe("Claim A Dissent B Change B");
    expect(brief?.publicSummary.ko).toBe("주장 A 반대 B 변경 B");
  });

  it("keeps a conflicted team section publishable when its prose rewrite remains invalid", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const original = candidate.sections.find(
      (section) => section.sectionKey === "supported_analysis",
    );
    if (original === undefined) throw new TypeError("missing support fixture");
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === original.sectionKey
          ? {
              ...section,
              publicSummary: { en: "Abstract output", ko: "추상 결론" },
            }
          : section,
      ),
    };
    const rewrite = {
      kind: "chair_section_rewrite",
      section: {
        sectionKey: original.sectionKey,
        publicSummary: { en: "Another abstraction", ko: "또 다른 추상 결론" },
        primarySentenceId: original.primarySentenceId,
        sentenceIds: original.sentenceIds,
        conflictAdjudication: original.conflictAdjudication ?? null,
      },
    };
    const primary = prompt.sentences.find(
      (sentence) => sentence.sentenceId === original.primarySentenceId,
    );
    if (primary === undefined) throw new TypeError("missing support primary");
    const groundedCandidate = {
      ...candidate,
      sections: [
        ...candidate.sections.filter(
          (section) => section.sectionKey !== original.sectionKey,
        ),
        { ...original, publicSummary: primary.text },
      ],
    };

    expect(chairCandidateIssue(JSON.stringify(prompt), invalid)).toEqual({
      sectionKey: "supported_analysis",
      reason: "invalid_bilingual_summary",
    });

    expect(
      chairCandidateIssue(JSON.stringify(prompt), groundedCandidate),
    ).toBeUndefined();

    const repaired = ChairSynthesisOutputSchema.parse(
      repairChairCandidate(JSON.stringify(prompt), invalid, rewrite),
    );
    const support = repaired.sections.find(
      (section) => section.sectionKey === "supported_analysis",
    );

    expect(support?.conflictAdjudication).toBeDefined();
    expect(support?.publicSummary.en).not.toBe("Another abstraction");
    expect(support?.publicSummary.ko).not.toBe("또 다른 추상 결론");
  });

  it("fails closed when a targeted rewrite still uses a foreign sentence", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "change_conditions"
          ? { ...section, sentenceIds: ["sentence:not-in-catalog"] }
          : section,
      ),
    };

    // When
    const repaired = repairChairCandidate(JSON.stringify(prompt), invalid);

    // Then
    expect(repaired).toEqual({});
  });

  it("rejects duplicate section keys", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "operational_scenarios"
          ? { ...section, sectionKey: "supported_analysis" }
          : section,
      ),
    };

    // When
    const accepted = validChairCandidate(JSON.stringify(prompt), invalid);

    // Then
    expect(accepted).toEqual({});
  });

  it("rejects one sentence owned by two sections", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const briefSentenceId = candidate.sections[0]?.sentenceIds[0];
    if (briefSentenceId === undefined)
      throw new TypeError("missing brief sentence");
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "supported_analysis"
          ? {
              ...section,
              sentenceIds: [...section.sentenceIds, briefSentenceId],
            }
          : section,
      ),
    };

    // When
    const accepted = validChairCandidate(JSON.stringify(prompt), invalid);

    // Then
    expect(accepted).toEqual({});
  });

  it("rejects a model-selected primary that differs from the deterministic assignment", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? { ...section, primarySentenceId: section.sentenceIds[1] }
          : section,
      ),
    };

    expect(chairCandidateIssue(JSON.stringify(prompt), invalid)).toEqual({
      sectionKey: "ten_second_brief",
      reason: "primary_assignment_mismatch",
    });
  });

  it("rejects a symmetric generic hedge brief", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? {
              ...section,
              publicSummary: {
                en: "Claim A could rise but could fall.",
                ko: "주장 A는 오를 수도 있지만 내릴 수도 있습니다.",
              },
            }
          : section,
      ),
    };

    // When
    const accepted = validChairCandidate(JSON.stringify(prompt), invalid);

    // Then
    expect(accepted).toEqual({});
  });

  it.each([
    {
      en: "Claim A has equal upside and downside",
      ko: "주장 A의 상방과 하방은 동일합니다",
    },
    {
      en: "Claim A risks and rewards are balanced",
      ko: "주장 A의 기회와 위험은 균형입니다",
    },
  ])("rejects normalized symmetric balance language", (publicSummary) => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? { ...section, publicSummary }
          : section,
      ),
    };

    expect(chairCandidateIssue(JSON.stringify(prompt), invalid)).toEqual({
      sectionKey: "ten_second_brief",
      reason: "symmetric_hedge",
    });
  });

  it("requires typed adjudication across at least two department decisions", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) => {
        if (section.sectionKey !== "supported_analysis") return section;
        const { conflictAdjudication: _omitted, ...proseOnly } = section;
        return proseOnly;
      }),
    };

    expect(chairCandidateIssue(JSON.stringify(prompt), invalid)).toEqual({
      sectionKey: "supported_analysis",
      reason: "team_conflict_not_adjudicated",
    });
  });

  it("keeps conflict adjudication null outside the detected conflict section", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const supported = candidate.sections.find(
      (section) => section.sectionKey === "supported_analysis",
    );
    if (supported?.conflictAdjudication === undefined)
      throw new TypeError("missing conflict fixture");
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "valuation_comparison"
          ? {
              ...section,
              conflictAdjudication: supported.conflictAdjudication,
            }
          : section,
      ),
    };

    expect(chairCandidateIssue(JSON.stringify(prompt), invalid)).toEqual({
      sectionKey: "valuation_comparison",
      reason: "unexpected_conflict_adjudication",
    });
  });

  it("accepts null adjudication when ballots and the dissent ledger show no team conflict", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const noConflictPrompt = {
      ...prompt,
      dissentClaimIds: [],
    };
    const noConflictCandidate = {
      ...candidate,
      decisionBrief: {
        ...candidate.decisionBrief,
        stance: "upside_skewed",
        confidence: "high",
      },
      sections: candidate.sections.map((section) =>
        section.sectionKey === "supported_analysis"
          ? { ...section, conflictAdjudication: null }
          : section,
      ),
    };

    expect(
      chairCandidateIssue(
        JSON.stringify(noConflictPrompt),
        noConflictCandidate,
      ),
    ).toBeUndefined();
  });

  it("assigns a distinct challenge as countercase when the first dissent echoes the decisive claim", () => {
    const { prompt } = mixedClaimValidationFixture();
    const sourceArtifactId = prompt.sourceArtifactIds[0];
    if (sourceArtifactId === undefined) throw new TypeError("missing source");
    const promptWithChallenge = {
      ...prompt,
      sentences: [
        ...prompt.sentences,
        {
          sentenceId: "dissent:challenge:valuation",
          kind: "dissent" as const,
          claimIds: [],
          sourceArtifactIds: [sourceArtifactId],
          text: {
            en: "A higher multiple leaves the thesis exposed if earnings delivery slows.",
            ko: "이익 실행이 둔화되면 높은 멀티플이 투자 논리를 흔들 수 있습니다.",
          },
        },
      ],
    };
    const modelPrompt = JSON.parse(
      chairSynthesisModelPrompt(promptWithChallenge),
    ) as {
      directionalBriefContract: {
        roles: { countercase: { assignedSentenceId: string } };
      };
    };

    expect(
      modelPrompt.directionalBriefContract.roles.countercase.assignedSentenceId,
    ).toBe("dissent:challenge:valuation");
  });

  it("skips a challenge whose English leaf is not actually English", () => {
    const { prompt } = mixedClaimValidationFixture();
    const sourceArtifactId = prompt.sourceArtifactIds[0];
    if (sourceArtifactId === undefined) throw new TypeError("missing source");
    const validDissent = prompt.sentences.find(
      (sentence) => sentence.kind === "dissent",
    );
    if (validDissent === undefined) throw new TypeError("missing dissent");
    const promptWithInvalidChallenge = {
      ...prompt,
      sentences: [
        ...prompt.sentences,
        {
          sentenceId: "dissent:challenge:wrong-locale",
          kind: "dissent" as const,
          claimIds: [],
          sourceArtifactIds: [sourceArtifactId],
          text: {
            en: "영문 필드에 들어간 한국어 반론입니다.",
            ko: "영문 필드에 들어간 한국어 반론입니다.",
          },
        },
      ],
    };
    const modelPrompt = JSON.parse(
      chairSynthesisModelPrompt(promptWithInvalidChallenge),
    ) as {
      directionalBriefContract: {
        roles: { countercase: { assignedSentenceId: string } };
      };
    };

    expect(
      modelPrompt.directionalBriefContract.roles.countercase.assignedSentenceId,
    ).toBe(validDissent.sentenceId);
  });

  it("rejects duplicated decision components after editorial normalization", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const duplicatePrompt = {
      ...prompt,
      sentences: prompt.sentences.map((sentence) =>
        sentence.kind === "dissent"
          ? { ...sentence, text: { en: "Claim A", ko: "주장 A" } }
          : sentence,
      ),
    };
    const invalid = {
      ...candidate,
      decisionBrief: {
        ...candidate.decisionBrief,
        strongestCountercase: { en: "Claim A", ko: "주장 A" },
      },
    };

    expect(
      chairCandidateIssue(JSON.stringify(duplicatePrompt), invalid),
    ).toEqual({
      sectionKey: "ten_second_brief",
      reason: "decision_components_not_distinct",
    });
  });

  it("rejects a countercase or falsifier sourced from the wrong sentence role", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      decisionBrief: {
        ...candidate.decisionBrief,
        countercaseSentenceId: candidate.decisionBrief.decisiveSentenceId,
      },
    };

    expect(chairCandidateIssue(JSON.stringify(prompt), invalid)).toEqual({
      sectionKey: "ten_second_brief",
      reason: "invalid_directional_brief",
    });
  });

  it("rejects confidence that does not match the authenticated conflict", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      decisionBrief: { ...candidate.decisionBrief, confidence: "high" },
    };

    // When
    const accepted = validChairCandidate(JSON.stringify(prompt), invalid);

    // Then
    expect(accepted).toEqual({});
  });

  it("rejects a number absent from the owned evidence", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? {
              ...section,
              publicSummary: {
                en: `${section.publicSummary.en} 777%`,
                ko: `${section.publicSummary.ko} 777%`,
              },
            }
          : section,
      ),
    };

    // When
    const accepted = validChairCandidate(JSON.stringify(prompt), invalid);

    // Then
    expect(accepted).toEqual({});
  });

  it("accepts exact source-locale mirrors from the single-language boundary", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const hydrated = {
      ...candidate,
      sections: candidate.sections.map((section) => ({
        ...section,
        publicSummary: {
          en: section.publicSummary.en,
          ko: section.publicSummary.en,
        },
      })),
    };

    // When
    const accepted = validChairCandidate(JSON.stringify(prompt), hydrated);

    // Then
    expect(ChairSynthesisOutputSchema.parse(accepted).kind).toBe(
      "chair_synthesis",
    );
  });

  it("rejects punctuation-only locale copies and accepts substantive bilingual text", () => {
    const { prompt, candidate } = mixedClaimValidationFixture();
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "ten_second_brief"
          ? {
              ...section,
              publicSummary: {
                en: "Claim A Dissent B Change B",
                ko: "  CLAIM—A, DISSENT B; CHANGE B! ",
              },
            }
          : section,
      ),
    };

    expect(validChairCandidate(JSON.stringify(prompt), invalid)).toEqual({});
    expect(
      ChairSynthesisOutputSchema.parse(
        validChairCandidate(JSON.stringify(prompt), candidate),
      ).kind,
    ).toBe("chair_synthesis");
  });

  it("does not restore an unselected prompt unknown", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const extraUnknownId = "77777777-7777-4777-8777-777777777777";
    const expandedPrompt = {
      ...prompt,
      unknownIds: [...prompt.unknownIds, extraUnknownId],
      sentences: [
        ...prompt.sentences,
        {
          sentenceId: `unknown:${extraUnknownId}`,
          kind: "unknown" as const,
          claimIds: [],
          sourceArtifactIds: [prompt.sourceArtifactIds[0]],
          text: { en: "Unselected unknown", ko: "선택되지 않은 미확인" },
        },
      ],
    };

    // When
    const accepted = ChairSynthesisOutputSchema.parse(
      validChairCandidate(JSON.stringify(expandedPrompt), candidate),
    );

    // Then
    expect(accepted.unknowns).toEqual(candidate.unknowns);
  });

  it("rejects a sentence whose claim was not adjudicated", () => {
    // Given
    const { prompt, candidate } = mixedClaimValidationFixture();
    const removedClaimId = "88888888-8888-4888-8888-888888888888";
    const foreignSentence = {
      sentenceId: `claim:${removedClaimId}`,
      kind: "claim" as const,
      claimIds: [removedClaimId],
      sourceArtifactIds: [prompt.sourceArtifactIds[0]],
      text: { en: "Removed claim", ko: "제거된 주장" },
    };
    const expandedPrompt = {
      ...prompt,
      sentences: [...prompt.sentences, foreignSentence],
    };
    const invalid = {
      ...candidate,
      sections: candidate.sections.map((section) =>
        section.sectionKey === "supported_analysis"
          ? { ...section, sentenceIds: [foreignSentence.sentenceId] }
          : section,
      ),
    };

    // When
    const accepted = validChairCandidate(
      JSON.stringify(expandedPrompt),
      invalid,
    );

    // Then
    expect(accepted).toEqual({});
  });
});
