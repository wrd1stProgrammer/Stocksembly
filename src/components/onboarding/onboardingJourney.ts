import { z } from "zod";
import { OnboardingStockSchema } from "../../accounts/onboardingInterests";
import type { AppLocale } from "../../lib/i18n";

export const ONBOARDING_RESEARCH_KEY = "stocksembly.onboarding.research";
export const onboardingResearchSchema = z.object({
  stock: OnboardingStockSchema,
  question: z.string().trim().min(1).max(100),
});
export type OnboardingResearch = z.infer<typeof onboardingResearchSchema>;

const translations: Record<
  AppLocale,
  readonly [string, string, string, string, string, string, string, string]
> = {
  en: [
    "Your question",
    "What would you like to know?",
    "Ask one investment question about your chosen company.",
    "Could its growth justify today's valuation?",
    "Start research",
    "Full-agent research requires 10 credits",
    "This is a preview. Your agents are ready. Choose a plan to run a real analysis of your question.",
    "Go to Research Room",
  ],
  ko: [
    "나의 투자 질문",
    "어떤 점이 궁금하세요?",
    "선택한 기업에 대해 확인하고 싶은 투자 질문을 입력해 주세요.",
    "지금의 성장세가 현재 주가를 정당화할까요?",
    "리서치 시작",
    "전체 에이전트 리서치는 10크레딧이 필요해요",
    "지금은 미리보기예요. 에이전트가 준비됐습니다. 플랜을 선택하면 내 질문에 대한 실제 분석을 시작할 수 있어요.",
    "리서치룸 이동",
  ],
  ja: [
    "投資の質問",
    "何を知りたいですか？",
    "選んだ企業について投資の質問を入力してください。",
    "成長は現在の株価を正当化できますか？",
    "リサーチを開始",
    "全エージェントのリサーチには10クレジットが必要です",
    "これはプレビューです。プランを選ぶと、質問について実際の分析を始められます。",
    "リサーチルームへ",
  ],
  "zh-TW": [
    "您的投資問題",
    "您想了解什麼？",
    "輸入您想釐清的企業投資問題。",
    "成長能否支撐目前的估值？",
    "開始研究",
    "全代理研究需要10點",
    "這是預覽。選擇方案後，即可開始真正分析您的問題。",
    "前往研究室",
  ],
  es: [
    "Tu pregunta",
    "¿Qué te gustaría saber?",
    "Escribe una pregunta de inversión sobre la empresa elegida.",
    "¿Su crecimiento justifica la valoración actual?",
    "Iniciar análisis",
    "El análisis completo requiere 10 créditos",
    "Esto es una vista previa. Elige un plan para analizar tu pregunta con los agentes.",
    "Ir a Research Room",
  ],
  "pt-BR": [
    "Sua pergunta",
    "O que você gostaria de saber?",
    "Escreva uma pergunta de investimento sobre a empresa escolhida.",
    "O crescimento justifica a avaliação atual?",
    "Iniciar pesquisa",
    "A pesquisa completa requer 10 créditos",
    "Esta é uma prévia. Escolha um plano para iniciar uma análise real da sua pergunta.",
    "Ir para a sala de pesquisa",
  ],
  de: [
    "Deine Frage",
    "Was möchtest du wissen?",
    "Stelle eine Anlagefrage zum ausgewählten Unternehmen.",
    "Rechtfertigt das Wachstum die heutige Bewertung?",
    "Analyse starten",
    "Die vollständige Analyse benötigt 10 Credits",
    "Dies ist eine Vorschau. Wähle einen Tarif, um deine Frage tatsächlich analysieren zu lassen.",
    "Zum Research Room",
  ],
  fr: [
    "Votre question",
    "Que souhaitez-vous savoir ?",
    "Posez une question d’investissement sur l’entreprise choisie.",
    "Sa croissance justifie-t-elle sa valorisation actuelle ?",
    "Lancer la recherche",
    "La recherche complète nécessite 10 crédits",
    "Ceci est un aperçu. Choisissez une offre pour lancer une analyse réelle de votre question.",
    "Aller au Research Room",
  ],
};

export function onboardingJourneyCopy(locale: AppLocale) {
  const [
    eyebrow,
    title,
    description,
    placeholder,
    start,
    gateTitle,
    gateDescription,
    room,
  ] = translations[locale];
  return {
    eyebrow,
    title,
    description,
    placeholder,
    start,
    gateTitle,
    gateDescription,
    room,
  };
}
