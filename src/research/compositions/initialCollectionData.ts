import { createHash, randomUUID } from "node:crypto";
import type { SnapshotEvidence } from "../application/buildSnapshot";
import type { CapabilityDisclosure } from "../domain/capabilities";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import type { ValueRegistry } from "../domain/valueRegistry";
import type { ArtifactCasPort, ArtifactDescriptor } from "../ports/artifacts";
import { BLS_SOURCE_URL, createBlsAdapter } from "../server/data/macro/bls";
import type {
  MacroClock,
  MacroHttpTransport,
} from "../server/data/macro/macroHttp";
import {
  createTreasuryYieldAdapter,
  treasuryYieldSourceUrl,
} from "../server/data/macro/treasuryYield";
import { parseCompanyFacts } from "../server/data/sec/companyFacts";
import { parseMainSubmission } from "../server/data/sec/filingsPayload";
import { normalizeFinancials } from "../server/data/sec/financialNormalizer";
import { resolveTickerReference } from "../server/data/sec/issuerResolverReference";
import {
  createSecClient,
  type SecClient,
  type SecFetchResult,
} from "../server/data/sec/secClient";
import type { SpecialistSourceArtifact } from "../workflow/specialistRoundSqlite";
import {
  collectInsightSentryInitialEvidence,
  type InsightSentryInitialCollection,
} from "./insightSentryInitialCollection";

const encoder = new TextEncoder();

export type InitialCollectionInput = {
  readonly dataRoot: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly symbol: string;
  readonly cas: ArtifactCasPort;
};

export type InitialCollectionResult = {
  readonly identity: {
    readonly cik: string;
    readonly ticker: string;
    readonly legalName: string;
    readonly exchange: string;
    readonly identityHash: string;
  };
  readonly evidence: readonly SnapshotEvidence[];
  readonly sources: readonly SpecialistSourceArtifact[];
  readonly valueRegistry: ValueRegistry;
  readonly retrievedAt: string;
  readonly treasuryAvailable: boolean;
  readonly blsAvailable: boolean;
  readonly marketAvailable: boolean;
  readonly providerCapabilities: readonly CapabilityDisclosure[];
  readonly providerFamilyStates: InsightSentryInitialCollection["familyStates"];
  readonly providerLimitations: readonly string[];
  readonly providerRequestLedger: InsightSentryInitialCollection["requestLedger"];
};

function httpTransport(): MacroHttpTransport {
  return async (request) => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      request.timeoutMilliseconds,
    );
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        signal: controller.signal,
      });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}

function macroClock(): MacroClock {
  return {
    isoNow: () => new Date().toISOString(),
    sleep: (milliseconds) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  };
}

