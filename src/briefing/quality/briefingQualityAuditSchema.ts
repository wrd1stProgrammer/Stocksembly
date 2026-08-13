import { z } from "zod";
import {
  BRIEFING_QUALITY_DIMENSIONS,
  BRIEFING_QUALITY_MEAN_MINIMUM,
  BRIEFING_QUALITY_SYMBOL_MINIMUM,
  BRIEFING_QUALITY_SYMBOLS,
} from "./briefingQualityRubric";

const ARITHMETIC_TOLERANCE = 0.000_001;
const SCORE_PRECISION = 1_000_000;

function normalizeScore(score: number): number {
  return Math.round(score * SCORE_PRECISION) / SCORE_PRECISION;
}

const EvidencePointerSchema = z
  .object({
    source: z.enum(["payload", "evidence"]),
    pointer: z.string().trim().min(1),
  })
  .strict();

const DeductionSchema = z
  .object({
    points: z.number().positive(),
    rationale: z.string().trim().min(1),
    evidence: z.array(EvidencePointerSchema).min(1),
  })
  .strict();

function createDimensionSchema(maximum: number) {
  return z
    .object({
      score: z.number().min(0).max(maximum),
      evidence: z.array(EvidencePointerSchema).min(1),
      deductions: z.array(DeductionSchema),
    })
    .strict()
    .superRefine((dimension, context) => {
      const deducted = dimension.deductions.reduce(
        (total, deduction) => total + deduction.points,
        0,
      );

      if (
        Math.abs(dimension.score + deducted - maximum) > ARITHMETIC_TOLERANCE
      ) {
        context.addIssue({
          code: "custom",
          message: "Score plus cited deductions must equal the frozen maximum.",
        });
      }
    });
}

const DimensionScoresSchema = z
  .object({
    dataArithmetic: createDimensionSchema(
      BRIEFING_QUALITY_DIMENSIONS.dataArithmetic.maximum,
    ),
    noveltySourceQuality: createDimensionSchema(
      BRIEFING_QUALITY_DIMENSIONS.noveltySourceQuality.maximum,
    ),
    timingBranches: createDimensionSchema(
      BRIEFING_QUALITY_DIMENSIONS.timingBranches.maximum,
    ),
    companySectorSpecificity: createDimensionSchema(
      BRIEFING_QUALITY_DIMENSIONS.companySectorSpecificity.maximum,
    ),
    proseNonSlop: createDimensionSchema(
      BRIEFING_QUALITY_DIMENSIONS.proseNonSlop.maximum,
    ),
    stateContractHonesty: createDimensionSchema(
      BRIEFING_QUALITY_DIMENSIONS.stateContractHonesty.maximum,
    ),
  })
  .strict();

const BlockingDefectSchema = z
  .object({
    id: z.string().trim().min(1),
    rationale: z.string().trim().min(1),
    evidence: z.array(EvidencePointerSchema).min(1),
  })
  .strict();

const BriefingQualitySymbolAuditSchema = z
  .object({
    symbol: z.enum(BRIEFING_QUALITY_SYMBOLS),
    generationMode: z.enum(["model", "fallback"]),
    status: z.enum(["ready", "partial"]),
    dimensions: DimensionScoresSchema,
    blockingDefects: z.array(BlockingDefectSchema),
  })
  .strict();

export const BriefingQualityAuditSchema = z
  .object({
    symbols: z
      .array(BriefingQualitySymbolAuditSchema)
      .length(BRIEFING_QUALITY_SYMBOLS.length),
  })
  .strict()
  .superRefine((audit, context) => {
    audit.symbols.forEach((symbolAudit, index) => {
      if (symbolAudit.symbol !== BRIEFING_QUALITY_SYMBOLS[index]) {
        context.addIssue({
          code: "custom",
          path: ["symbols", index, "symbol"],
          message: "Symbols must use the frozen audit order exactly.",
        });
      }
    });
  });

export type BriefingQualityAudit = z.infer<typeof BriefingQualityAuditSchema>;

export function getBriefingQualityTotal(
  dimensions: BriefingQualityAudit["symbols"][number]["dimensions"],
): number {
  return normalizeScore(
    Object.values(dimensions).reduce(
      (total, dimension) => total + dimension.score,
      0,
    ),
  );
}

export function validateBriefingQualityAudit(input: unknown) {
  const audit = BriefingQualityAuditSchema.parse(input);
  const symbols = audit.symbols.map((symbolAudit) => {
    const total = getBriefingQualityTotal(symbolAudit.dimensions);
    const modelReady =
      symbolAudit.generationMode === "model" && symbolAudit.status === "ready";
    const passes =
      modelReady &&
      total >= BRIEFING_QUALITY_SYMBOL_MINIMUM &&
      symbolAudit.blockingDefects.length === 0;

    return { ...symbolAudit, total, passes };
  });
  const mean = normalizeScore(
    symbols.reduce((total, symbol) => total + symbol.total, 0) / symbols.length,
  );

  return {
    symbols,
    mean,
    passes:
      symbols.every((symbol) => symbol.passes) &&
      mean >= BRIEFING_QUALITY_MEAN_MINIMUM,
  };
}
