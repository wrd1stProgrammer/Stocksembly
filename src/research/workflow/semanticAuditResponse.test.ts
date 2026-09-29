import { expect, it } from "vitest";
import { SemanticAuditModelOutputSchema } from "./semanticAuditContracts";
import { reconcileSemanticAuditResponse } from "./semanticAuditResponse";

const claimId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const questionId = "33333333-3333-4333-8333-333333333333";
const verdict = {
  claimId,
  verdict: "entailed",
  contradictionSeverity: "none",
  publicExplanation: { en: "Supported.", ko: "근거가 있습니다." },
};
const prompt = (questions: unknown[] = [], claims = [{ claimId }]) =>
  JSON.stringify({ kind: "semantic_audit_input_v1", claims, questions });

it("preserves valid verdicts when the model invents q1 for an empty question set", () => {
  const output = {
    kind: "semantic_audit",
    verdicts: [verdict],
    questionCoverage: [
      { questionId: "q1", status: "covered", claimIds: [claimId] },
    ],
  };
  expect(SemanticAuditModelOutputSchema.safeParse(output).success).toBe(false);
  expect(
    SemanticAuditModelOutputSchema.parse(
      reconcileSemanticAuditResponse(prompt(), output),
    ),
  ).toEqual({ ...output, questionCoverage: [] });
});

it("marks malformed or missing claims unassessed without losing valid assessments", () => {
  const output = reconcileSemanticAuditResponse(
    prompt([], [{ claimId }, { claimId: otherId }]),
    {
      kind: "semantic_audit",
      verdicts: [verdict, { claimId: otherId, verdict: "entailed" }],
      questionCoverage: [],
    },
  );
  const parsed = SemanticAuditModelOutputSchema.parse(output);
  expect(parsed.verdicts[0]).toEqual(verdict);
  expect(parsed.verdicts[1]?.verdict).toBe("not_assessable");
});

it("does not approve duplicate verdicts or coverage referencing unassessed claims", () => {
  const parsed = SemanticAuditModelOutputSchema.parse(
    reconcileSemanticAuditResponse(prompt([{ questionId }]), {
      kind: "semantic_audit",
      verdicts: [verdict, { ...verdict, verdict: "contradicted" }],
      questionCoverage: [
        { questionId, status: "covered", claimIds: [claimId, otherId] },
      ],
    }),
  );
  expect(parsed.verdicts[0]?.verdict).toBe("not_assessable");
  expect(parsed.questionCoverage).toEqual([
    { questionId, status: "uncovered", claimIds: [] },
  ]);
});

it("does not reinterpret unrelated prompts or invalid response envelopes", () => {
  expect(reconcileSemanticAuditResponse("test", { supported: true })).toEqual({
    supported: true,
  });
  expect(reconcileSemanticAuditResponse(prompt(), {})).toEqual({});
});
