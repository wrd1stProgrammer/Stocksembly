import type Database from "better-sqlite3";
import { z } from "zod";
import { StructuralAuditArtifactEnvelopeSchema } from "../../../application/structuralAuditPersistenceContracts";
import { canonicalJson, hashBytes } from "../../../domain/contractHelpers";
import {
  type EvidenceSource,
  SourceLocatorSchema,
} from "../../../domain/evidenceCoreSchemas";
import type { ArtifactCasPort } from "../../../ports/artifacts";
import { ArtifactDigestSchema } from "../../../ports/artifacts";

const RowSchema = z.object({
  artifact_id: z.string().uuid(),
  run_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  content_hash: ArtifactDigestSchema,
  logical_key: z.string(),
  created_at: z.string().datetime(),
  locator_json: z.string().nullable(),
  envelope_json: z.string().nullable(),
});
const EnvelopeSchema = z
  .object({ roleId: z.string(), stage: z.string() })
  .passthrough();
const ProviderContentSchema = z
  .object({
    coverage: z
      .array(
        z
          .object({
            observedStart: z.string().datetime(),
            observedEnd: z.string().datetime(),
            barCount: z.number().int().nonnegative(),
          })
          .passthrough(),
      )
      .optional(),
    observedAt: z.string().datetime().optional(),
    limitations: z.array(z.string()).optional(),
    familyStates: z
      .record(
        z.string(),
        z
          .object({
            status: z.enum([
              "available",
              "stale",
              "unavailable",
              "withheld",
              "withheld_by_rights",
            ]),
            limitation: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

type EvidenceSlice = {
  readonly artifactId: string;
  readonly evidenceId: string;
  readonly exactText: string;
  readonly source: EvidenceSource;
  readonly retrievedAt: string;
  readonly availableAt: string;
};

const SOURCE_PUBLISHERS = {
  sec_ticker_exchange: "U.S. Securities and Exchange Commission",
  sec_submissions: "U.S. Securities and Exchange Commission",
  sec_company_facts: "U.S. Securities and Exchange Commission",
  sec_primary_filing: "U.S. Securities and Exchange Commission",
  sec_exhibit: "U.S. Securities and Exchange Commission",
  bls_allowlist: "U.S. Bureau of Labor Statistics",
  treasury_yield: "U.S. Department of the Treasury",
  alpaca_market_data: "Alpaca Market Data",
  insightsentry_rapidapi: "InsightSentry via RapidAPI",
  captured_web: "Captured web source",
} as const;

function sourceAuthenticationFailed(
  reason: string,
  sourceId: string,
): undefined {
  process.stderr.write(
    `${JSON.stringify({
      kind: "report_source_authentication_failed",
      reason,
      sourceId,
    })}\n`,
  );
  return undefined;
}

export async function loadAuthenticatedReportSources(
  database: Database.Database,
  cas: ArtifactCasPort,
  runId: string,
  sourceIds: ReadonlySet<string>,
  slices: readonly EvidenceSlice[],
) {
  const rows = database
    .prepare(`SELECT artifacts.artifact_id, artifacts.run_id,
      artifacts.snapshot_id, artifacts.content_hash, artifacts.logical_key,
      artifacts.created_at, artifact_citation_metadata.locator_json,
      agent_output_commits.envelope_json
      FROM artifacts LEFT JOIN agent_output_commits USING(artifact_id)
      LEFT JOIN artifact_citation_metadata USING(artifact_id)
      WHERE artifacts.run_id = ?`)
    .all(runId)
    .map((row) => RowSchema.parse(row));
  const sources = [];
  for (const sourceId of sourceIds) {
    const row = rows.find((candidate) => candidate.artifact_id === sourceId);
    if (row === undefined)
      return sourceAuthenticationFailed("artifact_row_missing", sourceId);
    const stored = await cas.get(row.content_hash);
    if (
      stored === undefined ||
      stored.descriptor.digest !== row.content_hash ||
      hashBytes(stored.bytes) !== row.content_hash
    )
      return sourceAuthenticationFailed("blob_digest_invalid", sourceId);
    const slice = slices.find((candidate) => candidate.artifactId === sourceId);
    if (slice !== undefined) {
      const locator = SourceLocatorSchema.safeParse(
        row.locator_json === null ? undefined : JSON.parse(row.locator_json),
      );
      if (!locator.success || locator.data.source !== slice.source)
        return sourceAuthenticationFailed("slice_locator_invalid", sourceId);
      const publisher =
        locator.data.kind === "captured_web"
          ? locator.data.publisher
          : SOURCE_PUBLISHERS[slice.source];
      if (publisher === undefined)
        return sourceAuthenticationFailed("publisher_missing", sourceId);
      const provider =
        locator.data.kind === "licensed_provider"
          ? ProviderContentSchema.safeParse(
              JSON.parse(new TextDecoder().decode(stored.bytes)),
            )
          : undefined;
      const observedPeriod =
        locator.data.kind === "market"
          ? {
              from: `${locator.data.periodStart}T00:00:00.000Z`,
              to: `${locator.data.periodEnd}T00:00:00.000Z`,
            }
          : locator.data.kind === "licensed_provider" &&
              provider?.success &&
              provider.data.coverage !== undefined &&
              provider.data.coverage.length > 0
            ? {
                from:
                  provider.data.coverage
                    .map((coverage) => coverage.observedStart)
                    .sort()[0] ?? row.created_at,
                to:
                  provider.data.coverage
                    .map((coverage) => coverage.observedEnd)
                    .sort()
                    .at(-1) ?? row.created_at,
                observationCount: provider.data.coverage.reduce(
                  (count, coverage) => count + coverage.barCount,
                  0,
                ),
              }
            : locator.data.kind === "licensed_provider" &&
                provider?.success &&
                provider.data.observedAt !== undefined
              ? {
                  from: provider.data.observedAt,
                  to: provider.data.observedAt,
                  observationCount: 1,
                }
              : undefined;
      const familyStates =
        provider?.success && provider.data.familyStates !== undefined
          ? Object.values(provider.data.familyStates)
          : [];
      const providerStatus =
        locator.data.kind !== "licensed_provider"
          ? "available"
          : familyStates.length === 0 ||
              familyStates.some((state) => state.status === "available")
            ? "available"
            : familyStates.some((state) => state.status === "stale")
              ? "stale"
              : familyStates.some(
                    (state) => state.status === "withheld_by_rights",
                  )
                ? "withheld_by_rights"
                : "unavailable";
      const limitations = [
        ...(provider?.success ? (provider.data.limitations ?? []) : []),
        ...familyStates.flatMap((state) =>
          state.limitation === undefined ? [] : [state.limitation],
        ),
      ];
      sources.push({
        sourceId,
        title:
          locator.data.kind === "captured_web"
            ? locator.data.title
            : slice.evidenceId,
        publisher,
        sourceClass: slice.source,
        dataset:
          locator.data.kind === "licensed_provider"
            ? locator.data.dataset
            : locator.data.kind === "captured_web"
              ? "captured_web"
              : locator.data.kind,
        providerStatus,
        ...(observedPeriod === undefined ? {} : { observedPeriod }),
        ...(limitations.length === 0
          ? {}
          : { limitations: [...new Set(limitations)].slice(0, 32) }),
        retrievedAt: slice.retrievedAt,
        observedOrFiledAt: slice.availableAt,
        url: locator.data.sourceUrl,
        excerpt: slice.exactText.slice(0, 1_500).trim(),
      });
      continue;
    }
    const raw: unknown = JSON.parse(new TextDecoder().decode(stored.bytes));
    const locator = SourceLocatorSchema.safeParse(
      row.locator_json === null ? undefined : JSON.parse(row.locator_json),
    );
    if (locator.success && locator.data.kind === "licensed_provider") {
      const provider = ProviderContentSchema.safeParse(raw);
      if (!provider.success)
        return sourceAuthenticationFailed("provider_payload_invalid", sourceId);
      const familyStates = Object.values(provider.data.familyStates ?? {});
      const providerStatus =
        familyStates.length === 0 ||
        familyStates.some((state) => state.status === "available")
          ? "available"
          : familyStates.some((state) => state.status === "stale")
            ? "stale"
            : familyStates.some(
                  (state) => state.status === "withheld_by_rights",
                )
              ? "withheld_by_rights"
              : "unavailable";
      const limitations = [
        ...(provider.data.limitations ?? []),
        ...familyStates.flatMap((state) =>
          state.limitation === undefined ? [] : [state.limitation],
        ),
      ];
      sources.push({
        sourceId,
        title: row.logical_key.replace(/^evidence:/u, ""),
        publisher: SOURCE_PUBLISHERS.insightsentry_rapidapi,
        sourceClass: "insightsentry_rapidapi",
        dataset: locator.data.dataset,
        providerStatus,
        ...(limitations.length === 0
          ? {}
          : { limitations: [...new Set(limitations)].slice(0, 32) }),
        retrievedAt: row.created_at,
        observedOrFiledAt: row.created_at,
        url: locator.data.sourceUrl,
        excerpt: new TextDecoder().decode(stored.bytes).slice(0, 1_500).trim(),
      });
      continue;
    }
    if (row.logical_key === "structural_audit:system") {
      const structural = StructuralAuditArtifactEnvelopeSchema.safeParse(raw);
      if (
        !structural.success ||
        structural.data.runId !== row.run_id ||
        structural.data.snapshotId !== row.snapshot_id
      )
        return sourceAuthenticationFailed(
          "structural_envelope_invalid",
          sourceId,
        );
      sources.push({
        sourceId,
        title: row.logical_key,
        publisher: "SERN deterministic structural audit",
        sourceClass: "structural_audit",
        retrievedAt: row.created_at,
      });
      continue;
    }
    if (row.envelope_json === null)
      return sourceAuthenticationFailed("agent_envelope_missing", sourceId);
    const envelope = EnvelopeSchema.safeParse(raw);
    if (
      !envelope.success ||
      canonicalJson(raw) !== canonicalJson(JSON.parse(row.envelope_json))
    )
      return sourceAuthenticationFailed("agent_envelope_invalid", sourceId);
    sources.push({
      sourceId,
      title: row.logical_key,
      publisher: envelope.data.roleId,
      sourceClass: envelope.data.stage,
      retrievedAt: row.created_at,
    });
  }
  return sources;
}
