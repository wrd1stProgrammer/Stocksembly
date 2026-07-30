import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { z } from "zod";
import { assignAllAgents } from "../application/assignAllAgents";
import { createSnapshotManifest } from "../application/buildSnapshotManifest";
import { createResearchMandate } from "../application/createMandate";
import type {
  CapabilityDisclosure,
  CapabilityManifest,
} from "../domain/capabilities";
import {
  ArtifactIdSchema,
  EventIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { normalizeResearchDirection } from "../domain/researchDirection";
import { ResearchTargetSchema } from "../domain/researchTarget";
import {
  WORKFLOW_V1_CHAIR_ID,
  WORKFLOW_V1_ROLE_REGISTRY,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import type { AttemptHandler } from "../worker/leaseEngine";
import type { SpecialistRoundInput } from "../workflow/specialistRound";
import type { SpecialistRoundSqliteAuthority } from "../workflow/specialistRoundSqliteAuthority";
import {
  prepareSpecialistJobs,
  specialistJobSeed,
} from "../workflow/specialistRoundSqliteStage";
import { collectInitialEvidence } from "./initialCollectionData";

const RequestSchema = z.object({
  symbol: z.string(),
  question: z.string(),
  locale: z.enum(["en", "ko"]),
  research_kind: z.enum(["committee", "department"]),
  department_id: z.enum(["market", "company", "financial", "risk"]).nullable(),
  requested_at: z.string(),
});

type InitialCollectionHandlerOptions = {
  readonly dataRoot: string;
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly cas: ArtifactCasPort;
  readonly authority: SpecialistRoundSqliteAuthority;
  readonly commitStore: SqliteAgentOutputCommitStore;
  readonly now?: () => string;
};

function event(
  kind: string,
  occurredAt: string,
  en: string,
  ko: string,
  participantIds: readonly string[] = [],
) {
  return {
    eventId: EventIdSchema.parse(randomUUID()),
    type: kind,
    stateId: kind,
    occurredAt,
    payload: {
      schemaVersion: "workflow-v1",
      participantIds,
      claimIds: [],
      sourceIds: [],
      limitationIds: [],
      summary: { en, ko },
    },
  } as const;
}

function after(value: string, milliseconds: number): string {
  return new Date(Date.parse(value) + milliseconds).toISOString();
}

export function normalizeResearchQuestion(
  question: string,
): string | undefined {
  return normalizeResearchDirection(question);
}

export function defaultResearchQuestion(
  symbol: string,
  locale: "en" | "ko",
): string {
  return locale === "ko"
    ? `${symbol}의 현재 투자 매력도를 사업 경쟁력, 성장의 지속성, 재무 건전성, 밸류에이션 제약, 핵심 촉매와 하방 위험을 함께 고려해 평가하고, 판단을 바꿀 조건을 제시해 주세요.`
    : `Evaluate ${symbol}'s current investment case across business quality, durability of growth, financial resilience, valuation constraints, catalysts, downside risks, and the conditions that would change the view.`;
}

function capabilities(
  treasuryAvailable: boolean,
  blsAvailable: boolean,
  licensed: readonly CapabilityDisclosure[],
): CapabilityManifest {
  const unavailable = {
    availability: "unavailable" as const,
    reason: "not_configured" as const,
  };
  return {
    version: "workflow-v1",
    disclosures: [
      {
        key: "identity",
        state: { availability: "available", source: "official_sec" },
      },
      {
        key: "sec_filings",
        state: { availability: "available", source: "official_sec" },
      },
      {
        key: "sec_company_facts",
        state: { availability: "available", source: "official_sec" },
      },
      {
        key: "bls_macro",
        state: blsAvailable
          ? { availability: "available", source: "official_bls" }
          : { availability: "unavailable", reason: "provider_failure" },
      },
      {
        key: "treasury_yield",
        state: treasuryAvailable
          ? { availability: "available", source: "official_treasury" }
          : { availability: "unavailable", reason: "provider_failure" },
      },
      {
        key: "current_market_data",
        state:
          licensed.find((item) => item.key === "current_market_data")?.state ??
          unavailable,
      },
      { key: "consensus", state: unavailable },
      {
        key: "professional_news",
        state:
          licensed.find((item) => item.key === "professional_news")?.state ??
          unavailable,
      },
      {
        key: "options",
        state:
          licensed.find((item) => item.key === "options")?.state ?? unavailable,
      },
      { key: "short_interest", state: unavailable },
    ],
  };
}

export function createInitialCollectionHandler(
  options: InitialCollectionHandlerOptions,
): AttemptHandler {
  const database = new Database(options.databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  const store = openSqliteStore(options.databasePath, {
    ...(options.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: options.migrationsDirectory }),
  });
  const clock = options.now ?? (() => new Date().toISOString());

  return {
    run: async (attempt) => {
      const request = RequestSchema.parse(
        database
          .prepare(`SELECT symbol, question, locale, research_kind,
            department_id, created_at AS requested_at
            FROM research_requests WHERE run_id = ?`)
          .get(attempt.runId),
      );
      const runId = RunIdSchema.parse(attempt.runId);
      const snapshotId = SnapshotIdSchema.parse(attempt.snapshotId);
      const researchTarget = ResearchTargetSchema.parse(
        request.research_kind === "department" && request.department_id !== null
          ? {
              kind: "department",
              departmentId: request.department_id,
            }
          : { kind: "committee" },
      );
      const collectionStartedAt =
        clock() < request.requested_at ? request.requested_at : clock();
      store.transitionRun({
        runId,
        fromStatus: "running",
        toStatus: "running",
        nextJobs: [],
        event: event(
          "collection_started",
          collectionStartedAt,
          "Official SEC and macro evidence collection started.",
          "SEC 및 공식 거시경제 근거 수집을 시작했습니다.",
        ),
      });
      let collected: Awaited<ReturnType<typeof collectInitialEvidence>>;
      try {
        collected = await collectInitialEvidence({
          dataRoot: options.dataRoot,
          runId,
          snapshotId,
          symbol: request.symbol,
          cas: options.cas,
        });
      } catch (error) {
        const code =
          error instanceof Error ? error.message : "collection_failed";
        return { kind: "permanent", code };
      }
      if (!collected.treasuryAvailable || !collected.blsAvailable)
        return {
          kind: "permanent",
          code: !collected.treasuryAvailable
            ? "required_treasury_collection_failed"
            : "required_bls_collection_failed",
        };
      const acquisitionClosedAt =
        clock() > collected.retrievedAt ? clock() : collected.retrievedAt;
      const evidenceCutoffAt = after(acquisitionClosedAt, 1);
      const snapshotSealedAt = after(evidenceCutoffAt, 1);
      const mandateSealedAt = after(snapshotSealedAt, 1);
      const manifestCapabilities = capabilities(
        collected.treasuryAvailable,
        collected.blsAvailable,
        collected.providerCapabilities,
      );
      const marketDataAvailable =
        manifestCapabilities.disclosures.find(
          (item) => item.key === "current_market_data",
        )?.state.availability === "available";
      const manifest = createSnapshotManifest(
        {
          runId,
          snapshotId,
          identity: collected.identity,
          versions: {
            schema: "snapshot-v1",
            marketPack: "us-official-v1",
            normalizationPolicy: "sec-company-facts-v1",
            rightsPolicy: "workflow-v1",
            adapters: {
              sec: "v1",
              bls: "v1",
              treasury: "v1",
              alpaca: "daily-bars-v1",
              insightsentry: "workflow-routing-v1",
            },
            parsers: { filing: "html-text-v1", companyFacts: "v1" },
            calculations: {
              financials: "v1",
              technicals: "sma-rsi-macd-atr-bollinger-v1",
            },
          },
          capabilities: manifestCapabilities,
          valueRegistry: collected.valueRegistry,
          failures: [
            ...(collected.treasuryAvailable
              ? []
              : [
                  {
                    dataset: "treasury_yield" as const,
                    code: "provider_failure",
                  },
                ]),
            ...(collected.blsAvailable
              ? []
              : [
                  {
                    dataset: "bls_macro" as const,
                    code: "provider_failure",
                  },
                ]),
            ...(marketDataAvailable
              ? []
              : [
                  {
                    dataset: "current_market_data" as const,
                    code: "not_configured_or_provider_failure",
                  },
                ]),
            ...Object.entries(collected.providerFamilyStates)
              .filter(([, state]) => state.status !== "available")
              .map(([family, state]) => ({
                dataset:
                  family === "technical" || family === "quote"
                    ? ("current_market_data" as const)
                    : family === "fundamentals"
                      ? ("insightsentry_fundamentals" as const)
                      : family === "news"
                        ? ("insightsentry_news" as const)
                        : (`insightsentry_${family}` as
                            | "insightsentry_documents"
                            | "insightsentry_calendar"
                            | "insightsentry_peers"
                            | "insightsentry_options"),
                code: state.limitation ?? state.status,
              })),
          ],
          times: {
            requestedAt: request.requested_at,
            collectionStartedAt,
            acquisitionClosedAt,
            evidenceCutoffAt,
            snapshotSealedAt,
            mandateSealedAt,
          },
        },
        collected.evidence,
        [
          ...(collected.treasuryAvailable
            ? []
            : ["official_treasury_unavailable"]),
          ...(collected.blsAvailable ? [] : ["official_bls_unavailable"]),
          ...(marketDataAvailable
            ? []
            : ["licensed_market_data_not_configured"]),
          ...collected.providerLimitations,
        ],
      );
      store.transitionRun({
        runId,
        fromStatus: "running",
        toStatus: "running",
        nextJobs: [],
        event: event(
          "evidence_cutoff_recorded",
          evidenceCutoffAt,
          "The evidence cutoff was recorded.",
          "근거 기준 시점을 확정했습니다.",
        ),
      });
      options.authority.sealSnapshot(
        snapshotId,
        evidenceCutoffAt,
        snapshotSealedAt,
      );
      store.transitionRun({
        runId,
        fromStatus: "running",
        toStatus: "running",
        nextJobs: [],
        event: event(
          "snapshot_sealed",
          snapshotSealedAt,
          "The immutable research snapshot was sealed.",
          "변경 불가능한 리서치 스냅샷을 봉인했습니다.",
        ),
      });
      const question =
        normalizeResearchQuestion(request.question) ??
        defaultResearchQuestion(request.symbol, request.locale);
      const mandate = await createResearchMandate(
        {
          snapshotManifestHash: manifest.manifestHash,
          symbol: request.symbol,
          question,
          locale: request.locale,
          scope: "broad",
          capabilities: manifest.capabilities,
          rosterIds: [...WORKFLOW_V1_SPECIALIST_IDS, WORKFLOW_V1_CHAIR_ID],
        },
        {
          clock: { mandateSealedAt: () => mandateSealedAt },
          repository: {
            loadSnapshotAdmission: () =>
              Promise.resolve({
                snapshot: manifest,
                lifecycle: [
                  "run_created",
                  "collection_started",
                  "evidence_cutoff_recorded",
                  "snapshot_sealed",
                ],
              }),
          },
        },
      );
      const assignments = await assignAllAgents(
        {
          mandate,
          snapshot: manifest,
          rosterIds: WORKFLOW_V1_SPECIALIST_IDS,
        },
        {
          transaction: async (operation) =>
            await operation({
              persistMandate: () => Promise.resolve(),
              persistAssignments: () => Promise.resolve(),
              persistChair: () => Promise.resolve(),
              appendMandateSealedEvent: () => Promise.resolve(),
            }),
        },
      );
      const round: SpecialistRoundInput = {
        mandate,
        snapshot: manifest,
        assignments,
      };
      const canonicalSources = [];
      for (const source of collected.sources) {
        const evidence = collected.evidence.find(
          (item) => item.evidenceId === source.evidenceId,
        );
        const artifact =
          evidence?.normalized?.artifactId === source.artifactId
            ? evidence.normalized
            : evidence?.raw;
        if (artifact === undefined)
          return { kind: "permanent", code: "source_artifact_missing" };
        const existing = store.findArtifactByContentHash(
          artifact.digest,
          attempt.snapshotId,
        );
        if (existing !== undefined) {
          canonicalSources.push({
            ...source,
            artifactId: ArtifactIdSchema.parse(existing.artifactId),
          });
        } else {
          const canonicalArtifactId = store.saveArtifactMetadata({
            ...artifact,
            contentHash: artifact.digest,
            logicalKey: `evidence:${source.evidenceId}`,
            inputHash: artifact.digest,
            createdAt: snapshotSealedAt,
            locator: source.locator,
          });
          canonicalSources.push({
            ...source,
            artifactId: ArtifactIdSchema.parse(canonicalArtifactId),
          });
        }
      }
      const preparedJobs = prepareSpecialistJobs(round, canonicalSources);
      const selectedRoleIds =
        researchTarget.kind === "committee"
          ? WORKFLOW_V1_SPECIALIST_IDS
          : WORKFLOW_V1_ROLE_REGISTRY.departments[researchTarget.departmentId]
              .memberIds;
      const selectedRoleSet = new Set<string>(selectedRoleIds);
      const jobs = preparedJobs.filter((job) =>
        selectedRoleSet.has(job.roleId),
      );
      const first = jobs[0];
      if (first === undefined)
        return { kind: "permanent", code: "specialist_roster_empty" };
      options.authority.persistJobs(jobs, mandateSealedAt);
      store.transitionRun({
        runId,
        fromStatus: "running",
        toStatus: "running",
        nextJobs: jobs.map((job) => specialistJobSeed(job, mandateSealedAt)),
        event:
          researchTarget.kind === "committee"
            ? event(
                "mandate_sealed",
                mandateSealedAt,
                "All eleven specialists received evidence-bound mandates.",
                "11명의 모든 전문 에이전트에게 근거가 결합된 조사 과제를 배정했습니다.",
              )
            : event(
                "mandate_sealed",
                mandateSealedAt,
                `The ${researchTarget.departmentId} team received a focused evidence-bound mandate.`,
                `${researchTarget.departmentId} 팀에게 근거가 결합된 심층 조사 과제를 배정했습니다.`,
                selectedRoleIds,
              ),
      });
      for (const job of jobs)
        for (const artifactId of job.sourceArtifactIds)
          options.commitStore.bindJobInputArtifact({
            jobId: job.jobId,
            artifactId,
          });
      options.authority.releaseSystemCollectionReservation(
        runId,
        attempt.attemptId,
      );
      return { kind: "accepted" };
    },
  };
}
