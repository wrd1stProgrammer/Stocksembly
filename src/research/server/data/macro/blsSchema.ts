import { z } from "zod";

export const BLS_SERIES_IDS = [
  "CUUR0000SA0",
  "CUUR0000SA0L1E",
  "LNS14000000",
  "CES0000000001",
  "CES0500000003",
  "WPUFD4",
] as const;
export type BlsSeriesId = (typeof BLS_SERIES_IDS)[number];

const BlsFootnoteSchema = z
  .object({
    code: z.string().optional(),
    text: z.string().optional(),
  })
  .passthrough();

const BlsDatumSchema = z
  .object({
    year: z.string().regex(/^\d{4}$/),
    period: z.string().regex(/^M(?:0[1-9]|1[0-2])$/),
    periodName: z.string().min(1),
    value: z.union([
      z.literal("-"),
      z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/),
    ]),
    footnotes: z.array(BlsFootnoteSchema),
  })
  .passthrough();

const BlsSeriesSchema = z
  .object({
    seriesID: z.enum(BLS_SERIES_IDS),
    data: z.array(BlsDatumSchema),
  })
  .passthrough();

export const BlsPayloadSchema = z
  .object({
    status: z.literal("REQUEST_SUCCEEDED"),
    message: z.array(z.string()),
    Results: z
      .object({ series: z.array(BlsSeriesSchema).length(1) })
      .passthrough(),
  })
  .passthrough();

export type BlsPayload = z.infer<typeof BlsPayloadSchema>;

const BlsRequestShapeSchema = z
  .object({
    seriesId: z.string(),
    startYear: z.number().int().min(1900).max(2100),
    endYear: z.number().int().min(1900).max(2100),
  })
  .strict();

export type BlsRequest = {
  readonly seriesId: BlsSeriesId;
  readonly startYear: number;
  readonly endYear: number;
};

export type BlsRequestParseResult =
  | { readonly ok: true; readonly request: BlsRequest }
  | {
      readonly ok: false;
      readonly reason:
        | "request_invalid"
        | "series_not_allowed"
        | "range_not_allowed";
    };

export function parseBlsRequest(input: unknown): BlsRequestParseResult {
  const parsed = BlsRequestShapeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "request_invalid" };
  const series = z.enum(BLS_SERIES_IDS).safeParse(parsed.data.seriesId);
  if (!series.success) return { ok: false, reason: "series_not_allowed" };
  if (
    parsed.data.endYear < parsed.data.startYear ||
    parsed.data.endYear - parsed.data.startYear + 1 > 10
  ) {
    return { ok: false, reason: "range_not_allowed" };
  }
  return {
    ok: true,
    request: {
      seriesId: series.data,
      startYear: parsed.data.startYear,
      endYear: parsed.data.endYear,
    },
  };
}