function textFromHtml(bytes: Uint8Array): string {
  return new TextDecoder()
    .decode(bytes)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(?:p|div|section|h[1-6]|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function filingTagValue(source: string, tag: string): string | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const outer = new RegExp(
    `<(?:[\\w-]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escaped}>`,
    "iu",
  ).exec(source)?.[1];
  if (outer === undefined) return undefined;
  const nested =
    /<(?:[\w-]+:)?value\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?value>/iu.exec(
      outer,
    )?.[1];
  const value = (nested ?? outer)
    ?.replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function filingBlocks(source: string, tag: string): readonly string[] {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return [
    ...source.matchAll(
      new RegExp(
        `<(?:[\\w-]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escaped}>`,
        "giu",
      ),
    ),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

export function structuredOwnershipFiling(
  form: string,
  bytes: Uint8Array,
): unknown {
  const source = new TextDecoder().decode(bytes);
  if (/^(?:3|4|5)(?:\/A)?$/u.test(form)) {
    const transactions = [
      ...filingBlocks(source, "nonDerivativeTransaction"),
      ...filingBlocks(source, "derivativeTransaction"),
    ]
      .map((block) => ({
        security: filingTagValue(block, "securityTitle"),
        date: filingTagValue(block, "transactionDate"),
        code: filingTagValue(block, "transactionCode"),
        shares: filingTagValue(block, "transactionShares"),
        pricePerShare: filingTagValue(block, "transactionPricePerShare"),
        acquiredOrDisposed: filingTagValue(
          block,
          "transactionAcquiredDisposedCode",
        ),
        sharesOwnedAfter: filingTagValue(
          block,
          "sharesOwnedFollowingTransaction",
        ),
        ownership: filingTagValue(block, "directOrIndirectOwnership"),
      }))
      .filter((transaction) =>
        Object.values(transaction).some((value) => value !== undefined),
      )
      .slice(0, 40);
    return {
      kind: "insider_transactions",
      reportingOwner: filingTagValue(source, "rptOwnerName"),
      issuer: filingTagValue(source, "issuerName"),
      transactions,
    };
  }
  if (ownershipDataset(form) === "sec_institutional_holdings") {
    const holdings = filingBlocks(source, "infoTable")
      .map((block) => ({
        issuer: filingTagValue(block, "nameOfIssuer"),
        classTitle: filingTagValue(block, "titleOfClass"),
        cusip: filingTagValue(block, "cusip"),
        valueThousandsUsd: filingTagValue(block, "value"),
        shares: filingTagValue(block, "sshPrnamt"),
        discretion: filingTagValue(block, "investmentDiscretion"),
      }))
      .filter((holding) =>
        Object.values(holding).some((value) => value !== undefined),
      )
      .slice(0, 100);
    return {
      kind: "institutional_holdings",
      filingManager: filingTagValue(source, "name"),
      reportPeriod: filingTagValue(source, "reportCalendarOrQuarter"),
      holdings,
    };
  }
  return undefined;
}

async function put(
  input: InitialCollectionInput,
  bytes: Uint8Array,
  mediaType: string,
): Promise<ArtifactDescriptor> {
  return await input.cas.put({
    artifactId: ArtifactIdSchema.parse(randomUUID()),
    runId: RunIdSchema.parse(input.runId),
    snapshotId: SnapshotIdSchema.parse(input.snapshotId),
    mediaType,
    parentDigests: [],
    bytes,
  });
}

function packageBytes(
  input: InitialCollectionInput,
  value: unknown,
): Uint8Array {
  return encoder.encode(
    JSON.stringify({
      runId: input.runId,
      snapshotId: input.snapshotId,
      value,
    }),
  );
}

type SelectedFiling = {
  readonly accessionNumber: string;
  readonly primaryDocument: string;
};

function ownershipDataset(form: string) {
  if (/^(?:3|4|5)(?:\/A)?$/u.test(form))
    return "sec_insider_transactions" as const;
  if (
    /^(?:13F-HR(?:\/A)?|SC 13[DG](?:\/A)?|SCHEDULE 13[DG](?:\/A)?)$/u.test(form)
  )
    return "sec_institutional_holdings" as const;
  return "sec_filing" as const;
}

type ObservedCollectionBranch<T> =
  | { readonly status: "fulfilled"; readonly value: T }
  | { readonly status: "rejected"; readonly reason: unknown };

export function observeCollectionBranch<T>(
  branch: Promise<T>,
): Promise<ObservedCollectionBranch<T>> {
  return branch.then(
    (value) => ({ status: "fulfilled", value }),
    (reason: unknown) => ({ status: "rejected", reason }),
  );
}

export async function collectSecEvidenceBatch<T extends SelectedFiling>(input: {
  readonly client: Pick<SecClient, "fetch">;
  readonly cik: string;
  readonly filings: readonly T[];
}): Promise<{
  readonly filingResults: readonly {
    readonly filing: T;
    readonly result: SecFetchResult;
  }[];
  readonly factsResult: SecFetchResult;
}> {
  const [filingResults, factsResult] = await Promise.all([
    Promise.all(
      input.filings.map(async (filing) => ({
        filing,
        result: await input.client.fetch({
          kind: "filing_document",
          cik: input.cik,
          accessionNumber: filing.accessionNumber,
          primaryDocument: filing.primaryDocument,
        }),
      })),
    ),
    input.client.fetch({
      kind: "company_facts",
      cik: input.cik,
    }),
  ]);
  return { filingResults, factsResult };
}

export async function collectInitialEvidence(
  input: InitialCollectionInput,
): Promise<InitialCollectionResult> {
  const client = createSecClient({ dataRoot: input.dataRoot });
  const tickerResult = await client.fetch({ kind: "company_tickers_exchange" });
  const reference = resolveTickerReference(tickerResult.bytes, input.symbol);
  if (reference.kind === "rejected")
    throw new TypeError(`issuer_resolution_failed:${reference.reason}`);
  const submissionsResult = await client.fetch({
    kind: "submissions",
    cik: reference.cik,
  });
  const submissions = parseMainSubmission(
    submissionsResult.bytes,
    reference.cik,
  );
  if (submissions.kind !== "parsed")
    throw new TypeError("sec_submissions_malformed");
  const annual = submissions.value.records
    .filter((record) => record.form === "10-K")
    .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))[0];
  if (annual === undefined) throw new TypeError("sec_10k_missing");
  const quarterly = submissions.value.records
    .filter((record) => record.form === "10-Q")
    .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))[0];
  const currentReports = submissions.value.records
    .filter((record) => record.form === "8-K")
    .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))
    .slice(0, 2);
  const insiderFilings = submissions.value.records
    .filter((record) => /^(?:3|4|5)(?:\/A)?$/u.test(record.form))
    .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))
    .slice(0, 8);
  const institutionalFilings = submissions.value.records
    .filter((record) =>
      /^(?:13F-HR(?:\/A)?|SC 13[DG](?:\/A)?|SCHEDULE 13[DG](?:\/A)?)$/u.test(
        record.form,
      ),
    )
    .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))
    .slice(0, 6);
  const selectedFilings = [
    ...new Map(
      [
        annual,
        ...(quarterly === undefined ? [] : [quarterly]),
        ...currentReports,
        ...insiderFilings,
        ...institutionalFilings,
      ].map((filing) => [filing.accessionNumber, filing] as const),
    ).values(),
  ];
  const transport = httpTransport();
  const clock = macroClock();
  const year = new Date().getUTCFullYear();
  const macroPromise = observeCollectionBranch(
    Promise.all([
      createTreasuryYieldAdapter({
        dataRoot: input.dataRoot,
        transport,
        clock,
      }).collect({ year }),
      createBlsAdapter({ dataRoot: input.dataRoot, transport, clock }).collect({
        seriesId: "CUUR0000SA0",
        startYear: year - 2,
        endYear: year,
      }),
      createBlsAdapter({ dataRoot: input.dataRoot, transport, clock }).collect({
        seriesId: "LNS14000000",
        startYear: year - 2,
        endYear: year,
      }),
    ]),
  );
  const { filingResults, factsResult } = await collectSecEvidenceBatch({
    client,
    cik: reference.cik,
    filings: selectedFilings,
  });
  const retrievedAt =
    [
      tickerResult.provenance.retrievedAt,
      submissionsResult.provenance.retrievedAt,
      ...filingResults.map(({ result }) => result.provenance.retrievedAt),
      factsResult.provenance.retrievedAt,
    ]
      .sort()
      .at(-1) ?? new Date().toISOString();
  const cutoffAt = new Date(Date.parse(retrievedAt) + 1_000).toISOString();
  const lineage = submissions.value.records
    .filter((record) =>
      ["10-K", "10-K/A", "10-Q", "10-Q/A"].includes(record.form),
    )
    .map(({ primaryDocument: _primaryDocument, ...record }) => record);
  const parsedFacts = parseCompanyFacts(factsResult.bytes, {
    cik: reference.cik,
    cutoffAt,
    retrievedAt: factsResult.provenance.retrievedAt,
    sourceHash: factsResult.provenance.contentHash,
    filings: lineage,
  });
  if (parsedFacts.kind !== "parsed")
    throw new TypeError(`sec_company_facts_${parsedFacts.reason}`);
  const financials = normalizeFinancials({
    runId: input.runId,
    snapshotId: input.snapshotId,
    evidenceCutoffAt: cutoffAt,
    candidates: parsedFacts.selected.filter(
      (candidate) =>
        candidate.acceptedAt !== undefined &&
        candidate.filedAt !== undefined &&
        Date.parse(candidate.acceptedAt) >= Date.parse(candidate.filedAt),
    ),
  });

  const identityValue = {
    cik: reference.cik,
    ticker: input.symbol,
    legalName: submissions.value.name,
    exchange: reference.exchange,
  };
  const identity = {
    ...identityValue,
    identityHash: createHash("sha256")
      .update(
        JSON.stringify({
          ...identityValue,
          tickerHash: tickerResult.provenance.contentHash,
          submissionsHash: submissionsResult.provenance.contentHash,
        }),
      )
      .digest("hex"),
  };
  const annualFilingResult = filingResults.find(
    ({ filing }) => filing.accessionNumber === annual.accessionNumber,
  );
  if (annualFilingResult === undefined)
    throw new TypeError("sec_annual_filing_result_missing");
  const provider = await collectInsightSentryInitialEvidence({
    dataRoot: input.dataRoot,
    runId: input.runId,
    snapshotId: input.snapshotId,
    identity,
    asOf: new Date().toISOString(),
    cas: input.cas,
    peerProfile: {
      annualAccessionNumber: annual.accessionNumber,
      annualText: textFromHtml(annualFilingResult.result.bytes),
    },
  });
  const identityBytes = packageBytes(input, identity);
  const packagedFilings = filingResults.map(({ filing, result }) => ({
    filing,
    result,
    bytes: packageBytes(input, {
      sourceUrl: result.provenance.sourceUrl,
      accessionNumber: filing.accessionNumber,
      form: filing.form,
      filedAt: filing.filedAt,
      acceptedAt: filing.acceptedAt,
      periodEnd: filing.period,
      ...(ownershipDataset(filing.form) === "sec_filing"
        ? {}
        : { ownership: structuredOwnershipFiling(filing.form, result.bytes) }),
      text: textFromHtml(result.bytes),
    }),
  }));
  const factsBytes = packageBytes(input, {
    sourceUrl: factsResult.provenance.sourceUrl,
    entityName: parsedFacts.entityName,
    selectedFacts: parsedFacts.selected,
    values: financials.registry.records,
    availability: financials.availability,
  });
  const [identityArtifact, factsArtifact, filingArtifacts] = await Promise.all([
    put(input, identityBytes, "application/json"),
    put(input, factsBytes, "application/json"),
    Promise.all(
      packagedFilings.map(({ bytes }) => put(input, bytes, "application/json")),
    ),
  ]);

  const macro = await macroPromise;
  if (macro.status === "rejected") throw macro.reason;
  const [treasury, inflation, unemployment] = macro.value;
  const treasuryAvailable = treasury.status === "available";
  const blsAvailable =
    inflation.status === "available" && unemployment.status === "available";
  const treasuryBytes =
    treasury.status === "available" ? packageBytes(input, treasury) : undefined;
  const inflationBytes =
    inflation.status === "available"
      ? packageBytes(input, inflation)
      : undefined;
  const unemploymentBytes =
    unemployment.status === "available"
      ? packageBytes(input, unemployment)
      : undefined;
  const [treasuryArtifact, inflationArtifact, unemploymentArtifact] =
    await Promise.all([
      treasuryBytes === undefined
        ? undefined
        : put(input, treasuryBytes, "application/json"),
      inflationBytes === undefined
        ? undefined
        : put(input, inflationBytes, "application/json"),
      unemploymentBytes === undefined
        ? undefined
        : put(input, unemploymentBytes, "application/json"),
    ]);
  const marketAvailable =
    provider.familyStates.technical.status === "available";
  const latestCurve =
    treasury.status === "available"
      ? [...treasury.curve].sort((a, b) =>
          b.observationDate.localeCompare(a.observationDate),
        )[0]
      : undefined;
  const latestInflation =
    inflation.status === "available"
      ? [...inflation.observations].sort((left, right) =>
          right.observationDate.localeCompare(left.observationDate),
        )[0]
      : undefined;
  const latestUnemployment =
    unemployment.status === "available"
      ? [...unemployment.observations].sort((left, right) =>
          right.observationDate.localeCompare(left.observationDate),
        )[0]
      : undefined;
  const filingRecords = packagedFilings.map((packaged, index) => {
    const artifact = filingArtifacts[index];
    if (artifact === undefined)
      throw new TypeError("sec_filing_artifact_missing");
    const locator = {
      kind: "sec_filing" as const,
      source: "sec_primary_filing" as const,
      sourceUrl: packaged.result.provenance.sourceUrl,
      accession: packaged.filing.accessionNumber,
      form: packaged.filing.form,
      filedAt: packaged.filing.filedAt,
      acceptedAt: packaged.filing.acceptedAt,
      periodEnd: packaged.filing.period,
      unit: "text",
    };
    return { ...packaged, artifact, locator };
  });
  const annualLocator = filingRecords.find(
    ({ filing }) => filing.accessionNumber === annual.accessionNumber,
  )?.locator;
  if (annualLocator === undefined)
    throw new TypeError("sec_annual_locator_missing");
  const evidence: SnapshotEvidence[] = [
    {
      evidenceId: "identity:sec",
      dataset: "identity",
      rightsSource: "sec_ticker_exchange",
      retrievedAt: tickerResult.provenance.retrievedAt,
      raw: identityArtifact,
      cik: reference.cik,
    },
    ...filingRecords.map(({ filing, result, artifact }) => ({
      evidenceId: `filing:${filing.accessionNumber}`,
      dataset: ownershipDataset(filing.form),
      rightsSource: "sec_primary_filing" as const,
      retrievedAt: result.provenance.retrievedAt,
      raw: artifact,
      form: filing.form,
      accessionNumber: filing.accessionNumber,
      cik: reference.cik,
      filedAt: filing.filedAt,
      acceptedAt: filing.acceptedAt,
      current: true,
    })),
    {
      evidenceId: "facts:current",
      dataset: "sec_company_facts",
      rightsSource: "sec_company_facts",
      retrievedAt: factsResult.provenance.retrievedAt,
      raw: factsArtifact,
      cik: reference.cik,
      current: true,
    },
    ...(treasury.status === "available" && treasuryArtifact !== undefined
      ? [
          {
            evidenceId: "macro:treasury",
            dataset: "treasury_yield" as const,
            rightsSource: "treasury_yield" as const,
            retrievedAt: treasury.provenance.retrievedAt,
            raw: treasuryArtifact,
            current: true,
          },
        ]
      : []),
    ...(inflation.status === "available" && inflationArtifact !== undefined
      ? [
          {
            evidenceId: "macro:cpi",
            dataset: "bls_macro" as const,
            rightsSource: "bls_allowlist" as const,
            retrievedAt: inflation.provenance.retrievedAt,
            raw: inflationArtifact,
            current: true,
          },
        ]
      : []),
    ...(unemployment.status === "available" &&
    unemploymentArtifact !== undefined
      ? [
          {
            evidenceId: "macro:unemployment",
            dataset: "bls_macro" as const,
            rightsSource: "bls_allowlist" as const,
            retrievedAt: unemployment.provenance.retrievedAt,
            raw: unemploymentArtifact,
            current: true,
          },
        ]
      : []),
    ...provider.evidence,
  ];
  const sources: SpecialistSourceArtifact[] = [
    ...filingRecords.map(({ filing, artifact, bytes, locator }) => ({
      evidenceId: `filing:${filing.accessionNumber}`,
      artifactId: artifact.artifactId,
      bytes,
      mediaType: "application/json",
      locator,
    })),
    {
      evidenceId: "facts:current",
      artifactId: factsArtifact.artifactId,
      bytes: factsBytes,
      mediaType: "application/json",
      locator: {
        ...annualLocator,
        source: "sec_company_facts",
        sourceUrl: factsResult.provenance.sourceUrl,
        unit: "registered values",
      },
    },
    ...(treasury.status === "available" &&
    treasuryArtifact !== undefined &&
    treasuryBytes !== undefined &&
    latestCurve !== undefined
      ? [
          {
            evidenceId: "macro:treasury",
            artifactId: treasuryArtifact.artifactId,
            bytes: treasuryBytes,
            mediaType: "application/json",
            locator: {
              kind: "treasury" as const,
              source: "treasury_yield" as const,
              sourceUrl: treasuryYieldSourceUrl(year),
              observationDate: latestCurve.observationDate,
              tenor: "10 Yr",
              unit: "percent",
            },
          },
        ]
      : []),
    ...(inflation.status === "available" &&
    inflationArtifact !== undefined &&
    inflationBytes !== undefined &&
    latestInflation !== undefined
      ? [
          {
            evidenceId: "macro:cpi",
            artifactId: inflationArtifact.artifactId,
            bytes: inflationBytes,
            mediaType: "application/json",
            locator: {
              kind: "macro" as const,
              source: "bls_allowlist" as const,
              sourceUrl: BLS_SOURCE_URL,
              seriesId: "CUUR0000SA0" as const,
              period: latestInflation.period,
              observationDate: latestInflation.observationDate,
              unit: "index",
            },
          },
        ]
      : []),
    ...(unemployment.status === "available" &&
    unemploymentArtifact !== undefined &&
    unemploymentBytes !== undefined &&
    latestUnemployment !== undefined
      ? [
          {
            evidenceId: "macro:unemployment",
            artifactId: unemploymentArtifact.artifactId,
            bytes: unemploymentBytes,
            mediaType: "application/json",
            locator: {
              kind: "macro" as const,
              source: "bls_allowlist" as const,
              sourceUrl: BLS_SOURCE_URL,
              seriesId: "LNS14000000" as const,
              period: latestUnemployment.period,
              observationDate: latestUnemployment.observationDate,
              unit: "percent",
            },
          },
        ]
      : []),
    ...provider.sources,
  ];
  return {
    identity,
    evidence,
    sources,
    valueRegistry: financials.registry,
    retrievedAt:
      [
        retrievedAt,
        ...(treasury.status === "available"
          ? [treasury.provenance.retrievedAt]
          : []),
        ...(inflation.status === "available"
          ? [inflation.provenance.retrievedAt]
          : []),
        ...(unemployment.status === "available"
          ? [unemployment.provenance.retrievedAt]
          : []),
        provider.retrievedAt,
      ]
        .sort()
        .at(-1) ?? retrievedAt,
    treasuryAvailable,
    blsAvailable,
    marketAvailable,
    providerCapabilities: provider.capabilities,
    providerFamilyStates: provider.familyStates,
    providerLimitations: provider.limitations,
    providerRequestLedger: provider.requestLedger,
  };
}
