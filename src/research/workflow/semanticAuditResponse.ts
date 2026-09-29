import { z } from "zod";
import { ClaimIdSchema, QuestionIdSchema } from "../domain/ids";
import { SemanticAuditModelOutputSchema } from "./semanticAuditContracts";

const IdentitySchema = z.object({
  kind: z.literal("semantic_audit_input_v1"),
  claims: z
    .array(z.object({ claimId: ClaimIdSchema }))
    .min(1)
    .max(128),
  questions: z.array(z.object({ questionId: QuestionIdSchema })).max(32),
});
const ResponseSchema = z.object({
  kind: z.literal("semantic_audit"),
  verdicts: z.array(z.unknown()),
  questionCoverage: z.array(z.unknown()).optional(),
});
const VerdictSchema =
  SemanticAuditModelOutputSchema.unwrap().shape.verdicts.unwrap().element;
const CoverageSchema =
  SemanticAuditModelOutputSchema.unwrap().shape.questionCoverage.unwrap()
    .element;

export function reconcileSemanticAuditResponse(
  promptJson: string,
  value: unknown,
): unknown {
  let input: unknown;
  try {
    input = JSON.parse(promptJson);
  } catch {
    return value;
  }
  const identityInput = IdentitySchema.safeParse(input);
  if (!identityInput.success) return value;
  const prompt = identityInput.data;
  const response = ResponseSchema.safeParse(value);
  if (!response.success) return value;
  const identity = (entry: unknown, key: string): unknown =>
    typeof entry === "object" && entry !== null
      ? Reflect.get(entry, key)
      : undefined;
  const verdicts = prompt.claims.map(({ claimId }) => {
    const matches = response.data.verdicts.filter(
      (entry) => identity(entry, "claimId") === claimId,
    );
    const parsed = VerdictSchema.safeParse(
      matches.length === 1 ? matches[0] : undefined,
    );
    return parsed.success
      ? parsed.data
      : {
          claimId,
          verdict: "not_assessable",
          contradictionSeverity: "none",
          publicExplanation: {
            en: "The evidence review did not return a valid assessment for this claim. Treat it as unverified.",
            ko: "이 주장에 대한 유효한 근거 검토 결과를 확보하지 못했습니다. 검증되지 않은 내용입니다.",
          },
        };
  });
  const assessed = new Set(
    verdicts
      .filter(
        (entry) => entry.verdict === "entailed" || entry.verdict === "partial",
      )
      .map((entry) => entry.claimId),
  );
  const questionCoverage = prompt.questions.map(({ questionId }) => {
    const matches = (response.data.questionCoverage ?? []).filter(
      (entry) => identity(entry, "questionId") === questionId,
    );
    const parsed = CoverageSchema.safeParse(
      matches.length === 1 ? matches[0] : undefined,
    );
    if (!parsed.success)
      return { questionId, status: "uncovered", claimIds: [] };
    const claimIds = [
      ...new Set(parsed.data.claimIds.filter((id) => assessed.has(id))),
    ];
    return {
      ...parsed.data,
      claimIds,
      status:
        claimIds.length === 0
          ? "uncovered"
          : claimIds.length < parsed.data.claimIds.length &&
              parsed.data.status === "covered"
            ? "partial"
            : parsed.data.status,
    };
  });
  return { kind: "semantic_audit", verdicts, questionCoverage };
}
