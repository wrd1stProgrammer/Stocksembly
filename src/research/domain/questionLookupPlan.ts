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
const FINANCIAL_TERM =
  /\b(?:NTM|LTM|TTM|EPS|EBITDA|EBIT|FCF|ROE|ROIC|PER|PBR|P\/E|EV\/EBITDA|DCF|WACC|CAGR|DSO)\b|(?:잉여현금흐름|주당순이익|주가수익비율|자기자본이익률|할인율)/iu;
const DEFINITION_INTENT =
  /\b(?:what (?:is|are|does)|mean|means|definition|define|explain|stand for)\b|(?:뭐야|뭔가|무엇|뜻|정의|의미|개념|설명)/iu;

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
      useMarketApi ||
      EXTERNAL_LOOKUP.test(text) ||
      (FINANCIAL_TERM.test(text) && DEFINITION_INTENT.test(text))
        ? "external"
        : "report_only",
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
