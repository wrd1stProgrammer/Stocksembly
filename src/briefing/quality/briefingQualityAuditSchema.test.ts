import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BriefingQualityAuditSchema,
  validateBriefingQualityAudit,
} from "./briefingQualityAuditSchema";
import {
  BRIEFING_QUALITY_DIMENSIONS,
  BRIEFING_QUALITY_SYMBOLS,
} from "./briefingQualityRubric";

const pointer = { source: "payload" as const, pointer: "$.sources[0].url" };

function dimension(score: number, maximum: number) {
  const points = maximum - score;

  return {
    score,
    evidence: [pointer],
    deductions:
      points === 0
        ? []
        : [{ points, rationale: "Fixture deduction", evidence: [pointer] }],
  };
}

function dimensions(scores: readonly number[]) {
  return {
    dataArithmetic: dimension(
      scores[0] ?? 0,
      BRIEFING_QUALITY_DIMENSIONS.dataArithmetic.maximum,
    ),
    noveltySourceQuality: dimension(
      scores[1] ?? 0,
      BRIEFING_QUALITY_DIMENSIONS.noveltySourceQuality.maximum,
    ),
    timingBranches: dimension(
      scores[2] ?? 0,
      BRIEFING_QUALITY_DIMENSIONS.timingBranches.maximum,
    ),
    companySectorSpecificity: dimension(
      scores[3] ?? 0,
      BRIEFING_QUALITY_DIMENSIONS.companySectorSpecificity.maximum,
    ),
    proseNonSlop: dimension(
      scores[4] ?? 0,
      BRIEFING_QUALITY_DIMENSIONS.proseNonSlop.maximum,
    ),
    stateContractHonesty: dimension(
      scores[5] ?? 0,
      BRIEFING_QUALITY_DIMENSIONS.stateContractHonesty.maximum,
    ),
  };
}

function auditFor(scoresBySymbol: readonly (readonly number[])[]) {
  return {
    symbols: BRIEFING_QUALITY_SYMBOLS.map((symbol, index) => ({
      symbol,
      generationMode: "model" as const,
      status: "ready" as const,
      dimensions: dimensions(scoresBySymbol[index] ?? []),
      blockingDefects: [],
    })),
  };
}

const fullScore = [2, 2, 2, 1.5, 1.5, 1] as const;
const eightScore = [2, 1.5, 1.5, 1, 1.5, 0.5] as const;
const eightPointThreeSixScore = [2, 1.5, 1.5, 1.1, 1.5, 0.76] as const;
const passingScores = [
  eightScore,
  eightPointThreeSixScore,
  eightPointThreeSixScore,
  eightPointThreeSixScore,
  eightPointThreeSixScore,
  eightPointThreeSixScore,
] as const;

