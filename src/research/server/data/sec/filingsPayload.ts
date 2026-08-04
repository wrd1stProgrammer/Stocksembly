import { z } from "zod";
import { isRegistrationFinancialForm } from "./secFilingForms";

const FilingColumnsSchema = z
  .object({
    accessionNumber: z.array(z.string().regex(/^\d{10}-\d{2}-\d{6}$/)),
    form: z.array(z.string().trim().min(1)),
    filingDate: z.array(z.iso.date()),
    acceptanceDateTime: z.array(z.string().trim().min(1)),
    reportDate: z.array(z.string()),
    primaryDocument: z.array(z.string()),
  })
  .passthrough();

const MainSubmissionSchema = z
  .object({
    cik: z.union([z.string(), z.number().int().nonnegative()]),
    name: z.string().trim().min(1),
    filings: z
      .object({
        recent: FilingColumnsSchema,
        files: z.array(
          z
            .object({
              name: z.string().regex(/^CIK\d{10}-submissions-\d{3}\.json$/),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

export type FilingMetadata = {
  readonly accessionNumber: string;
  readonly form: string;
  readonly filedAt: string;
  readonly acceptedAt: string;
  readonly period: string;
  readonly primaryDocument: string;
};

export type SubmissionPayload = {
  readonly name: string;
  readonly records: readonly FilingMetadata[];
  readonly historyFiles: readonly string[];
};

export type PayloadResult<T> =
  | { readonly kind: "parsed"; readonly value: T }
  | { readonly kind: "malformed_source" };

function decodeJson(bytes: Uint8Array): unknown | undefined {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError)
      return undefined;
    throw error;
  }
}

function acceptedAt(value: string): string | undefined {
  const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  const candidate =
    compact === null
      ? value
      : `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`;
  const milliseconds = Date.parse(candidate);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : undefined;
}

function columnsToRecords(
  columns: z.infer<typeof FilingColumnsSchema>,
): readonly FilingMetadata[] | undefined {
  const lengths = [
    columns.accessionNumber.length,
    columns.form.length,
    columns.filingDate.length,
    columns.acceptanceDateTime.length,
    columns.reportDate.length,
    columns.primaryDocument.length,
  ];
  if (new Set(lengths).size !== 1) return undefined;
  const records: FilingMetadata[] = [];
  for (let index = 0; index < columns.form.length; index += 1) {
    const accessionNumber = columns.accessionNumber[index];
    const form = columns.form[index];
    const filingDate = columns.filingDate[index];
    const acceptanceDateTime = columns.acceptanceDateTime[index];
    const reportedPeriod = columns.reportDate[index];
    const primaryDocument = columns.primaryDocument[index];
    if (
      accessionNumber === undefined ||
      form === undefined ||
      filingDate === undefined ||
      acceptanceDateTime === undefined ||
      reportedPeriod === undefined ||
      primaryDocument === undefined
    )
      return undefined;
    if (primaryDocument.trim().length === 0) continue;
    const accepted = acceptedAt(acceptanceDateTime);
    if (accepted === undefined) continue;
    const period = /^\d{4}-\d{2}-\d{2}$/.test(reportedPeriod)
      ? reportedPeriod
      : isRegistrationFinancialForm(form.toUpperCase())
        ? filingDate
        : undefined;
    if (period === undefined) continue;
    records.push(
      Object.freeze({
        accessionNumber,
        form: form.toUpperCase(),
        filedAt: `${filingDate}T00:00:00.000Z`,
        acceptedAt: accepted,
        period,
        primaryDocument,
      }),
    );
  }
  return Object.freeze(records);
}

export function parseMainSubmission(
  bytes: Uint8Array,
  expectedCik: string,
): PayloadResult<SubmissionPayload> {
  const decoded = decodeJson(bytes);
  const parsed = MainSubmissionSchema.safeParse(decoded);
  if (
    !parsed.success ||
    String(parsed.data.cik).padStart(10, "0") !== expectedCik
  )
    return { kind: "malformed_source" };
  const records = columnsToRecords(parsed.data.filings.recent);
  if (records === undefined) return { kind: "malformed_source" };
  return {
    kind: "parsed",
    value: Object.freeze({
      name: parsed.data.name,
      records,
      historyFiles: Object.freeze(
        parsed.data.filings.files.map((file) => file.name),
      ),
    }),
  };
}

export function parseHistoricalSubmission(
  bytes: Uint8Array,
): PayloadResult<readonly FilingMetadata[]> {
  const decoded = decodeJson(bytes);
  const parsed = FilingColumnsSchema.safeParse(decoded);
  if (!parsed.success) return { kind: "malformed_source" };
  const records = columnsToRecords(parsed.data);
  return records === undefined
    ? { kind: "malformed_source" }
    : { kind: "parsed", value: records };
}
