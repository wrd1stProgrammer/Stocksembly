import { createHash, randomUUID } from "node:crypto";
import type { SnapshotEvidence } from "../application/buildSnapshot";
import type { CapabilityDisclosure } from "../domain/capabilities";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import type { ResearchProfile } from "../domain/researchProfile";
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
import { isRegistrationFinancialForm } from "../server/data/sec/secFilingForms";
import type { SpecialistSourceArtifact } from "../workflow/specialistRoundSqlite";
import {
  collectInsightSentryInitialEvidence,
  type InsightSentryInitialCollection,
} from "./insightSentryInitialCollection";

const encoder = new TextEncoder();
const BLS_MACRO_SERIES = [
  {
    seriesId: "CUUR0000SA0",
    evidenceId: "macro:cpi",
    unit: "index",
    required: true,
  },
  {
    seriesId: "CUUR0000SA0L1E",
    evidenceId: "macro:core-cpi",
    unit: "index",
    required: false,
  },
  {
    seriesId: "LNS14000000",
    evidenceId: "macro:unemployment",
    unit: "percent",
    required: true,
  },
  {
    seriesId: "CES0000000001",
    evidenceId: "macro:nonfarm-payrolls",
    unit: "thousands of persons",
    required: false,
  },
  {
    seriesId: "CES0500000003",
    evidenceId: "macro:average-hourly-earnings",
    unit: "USD per hour",
    required: false,
  },
  {
    seriesId: "WPUFD4",
    evidenceId: "macro:producer-prices",
    unit: "index",
    required: false,
  },
] as const;