describe("briefing quality audit schema", () => {
  it("freezes the six audit maxima and representative-symbol order", () => {
    expect(BRIEFING_QUALITY_DIMENSIONS).toEqual({
      dataArithmetic: { label: "Data and arithmetic integrity", maximum: 2 },
      noveltySourceQuality: { label: "Novelty and source quality", maximum: 2 },
      timingBranches: { label: "Actionable timing and branches", maximum: 2 },
      companySectorSpecificity: {
        label: "Company and sector specificity",
        maximum: 1.5,
      },
      proseNonSlop: { label: "Prose and non-slop", maximum: 1.5 },
      stateContractHonesty: { label: "State and contract honesty", maximum: 1 },
    });
    expect(BRIEFING_QUALITY_SYMBOLS).toEqual([
      "AAPL",
      "NVDA",
      "TSLA",
      "MSFT",
      "AMZN",
      "JPM",
    ]);
  });

  it("rejects missing dimension evidence, arithmetic drift, and symbol-order drift", () => {
    const complete = auditFor(Array.from({ length: 6 }, () => fullScore));
    const { evidence: _evidence, ...uncitedDimension } =
      complete.symbols[0]?.dimensions.dataArithmetic ?? {};
    const missingEvidence = {
      symbols: [
        {
          ...complete.symbols[0],
          dimensions: {
            ...complete.symbols[0]?.dimensions,
            dataArithmetic: uncitedDimension,
          },
        },
        ...complete.symbols.slice(1),
      ],
    };
    const arithmeticDrift = auditFor(
      Array.from({ length: 6 }, () => fullScore),
    );
    const firstDeduction =
      arithmeticDrift.symbols[0]?.dimensions.dataArithmetic.deductions[0];
    const drifted = {
      symbols: [
        {
          ...arithmeticDrift.symbols[0],
          dimensions: {
            ...arithmeticDrift.symbols[0]?.dimensions,
            dataArithmetic: {
              ...arithmeticDrift.symbols[0]?.dimensions.dataArithmetic,
              score: 1.5,
              deductions: [
                {
                  ...firstDeduction,
                  points: 0.25,
                },
              ],
            },
          },
        },
        ...arithmeticDrift.symbols.slice(1),
      ],
    };
    const orderDrift = auditFor(Array.from({ length: 6 }, () => fullScore));
    const [first, second, ...remaining] = orderDrift.symbols;

    expect(BriefingQualityAuditSchema.safeParse(missingEvidence).success).toBe(
      false,
    );
    expect(BriefingQualityAuditSchema.safeParse(drifted).success).toBe(false);
    expect(
      BriefingQualityAuditSchema.safeParse({
        symbols: [second, first, ...remaining],
      }).success,
    ).toBe(false);
  });

  it("computes the frozen six-symbol gate", () => {
    const result = validateBriefingQualityAudit(auditFor(passingScores));
    const fullResult = validateBriefingQualityAudit(
      auditFor(Array.from({ length: 6 }, () => fullScore)),
    );

    expect(result.symbols.map((symbol) => symbol.total)).toEqual([
      8, 8.36, 8.36, 8.36, 8.36, 8.36,
    ]);
    expect(fullResult.symbols.map((symbol) => symbol.total)).toEqual(
      Array.from({ length: 6 }, () => 10),
    );
    expect(result.mean).toBe(8.3);
    expect(result.passes).toBe(true);
  });

  it("rejects uncited deductions and the 6.67 baseline", () => {
    const uncited = auditFor(Array.from({ length: 6 }, () => eightScore));
    const first = uncited.symbols[0];
    const firstDeduction = first?.dimensions.noveltySourceQuality.deductions[0];
    const withoutCitation = {
      symbols: [
        {
          ...first,
          dimensions: {
            ...first?.dimensions,
            noveltySourceQuality: {
              ...first?.dimensions.noveltySourceQuality,
              deductions: [{ ...firstDeduction, evidence: [] }],
            },
          },
        },
        ...uncited.symbols.slice(1),
      ],
    };
    const baseline = validateBriefingQualityAudit(
      auditFor([
        [1.5, 0.75, 1.5, 0.75, 1.25, 0.5],
        [2, 0.5, 2, 1, 1.25, 0.5],
        [2, 1.5, 1.5, 0.75, 1.25, 1],
        [1.25, 1.5, 1.25, 1.5, 0.75, 0.75],
        [1, 0.75, 1.25, 1, 1, 0.75],
        [1.25, 1, 1.25, 0.5, 1, 0.75],
      ]),
    );

    expect(BriefingQualityAuditSchema.safeParse(withoutCitation).success).toBe(
      false,
    );
    expect(baseline.mean).toBeCloseTo(6.67, 2);
    expect(baseline.passes).toBe(false);
  });

  it("fails a six-symbol 8.0 mean and non-model, partial, or blocked result", () => {
    const eightPointZero = validateBriefingQualityAudit(
      auditFor(Array.from({ length: 6 }, () => eightScore)),
    );
    const ineligible = auditFor(passingScores);
    const first = ineligible.symbols[0];
    const blocked = {
      symbols: [
        {
          ...first,
          generationMode: "fallback" as const,
          status: "partial" as const,
          blockingDefects: [
            { id: "eps", rationale: "Uncomparable EPS", evidence: [pointer] },
          ],
        },
        ...ineligible.symbols.slice(1),
      ],
    };

    expect(eightPointZero.mean).toBe(8);
    expect(eightPointZero.passes).toBe(false);
    expect(validateBriefingQualityAudit(blocked).passes).toBe(false);
  });

  it("keeps every Task-1 TypeScript file under the pure-LOC ceiling", () => {
    const pureLineCount = (path: string) =>
      readFileSync(resolve(path), "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "" && !line.trim().startsWith("//"))
        .length;
    const files = [
      "src/briefing/quality/briefingQualityRubric.ts",
      "src/briefing/quality/briefingQualityAuditSchema.ts",
      "src/briefing/quality/briefingQualityAuditSchema.test.ts",
    ];

    expect(files.map(pureLineCount)).toEqual(
      expect.arrayContaining(files.map(() => expect.any(Number))),
    );
    expect(files.map(pureLineCount).every((count) => count <= 250)).toBe(true);
  });
});
