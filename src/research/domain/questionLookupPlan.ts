import { z } from "zod";
import {
  type ExternalAnswerSource,
  ExternalAnswerSourceSchema,
} from "./question";

const ConsultationEnvelopeSchema = z
  .object({
    kind: z.literal("specialist_consultation_v1"),
    userQuestion: z.object({ en: z.string(), ko: z.string() }),
    externalApiEvidence: z.array(ExternalAnswerSourceSchema).max(3).optional(),
  })
  .passthrough();

export type QuestionLookupPlan = {
  readonly mode: "external" | "report_only";
  readonly useMarketApi: boolean;
};

const EXTERNAL_LOOKUP =
  /\b(?:latest|today|now|live|news|announcement|since this report|web search)\b|(?:최신|오늘|지금|실시간|뉴스|새로 나온|회사 발표|리포트 이후|웹 ?검색|검색해)/iu;
const MARKET_API =
  /\b(?:current (?:[\w.-]+ )?(?:stock )?price|live (?:stock )?price|latest quote|market price|trading volume|technical signal|market state)\b|(?:(?:현재|지금)[^\n]{0,20}주가|현재가|실시간 주가|주식 시세|거래량|기술적 신호|장 ?상태)/iu;

function consultationEnvelope(question: {
  readonly en: string;
  readonly ko: string;
}): z.infer<typeof ConsultationEnvelopeSchema> | undefined {
  for (const value of [question.ko, question.en]) {
    try {
      const parsed = ConsultationEnvelopeSchema.safeParse(JSON.parse(value));
      if (parsed.success) return parsed.data;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  return undefined;
}

function questionText(question: {
  readonly en: string;
  readonly ko: string;
}): string {
  const envelope = consultationEnvelope(question);
  return envelope === undefined
    ? `${question.en}\n${question.ko}`
    : `${envelope.userQuestion.en}\n${envelope.userQuestion.ko}`;
}

export function questionLookupPlan(question: {
  readonly en: string;
  readonly ko: string;
}): QuestionLookupPlan {
  const text = questionText(question);
  const useMarketApi = MARKET_API.test(text);
  return {
    mode:
      useMarketApi || EXTERNAL_LOOKUP.test(text) ? "external" : "report_only",
    useMarketApi,
  };
}

export function questionExternalApiEvidence(question: {
  readonly en: string;
  readonly ko: string;
}): readonly ExternalAnswerSource[] {
  return consultationEnvelope(question)?.externalApiEvidence ?? [];
}

export function attachQuestionExternalApiEvidence(
  question: { readonly en: string; readonly ko: string },
  evidence: ExternalAnswerSource,
): { readonly en: string; readonly ko: string } {
  const envelope = consultationEnvelope(question);
  if (envelope === undefined) return question;
  const encoded = JSON.stringify({
    ...envelope,
    externalApiEvidence: [evidence],
  });
  return { en: encoded, ko: encoded };
}
