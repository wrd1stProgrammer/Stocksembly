import { createHash } from "node:crypto";
import { z } from "zod";
import { validateSecurityIdentityInput } from "../../../domain/securityIdentity";
import {
  DOMESTIC_FORMS,
  FPI_FORMS,
  INVESTMENT_FORMS,
  REQUIRED_DOMESTIC_FORMS,
} from "../../../domain/securityIdentity.schema";
import { parseMainSubmission } from "./filingsPayload";
import { extractCoverPages } from "./issuerResolverCover";
import { loadResolverHistory } from "./issuerResolverHistory";
import {
  type ResolverExchange,
  resolveTickerReference,
} from "./issuerResolverReference";
import { SecClientError } from "./secClientErrors";
import type { SecClient, SecFetchResult } from "./secClientTypes";

const ResolveInputSchema = z
  .object({
    ticker: z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/),
    cutoffAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type SecIssuerIdentity = {
  readonly cik: string;
  readonly ticker: string;
  readonly legalName: string;
  readonly exchange: ResolverExchange;
  readonly title: string;
  readonly securityClass: "common_stock";
};
export type SecIssuerResolution =
  | {
      readonly kind: "admitted";
      readonly identity: SecIssuerIdentity;
      readonly evidence: {
        readonly identityHash: string;
        readonly tickerReferenceHash: string;
        readonly submissionsHash: string;
        readonly historyHashes: readonly string[];
        readonly retrievedAt: string;
      };
    }
  | { readonly kind: "invalid_input" }
  | {
      readonly kind: "rejected";
      readonly reason:
        | "ticker_not_found"
        | "ambiguous_ticker"
        | "ambiguous_security_class"
        | "source_disagreement"
        | "unsupported_exchange"
        | "otc"
        | "foreign_private_issuer"
        | "fund"
        | "adr"
        | "etf"
        | "unit"
        | "warrant"
        | "preferred"
        | "debt"
        | "unknown_security_class"
        | "unsupported_form"
        | "insufficient_filing"
        | "missing_cover_triplet"
        | "post_cutoff_source"
        | "missing_history_file"
        | "malformed_source";
    };

function formRejection(
  forms: readonly string[],
): SecIssuerResolution | undefined {
  if (forms.some((form) => FPI_FORMS.has(form)))
    return { kind: "rejected", reason: "foreign_private_issuer" };
  if (forms.some((form) => INVESTMENT_FORMS.has(form)))
    return { kind: "rejected", reason: "fund" };
  const domesticForms = forms.filter((form) => DOMESTIC_FORMS.has(form));
  if (domesticForms.length === 0)
    return { kind: "rejected", reason: "unsupported_form" };
  const hasForm = (base: string) =>
    domesticForms.some((form) => form === base || form === `${base}/A`);
  if (!REQUIRED_DOMESTIC_FORMS.every(hasForm))
    return { kind: "rejected", reason: "insufficient_filing" };
  return undefined;
}

export async function resolveSecIssuer(
  client: SecClient,
  untrustedInput: unknown,
): Promise<SecIssuerResolution> {
  const input = ResolveInputSchema.safeParse(untrustedInput);
  if (!input.success) return { kind: "invalid_input" };
  const tickerReference = await client.fetch({
    kind: "company_tickers_exchange",
  });
  const cutoff = new Date(Date.parse(input.data.cutoffAt)).toISOString();
  if (tickerReference.provenance.retrievedAt > cutoff)
    return { kind: "rejected", reason: "post_cutoff_source" };
  const reference = resolveTickerReference(
    tickerReference.bytes,
    input.data.ticker,
  );
  if (reference.kind === "rejected") return reference;
  const { cik, exchange } = reference;
  const submissionResult = await client.fetch({ kind: "submissions", cik });
  if (submissionResult.provenance.retrievedAt > cutoff)
    return { kind: "rejected", reason: "post_cutoff_source" };
  const submission = parseMainSubmission(submissionResult.bytes, cik);
  if (submission.kind === "malformed_source")
    return { kind: "rejected", reason: "malformed_source" };
  const history = await loadResolverHistory(client, {
    submission: submission.value,
    cutoffAt: cutoff,
    expectedCik: cik,
  });
  if (history.kind === "rejected")
    return { kind: "rejected", reason: history.reason };
  const cutoffMilliseconds = Date.parse(input.data.cutoffAt);
  const forms = history.records
    .filter(
      (record) =>
        Date.parse(record.acceptedAt) <= cutoffMilliseconds &&
        Date.parse(record.filedAt) <= cutoffMilliseconds,
    )
    .map((record) => record.form);
  const rejection = formRejection(forms);
  if (rejection !== undefined) return rejection;
  const annual = history.records
    .filter(
      (record) =>
        record.form === "10-K" &&
        Date.parse(record.acceptedAt) <= cutoffMilliseconds &&
        Date.parse(record.filedAt) <= cutoffMilliseconds,
    )
    .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))[0];
  if (annual === undefined)
    return { kind: "rejected", reason: "insufficient_filing" };
  let annualDocument: SecFetchResult;
  try {
    annualDocument = await client.fetch({
      kind: "filing_document",
      cik,
      accessionNumber: annual.accessionNumber,
      primaryDocument: annual.primaryDocument,
    });
  } catch (error) {
    if (error instanceof SecClientError && error.code === "SEC_HTTP_STATUS")
      return { kind: "rejected", reason: "insufficient_filing" };
    throw error;
  }
  if (annualDocument.provenance.retrievedAt > cutoff)
    return { kind: "rejected", reason: "post_cutoff_source" };
  const coverPages = extractCoverPages(annualDocument.bytes, cik, annual.form);
  if (coverPages === undefined)
    return { kind: "rejected", reason: "missing_cover_triplet" };
  const admission = validateSecurityIdentityInput({
    submittedSymbol: input.data.ticker,
    tickerExchangeRows: [
      { symbol: input.data.ticker, cik, exchange: reference.sourceExchange },
    ],
    filingForms: forms.map((form) => ({ form, cik })),
    coverPages,
  });
  if (admission.kind === "invalid_input")
    return { kind: "rejected", reason: "malformed_source" };
  if (admission.kind === "ambiguous")
    return { kind: "rejected", reason: admission.reason };
  if (admission.kind === "unsupported")
    return admission.reason === "untrusted_input" ||
      admission.reason === "ticker_not_found" ||
      admission.reason === "otc"
      ? { kind: "rejected", reason: "malformed_source" }
      : { kind: "rejected", reason: admission.reason };
  const identity = Object.freeze({
    cik,
    ticker: input.data.ticker,
    legalName: submission.value.name,
    exchange,
    title: admission.identity.title,
    securityClass: admission.identity.securityClass,
  });
  const identityHash = createHash("sha256")
    .update(
      JSON.stringify({
        ...identity,
        tickerReferenceHash: tickerReference.provenance.contentHash,
        submissionsHash: submissionResult.provenance.contentHash,
        historyHashes: history.contentHashes,
        cutoffAt: new Date(cutoffMilliseconds).toISOString(),
      }),
    )
    .digest("hex");
  return Object.freeze({
    kind: "admitted",
    identity,
    evidence: Object.freeze({
      identityHash,
      tickerReferenceHash: tickerReference.provenance.contentHash,
      submissionsHash: submissionResult.provenance.contentHash,
      historyHashes: history.contentHashes,
      retrievedAt:
        [
          tickerReference.provenance.retrievedAt,
          submissionResult.provenance.retrievedAt,
          history.latestRetrievedAt ?? "",
        ]
          .sort()
          .at(-1) ?? submissionResult.provenance.retrievedAt,
    }),
  });
}
