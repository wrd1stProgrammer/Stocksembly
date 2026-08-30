import { z } from "zod";

function compactRevenue(value: string): {
  readonly en: string;
  readonly ko: string;
} {
  const amount = Number(value.replaceAll(",", "").trim());
  if (!Number.isFinite(amount) || Math.abs(amount) < 1_000_000)
    return { en: value, ko: value };
  const fractionDigits = Math.abs(amount) >= 10_000_000_000 ? 1 : 2;
  return {
    en: `$${(amount / 1_000_000_000).toFixed(fractionDigits)}B`,
    ko: `US$${(amount / 100_000_000).toFixed(fractionDigits)}억`,
  };
}

function compactDecimal(value: string, unit: "percent" | "USD_per_share") {
  const numeric = Number(value.replaceAll(",", "").trim());
  if (!Number.isFinite(numeric)) return { en: value, ko: value };
  const formatted = numeric.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  const suffix = unit === "percent" ? "%" : "";
  const prefix = unit === "USD_per_share" ? "$" : "";
  return {
    en: `${prefix}${formatted}${suffix}`,
    ko: `${prefix}${formatted}${suffix}`,
  };
}

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
    const value =
      field.data === "revenue"
        ? compactRevenue(scenario.value)
        : field.data === "operating_margin"
          ? compactDecimal(scenario.value, "percent")
          : compactDecimal(scenario.value, "USD_per_share");
    return [
      {
        id: `scenario:${index + 1}:${scenario.field}`,
        text: {
          en: `${label.en}: ${value.en}`,
          ko: `${label.ko}: ${value.ko}`,
        },
      },
    ];
  });
  return scenarios.length === inputs.length ? scenarios : undefined;
}

export function recoverChairScenarioSentences(
  inputs: readonly { readonly field: string; readonly value: string }[],
) {
  const sentences: NonNullable<
    ReturnType<typeof chairScenarioSentences>
  >[number][] = [];
  const repairAttempts: { readonly itemId: string; readonly attempts: 1 }[] =
    [];
  const omissions: {
    readonly itemId: string;
    readonly reason:
      | "scenario_invalid_after_repair"
      | "scenario_limit_exceeded";
  }[] = [];
  for (const [index, initial] of inputs.entries()) {
    const itemId = `scenario:${index + 1}`;
    if (sentences.length >= 2) {
      omissions.push({ itemId, reason: "scenario_limit_exceeded" });
      continue;
    }
    const direct = chairScenarioSentences([initial]);
    if (direct !== undefined) {
      const sentence = direct[0];
      if (sentence !== undefined)
        sentences.push({ ...sentence, id: `${itemId}:${initial.field}` });
      continue;
    }
    repairAttempts.push({ itemId, attempts: 1 });
    const repaired = { field: initial.value, value: initial.field };
    const recovered = chairScenarioSentences([repaired]);
    const sentence = recovered?.[0];
    if (sentence === undefined) {
      omissions.push({ itemId, reason: "scenario_invalid_after_repair" });
      continue;
    }
    sentences.push({ ...sentence, id: `${itemId}:${repaired.field}` });
  }
  return { sentences, repairAttempts, omissions };
}
