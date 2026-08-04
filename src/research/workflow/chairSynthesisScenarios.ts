import { z } from "zod";

export function chairScenarioSentences(
  inputs: readonly { readonly field: string; readonly value: string }[],
):
  | readonly {
      readonly id: string;
      readonly text: { readonly en: string; readonly ko: string };
    }[]
  | undefined {
  const labels = {
    revenue: { en: "Revenue", ko: "매출" },
    operating_margin: { en: "Operating margin", ko: "영업이익률" },
    diluted_eps: { en: "Diluted EPS", ko: "희석 EPS" },
  } as const;
  const scenarios = inputs.flatMap((scenario, index) => {
    const field = z
      .enum(["revenue", "operating_margin", "diluted_eps"])
      .safeParse(scenario.field);
    if (!field.success) return [];
    const label = labels[field.data];
    return [
      {
        id: `scenario:${index + 1}:${scenario.field}`,
        text: {
          en: `${label.en}: ${scenario.value}`,
          ko: `${label.ko}: ${scenario.value}`,
        },
      },
    ];
  });
  return scenarios.length === inputs.length ? scenarios : undefined;
}
