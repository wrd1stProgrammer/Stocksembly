import { describe, expect, it } from "vitest";
import { hashBytes } from "../domain/contractHelpers";
import { schemaDocument } from "../server/codex/codexArtifacts";
import {
  CHAIR_SECTION_KEYS,
  ChairSynthesisModelOutputSchema,
  ChairSynthesisPromptSchema,
  chairSynthesisModelPrompt,
} from "./chairSynthesisContracts";
import {
  SemanticAuditModelOutputSchema,
  SemanticAuditPromptSchema,
  semanticAuditModelPrompt,
} from "./semanticAuditContracts";

const id = (prefix: number) =>
  `${String(prefix).padStart(8, "0")}-0000-4000-8000-000000000001`;

function hasUntypedAdditionalProperties(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUntypedAdditionalProperties);
  if (typeof value !== "object" || value === null) return false;
  const object = value as Record<string, unknown>;
  const additional = object["additionalProperties"];
  if (
    typeof additional === "object" &&
    additional !== null &&
    !Array.isArray(additional) &&
    !("type" in additional)
  )
    return true;
  return Object.values(object).some(hasUntypedAdditionalProperties);
}

describe("late-stage model prompt compaction", () => {
  it("emits provider-compatible strict output schemas", () => {
    for (const schema of [
      SemanticAuditModelOutputSchema,
      ChairSynthesisModelOutputSchema,
    ]) {
      const document = schemaDocument(schema);
      expect(hasUntypedAdditionalProperties(document)).toBe(false);
    }
  });

  it("deduplicates repeated semantic evidence without changing trusted input", () => {
    const exactText = "Revenue grew 20% while margin reached 30%.".repeat(20);
    const prompt = SemanticAuditPromptSchema.parse({
      kind: "semantic_audit_input_v1",
      structuralAuditHash: "a".repeat(64),
      sourceArtifactIds: [id(1)],
      claims: [2, 3].map((prefix) => ({
        claimId: id(prefix),
        materiality: "material",
        text: { en: `Claim ${prefix}`, ko: `주장 ${prefix}` },
        evidence: [
          {
            artifactId: id(1),
            evidenceId: `evidence-${prefix}`,
            source: "sec_primary_filing",
            retrievedAt: "2026-07-29T00:00:00.000Z",
            availableAt: "2026-07-29T00:00:00.000Z",
            locatorHash: "b".repeat(64),
            span: {
              start: 0,
              end: exactText.length,
              textHash: hashBytes(exactText),
            },
            exactText,
            relation: "supporting",
          },
        ],
      })),
      questions: [],
    });
    const compact = semanticAuditModelPrompt(prompt);

    expect(compact.match(/Revenue grew/gu)).toHaveLength(20);
    expect(compact.length).toBeLessThan(JSON.stringify(prompt).length * 0.75);
    expect(prompt.claims[0]?.evidence[0]?.artifactId).toBe(id(1));
  });

  it("keeps chair copy and selection ids while omitting provenance UUIDs", () => {
    const sentences = ["claim", "position", "ballot", "dissent", "unknown"].map(
      (kind, index) => ({
        sentenceId: `${kind}:${index}`,
        kind,
        claimIds: kind === "unknown" ? [] : [id(2)],
        sourceArtifactIds: [id(1)],
        text: { en: `${kind} text`, ko: `${kind} 문장` },
      }),
    );
    const prompt = ChairSynthesisPromptSchema.parse({
      kind: "chair_synthesis_input_v1",
      mandate: {
        mandateHash: "d".repeat(64),
        question: "What changes the thesis?",
        scope: "broad",
        locale: "ko",
        limitations: [],
      },
      capabilities: [],
      auditedClaimIds: [id(2)],
      departmentPositions: ["market", "company", "financial", "risk"].map(
        (departmentId) => ({ departmentId, artifactId: id(1) }),
      ),
      ballots: ["market", "company", "financial", "risk"].map(
        (departmentId) => ({
          departmentId,
          artifactId: id(1),
          vote: "support",
        }),
      ),
      dissentClaimIds: [id(2)],
      unknownIds: [id(3)],
      scenarioIds: [],
      changeConditionClaimIds: [],
      sourceArtifactIds: [id(1)],
      sentences,
    });
    const compact = chairSynthesisModelPrompt(prompt);

    expect(compact).toContain("What changes the thesis?");
    expect(compact).toContain("claim:0");
    expect(compact).toContain("claim 문장");
    expect(compact).not.toContain("claim text");
    expect(compact).not.toContain(id(1));
    expect(compact.length).toBeLessThan(JSON.stringify(prompt).length * 0.75);
    expect(
      ChairSynthesisModelOutputSchema.safeParse({
        kind: "chair_synthesis",
        sections: CHAIR_SECTION_KEYS.map((sectionKey) => ({
          sectionKey,
          publicSummary: { en: "English", ko: "한국어" },
          sentenceIds: ["claim:0"],
        })),
      }).success,
    ).toBe(false);
  });
});
