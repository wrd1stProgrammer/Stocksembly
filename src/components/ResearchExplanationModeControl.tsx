import type { AppLocale } from "../lib/i18n";
import type { ExplanationMode } from "../research/domain/researchProfile";

const MODE_COPY: Readonly<
  Record<
    AppLocale,
    {
      readonly label: string;
      readonly note: string;
      readonly easy: string;
      readonly professional: string;
    }
  >
> = {
  en: {
    label: "Explanation style",
    note: "Changes wording only. Research depth and evidence stay the same.",
    easy: "Easy",
    professional: "Pro",
  },
  ko: {
    label: "설명 방식",
    note: "표현만 바뀌며 분석 깊이와 근거는 동일합니다.",
    easy: "쉽게 설명",
    professional: "전문 설명",
  },
  ja: {
    label: "説明スタイル",
    note: "表現だけが変わり、分析の深さと根拠は同じです。",
    easy: "やさしく",
    professional: "専門",
  },
  "zh-TW": {
    label: "說明方式",
    note: "只調整表達方式，分析深度與證據維持不變。",
    easy: "簡明",
    professional: "專業",
  },
  es: {
    label: "Estilo de explicación",
    note: "Solo cambia la redacción; el análisis y la evidencia se mantienen.",
    easy: "Claro",
    professional: "Experto",
  },
  "pt-BR": {
    label: "Estilo da explicação",
    note: "Só muda a redação; a análise e as evidências permanecem iguais.",
    easy: "Simples",
    professional: "Técnico",
  },
  de: {
    label: "Erklärstil",
    note: "Nur die Formulierung ändert sich; Analysetiefe und Belege bleiben gleich.",
    easy: "Einfach",
    professional: "Fachlich",
  },
  fr: {
    label: "Style d’explication",
    note: "Seule la formulation change; l’analyse et les sources restent identiques.",
    easy: "Simple",
    professional: "Expert",
  },
};

export function ResearchExplanationModeControl(props: {
  readonly locale: AppLocale;
  readonly value: ExplanationMode;
  readonly onChange: (value: ExplanationMode) => void;
}) {
  const labels = MODE_COPY[props.locale];
  return (
    <fieldset className="research-explanation-mode" title={labels.note}>
      <legend className="sr-only">{labels.label}</legend>
      <span className="research-explanation-mode__label" aria-hidden="true">
        {labels.label}
      </span>
      {(["easy", "professional"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={props.value === mode}
          onClick={() => props.onChange(mode)}
        >
          {labels[mode]}
        </button>
      ))}
    </fieldset>
  );
}