export type InitialCollectionInput = {
  readonly dataRoot: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly symbol: string;
  readonly cas: ArtifactCasPort;
  readonly researchProfile?: ResearchProfile;
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
  if (/^(?:SC 13[DG]|SCHEDULE 13[DG])(?:\/A)?$/u.test(form)) {
    const reportingPersons = filingBlocks(
      source,
      "coverPageHeaderReportingPersonDetails",
    )
      .map((block) => ({
        name: filingTagValue(block, "reportingPersonName"),
        type: filingTagValue(block, "typeOfReportingPerson"),
        shares: filingTagValue(
          block,
          "reportingPersonBeneficiallyOwnedAggregateNumberOfShares",
        ),
        classPercent: filingTagValue(block, "classPercent"),
        soleVotingPower: filingTagValue(block, "soleVotingPower"),
        sharedVotingPower: filingTagValue(block, "sharedVotingPower"),
        soleDispositivePower: filingTagValue(block, "soleDispositivePower"),
        sharedDispositivePower: filingTagValue(block, "sharedDispositivePower"),
        comments: filingTagValue(block, "comments"),
      }))
      .filter((person) =>
        Object.values(person).some((value) => value !== undefined),
      )
      .slice(0, 20);
    return {
      kind: "beneficial_ownership",
      issuer: filingTagValue(source, "issuerName"),
      issuerCik: filingTagValue(source, "issuerCik"),
      securityClass: filingTagValue(source, "securitiesClassTitle"),
      cusip: filingTagValue(source, "issuerCusipNumber"),
      eventDate: filingTagValue(source, "eventDateRequiresFilingThisStatement"),
      reportingPersons,
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

export function ownershipDataset(
  form: string,
  accessionNumber?: string,
  subjectCik?: string,
) {
  if (/^(?:3|4|5)(?:\/A)?$/u.test(form))
    return "sec_insider_transactions" as const;
  if (
    /^(?:SC 13[DG]|SCHEDULE 13[DG])(?:\/A)?$/u.test(form) &&
    (accessionNumber === undefined ||
      subjectCik === undefined ||
      accessionNumber.slice(0, 10) !== subjectCik)
  )
    return "sec_institutional_holdings" as const;
  return "sec_filing" as const;
}

export function selectPrimaryCompanyFiling<
  T extends SelectedFiling & {
    readonly form: string;
    readonly acceptedAt: string;
  },
>(records: readonly T[]): T | undefined {
  const latest = (forms: readonly string[]) =>
    records
      .filter((record) => forms.includes(record.form))
      .sort((left, right) =>
        right.acceptedAt.localeCompare(left.acceptedAt),
      )[0];
  return (
    latest(["10-K"]) ?? latest(["8-K"]) ?? latest(["424B4", "S-1/A", "S-1"])
  );
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

function isSecNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SEC_HTTP_STATUS" &&
    "status" in error &&
    error.status === 404
  );
}

async function fetchSecFilingDocument<T extends SelectedFiling>(
  client: Pick<SecClient, "fetch">,
  subjectCik: string,
  filing: T,
): Promise<SecFetchResult> {
  const accessionCik = filing.accessionNumber.slice(0, 10);
  const candidateCiks = [...new Set([subjectCik, accessionCik])];
  for (const [index, cik] of candidateCiks.entries()) {
    try {
      return await client.fetch({
        kind: "filing_document",
        cik,
        accessionNumber: filing.accessionNumber,
        primaryDocument: filing.primaryDocument,
      });
    } catch (error) {
      if (!isSecNotFound(error) || index === candidateCiks.length - 1)
        throw error;
    }
  }
  throw new TypeError("sec_filing_document_missing");
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
        result: await fetchSecFilingDocument(input.client, input.cik, filing),
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
  const primaryFiling = selectPrimaryCompanyFiling(submissions.value.records);
  if (primaryFiling === undefined)
    throw new TypeError("sec_primary_filing_missing");
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
    .filter(
      (record) =>
        ownershipDataset(record.form, record.accessionNumber, reference.cik) ===
        "sec_institutional_holdings",
    )
    .sort((left, right) => right.acceptedAt.localeCompare(left.acceptedAt))
    .slice(0, 6);
  const selectedFilings = [
    ...new Map(
      [
        primaryFiling,
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
      ...BLS_MACRO_SERIES.map(({ seriesId }) =>
        createBlsAdapter({
          dataRoot: input.dataRoot,
          transport,
          clock,
        }).collect({
          seriesId,
          startYear: year - 2,
          endYear: year,
        }),
      ),
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
    .filter(
      (record) =>
        ["10-K", "10-K/A", "10-Q", "10-Q/A"].includes(record.form) ||
        isRegistrationFinancialForm(record.form),
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
  const primaryFilingResult = filingResults.find(
    ({ filing }) => filing.accessionNumber === primaryFiling.accessionNumber,
  );
  if (primaryFilingResult === undefined)
    throw new TypeError("sec_primary_filing_result_missing");
  const provider = await collectInsightSentryInitialEvidence({
    dataRoot: input.dataRoot,
    runId: input.runId,
    snapshotId: input.snapshotId,
    identity,
    asOf: new Date().toISOString(),
    cas: input.cas,
    peerProfile: {
      annualAccessionNumber: primaryFiling.accessionNumber,
      annualText: textFromHtml(primaryFilingResult.result.bytes),
    },
    requestedComparisonSymbols: input.researchProfile?.comparisonSymbols ?? [],
    ...(input.researchProfile === undefined
      ? {}
      : { decisionPurpose: input.researchProfile.decisionPurpose }),
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
      ...(ownershipDataset(
        filing.form,
        filing.accessionNumber,
        reference.cik,
      ) === "sec_filing"
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
  const [treasury, ...blsCollections] = macro.value;
  const blsRecords = BLS_MACRO_SERIES.flatMap((definition, index) => {
    const collection = blsCollections[index];
    if (collection?.status !== "available") return [];
    const latest = [...collection.observations].sort((left, right) =>
      right.observationDate.localeCompare(left.observationDate),
    )[0];
    if (latest === undefined) return [];
    return [
      {
        definition,
        collection,
        latest,
        bytes: packageBytes(input, collection),
      },
    ];
  });
  const treasuryAvailable = treasury.status === "available";
  const availableBlsSeries = new Set(
    blsRecords.map(({ definition }) => definition.seriesId),
  );
  const blsAvailable = BLS_MACRO_SERIES.filter(
    ({ required }) => required,
  ).every(({ seriesId }) => availableBlsSeries.has(seriesId));
  const treasuryBytes =
    treasury.status === "available" ? packageBytes(input, treasury) : undefined;
  const [treasuryArtifact, blsArtifacts] = await Promise.all([
    treasuryBytes === undefined
      ? undefined
      : put(input, treasuryBytes, "application/json"),
    Promise.all(
      blsRecords.map(({ bytes }) => put(input, bytes, "application/json")),
    ),
  ]);
  const sealedBlsRecords = blsRecords.map((record, index) => {
    const artifact = blsArtifacts[index];
    if (artifact === undefined)
      throw new TypeError("bls_macro_artifact_missing");
    return { ...record, artifact };
  });
  const marketAvailable =
    provider.familyStates.technical.status === "available";
  const latestCurve =
    treasury.status === "available"
      ? [...treasury.curve].sort((a, b) =>
          b.observationDate.localeCompare(a.observationDate),
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
  const primaryLocator = filingRecords.find(
    ({ filing }) => filing.accessionNumber === primaryFiling.accessionNumber,
  )?.locator;
  if (primaryLocator === undefined)
    throw new TypeError("sec_primary_locator_missing");
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
      dataset: ownershipDataset(
        filing.form,
        filing.accessionNumber,
        reference.cik,
      ),
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
    ...sealedBlsRecords.map(({ definition, collection, artifact }) => ({
      evidenceId: definition.evidenceId,
      dataset: "bls_macro" as const,
      rightsSource: "bls_allowlist" as const,
      retrievedAt: collection.provenance.retrievedAt,
      raw: artifact,
      current: true,
    })),
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
        ...primaryLocator,
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
    ...sealedBlsRecords.map(({ definition, latest, bytes, artifact }) => ({
      evidenceId: definition.evidenceId,
      artifactId: artifact.artifactId,
      bytes,
      mediaType: "application/json",
      locator: {
        kind: "macro" as const,
        source: "bls_allowlist" as const,
        sourceUrl: BLS_SOURCE_URL,
        seriesId: definition.seriesId,
        period: latest.period,
        observationDate: latest.observationDate,
        unit: definition.unit,
      },
    })),
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
        ...sealedBlsRecords.map(
          ({ collection }) => collection.provenance.retrievedAt,
        ),
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
