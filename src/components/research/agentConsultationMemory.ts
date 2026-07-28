import { z } from "zod";
import type { Locale } from "../../lib/i18n";
import { WorkflowActorIdSchema } from "../../research/domain/roleRegistry";
import type { AgentProfile } from "../../research/types";

const EvidenceSchema = z.strictObject({
  label: z.string(),
  url: z.url().optional(),
  claimId: z.uuid().optional(),
  sourceIds: z.array(z.uuid()).optional(),
});

const ConsultationMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("question"),
    agentId: WorkflowActorIdSchema,
    text: z.string(),
  }),
  z.strictObject({
    id: z.uuid(),
    kind: z.literal("answer"),
    agentId: WorkflowActorIdSchema,
    state: z.enum(["pending", "answered", "failed"]),
    activity: z.enum(["searching", "thinking"]),
    paragraphs: z.array(z.string()),
    evidence: z.array(EvidenceSchema),
    errorCode: z.string().optional(),
  }),
]);

const StoredMessagesSchema = z.array(ConsultationMessageSchema).max(24);

export type ConsultationMessage = z.infer<typeof ConsultationMessageSchema>;

type AskInput = {
  readonly advancedReasoning: boolean;
  readonly agent: AgentProfile;
  readonly question: string;
};

function storageKey(reportId: string): string {
  return `stocksembly:consultation:v2:${reportId}`;
}

function completedMessages(
  messages: readonly ConsultationMessage[],
): readonly ConsultationMessage[] {
  const completed: ConsultationMessage[] = [];
  for (let index = 0; index < messages.length; index += 2) {
    const question = messages[index];
    const answer = messages[index + 1];
    if (
      question?.kind === "question" &&
      answer?.kind === "answer" &&
      answer.state !== "pending"
    )
      completed.push(question, answer);
  }
  return completed.slice(-24);
}

export function loadConsultationMessages(
  reportId: string,
): readonly ConsultationMessage[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(storageKey(reportId));
  if (stored === null) return [];
  try {
    const parsed = StoredMessagesSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : [];
  } catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

export function saveConsultationMessages(
  reportId: string,
  messages: readonly ConsultationMessage[],
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    storageKey(reportId),
    JSON.stringify(completedMessages(messages)),
  );
}

function unique(values: readonly string[], limit: number): readonly string[] {
  return [...new Set(values)].slice(-limit);
}

export function consultationPayload(
  input: AskInput,
  locale: Locale,
  messages: readonly ConsultationMessage[],
): string {
  const completed = completedMessages(messages);
  const recent = completed.slice(-8);
  const older = completed.slice(0, -8);
  return JSON.stringify({
    kind: "specialist_consultation_v1",
    evidenceScope: "intent_routed",
    responseStyle: "professional",
    advancedReasoning: input.advancedReasoning,
    specialist: {
      id: input.agent.id,
      departmentId: input.agent.departmentId,
      name: input.agent.name,
      role: input.agent.role,
      specialty: input.agent.specialty,
    },
    userQuestion: { en: input.question, ko: input.question },
    conversation: recent.map((message) =>
      message.kind === "question"
        ? { role: "user", text: message.text }
        : {
            role: "assistant",
            text: message.paragraphs.join("\n"),
            claimIds: message.evidence.flatMap((item) =>
              item.claimId === undefined ? [] : [item.claimId],
            ),
            sourceIds: unique(
              message.evidence.flatMap((item) => item.sourceIds ?? []),
              12,
            ),
            externalUrls: message.evidence.flatMap((item) =>
              item.url === undefined ? [] : [item.url],
            ),
          },
    ),
    memory: {
      referencedClaimIds: unique(
        completed.flatMap((message) =>
          message.kind === "answer"
            ? message.evidence.flatMap((item) =>
                item.claimId === undefined ? [] : [item.claimId],
              )
            : [],
        ),
        8,
      ),
      priorTopics: older
        .filter((message) => message.kind === "question")
        .slice(-3)
        .map((message) => message.text.slice(0, 120)),
    },
    locale,
  });
}
