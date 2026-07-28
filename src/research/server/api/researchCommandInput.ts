import { z } from "zod";

const EmptyCommandSchema = z.object({}).strict().readonly();
const FollowUpCommandSchema = z
  .object({ question: z.string().trim().min(1).max(4_000).optional() })
  .strict()
  .readonly();
const QuestionCommandSchema = z
  .object({
    question: z.string().trim().min(1).max(4_000),
    locale: z.enum(["en", "ko"]),
    retryOfQuestionId: z.string().uuid().optional(),
  })
  .strict()
  .readonly();

export type FollowUpCommand = z.infer<typeof FollowUpCommandSchema>;
export type QuestionCommand = z.infer<typeof QuestionCommandSchema>;

export function parseEmptyCommand(input: unknown) {
  return EmptyCommandSchema.safeParse(input);
}

export function parseFollowUpCommand(input: unknown) {
  return FollowUpCommandSchema.safeParse(input);
}

export function parseQuestionCommand(input: unknown) {
  return QuestionCommandSchema.safeParse(input);
}

const NEW_ANALYSIS =
  /\b(?:current|live|latest|today|now|new price|new filing|new evidence)\b|(?:현재|실시간|최신|오늘|새로운 가격|새 공시|새 증거)/iu;

const PublishedReportConsultationSchema = z
  .object({
    kind: z.literal("specialist_consultation_v1"),
    evidenceScope: z.enum(["intent_routed", "published_report_only"]),
  })
  .passthrough();

function isPublishedReportConsultation(question: string): boolean {
  try {
    return PublishedReportConsultationSchema.safeParse(JSON.parse(question))
      .success;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

export function requiresFollowUpResearch(question: string): boolean {
  if (isPublishedReportConsultation(question)) return false;
  return NEW_ANALYSIS.test(question);
}
