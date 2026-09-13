import { z } from "zod";
import {
  findAttempt,
  recoverUncertainAttempts,
  researchOrdinals,
} from "./attemptRepository";
import { type ResearchDatabase, researchTransaction } from "./database";
import {
  reserveQuestionLaunch,
  reserveResearchLaunch,
} from "./launchRepository";
import {
  acquireMaintenanceLease,
  completeMaintenanceLease,
  heartbeatJobLease,
  leaseJob,
  quiesceMaintenanceLease,
  refreshMaintenanceLease,
  releaseMaintenanceLease,
} from "./leaseRepository";
import {
  addArtifactEdge,
  claimIdempotency,
  createQuestion,
  findArtifactByContentHash,
  saveArtifactMetadata,
  saveReportVersion,
} from "./metadataRepository";
import { getResearchPool } from "./researchPool";

import {
  finalizeRunCancellation,
  requestRunCancellation,
} from "./runControlRepository";
import {
  appendRunEvent,
  createChildRun,
  createRun,
  eventsAfter,
  findJob,
  findRun,
  transitionRun,
} from "./runRepository";
import type {
  AppendRunEventInput,
  ArtifactEdgeInput,
  ArtifactMetadataInput,
  CreateChildRunInput,
  CreateQuestionInput,
  CreateRunInput,
  FencedJobInput,
  FinalizeRunCancellationInput,
  IdempotencyInput,
  IdempotencyResult,
  LaunchReservation,
  LeaseGrant,
  LeaseRequest,
  MaintenanceFence,
  MaintenanceLease,
  MaintenanceLeaseRequest,
  RequestRunCancellationInput,
  ReserveQuestionLaunchInput,
  ReserveResearchLaunchInput,
  RunCancellationRequest,
  SaveReportVersionInput,
  StoredAttempt,
  StoredEvent,
  StoredJob,
  StoredRun,
  TransitionRunInput,
} from "./types";

export class PostgresStore {
  private constructor(public readonly database: ResearchDatabase) {}
  public static async open(pool?: ResearchDatabase): Promise<PostgresStore> {
    return new PostgresStore(pool ?? (await getResearchPool()));
  }
  public async close(): Promise<void> {
    // Pool lifetime belongs to the process; closing a request-scoped store must not terminate it.
  }
  public async transaction<Result>(
    operation: (store: PostgresStore) => Promise<Result>,
  ): Promise<Result> {
    return researchTransaction(this.database, (client) =>
      operation(new PostgresStore(client)),
    );
  }
  public async schemaVersions(): Promise<readonly number[]> {
    return (
      await this.database.query(
        "SELECT version FROM research.schema_migrations ORDER BY version",
      )
    ).rows.map(
      (row) => z.object({ version: z.number().int() }).parse(row).version,
    );
  }
  public async tableNames(): Promise<readonly string[]> {
    return (
      await this.database.query(
        "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'research' ORDER BY tablename",
      )
    ).rows.map((row) => z.object({ name: z.string() }).parse(row).name);
  }
  public async createRun(input: CreateRunInput): Promise<void> {
    await createRun(this.database, input);
  }

  public async createChildRun(input: CreateChildRunInput): Promise<StoredRun> {
    return createChildRun(this.database, input);
  }

  public async requestRunCancellation(
    input: RequestRunCancellationInput,
  ): Promise<RunCancellationRequest> {
    return requestRunCancellation(this.database, input);
  }

  public async finalizeRunCancellation(
    input: FinalizeRunCancellationInput,
  ): Promise<boolean> {
    return finalizeRunCancellation(this.database, input);
  }

  public async transitionRun(input: TransitionRunInput): Promise<number> {
    return transitionRun(this.database, input);
  }

  public async appendRunEvent(input: AppendRunEventInput): Promise<number> {
    return appendRunEvent(this.database, input);
  }

  public async findRun(runId: string): Promise<StoredRun | undefined> {
    return findRun(this.database, runId);
  }

  public async findJob(jobId: string): Promise<StoredJob | undefined> {
    return findJob(this.database, jobId);
  }

  public async eventsAfter(
    runId: string,
    sequence: number,
  ): Promise<readonly StoredEvent[]> {
    return eventsAfter(this.database, runId, sequence);
  }

  public async leaseJob(input: LeaseRequest): Promise<LeaseGrant | undefined> {
    return leaseJob(this.database, input);
  }

  public async heartbeatJobLease(
    input: FencedJobInput & { readonly expiresAt: string },
  ): Promise<boolean> {
    return heartbeatJobLease(this.database, input);
  }

  public async reserveResearchLaunch(
    input: ReserveResearchLaunchInput,
  ): Promise<LaunchReservation> {
    return reserveResearchLaunch(this.database, input);
  }

  public async reserveQuestionLaunch(
    input: ReserveQuestionLaunchInput,
  ): Promise<LaunchReservation> {
    return reserveQuestionLaunch(this.database, input);
  }

  public async recoverUncertainAttempts(): Promise<readonly string[]> {
    return recoverUncertainAttempts(this.database);
  }

  public async findAttempt(
    attemptId: string,
  ): Promise<StoredAttempt | undefined> {
    return findAttempt(this.database, attemptId);
  }

  public async researchOrdinals(runId: string): Promise<readonly number[]> {
    return researchOrdinals(this.database, runId);
  }

  public async saveArtifactMetadata(
    input: ArtifactMetadataInput,
  ): Promise<string> {
    return saveArtifactMetadata(this.database, input);
  }

  public async findArtifactByContentHash(
    contentHash: string,
    snapshotId: string,
  ): Promise<
    { readonly artifactId: string; readonly snapshotId: string } | undefined
  > {
    return findArtifactByContentHash(this.database, contentHash, snapshotId);
  }

  public async addArtifactEdge(input: ArtifactEdgeInput): Promise<void> {
    await addArtifactEdge(this.database, input);
  }

  public async saveReportVersion(
    input: SaveReportVersionInput,
  ): Promise<number> {
    return saveReportVersion(this.database, input);
  }

  public async createQuestion(input: CreateQuestionInput): Promise<number> {
    return createQuestion(this.database, input);
  }

  public async claimIdempotency(
    input: IdempotencyInput,
  ): Promise<IdempotencyResult> {
    return claimIdempotency(this.database, input);
  }

  public async acquireMaintenanceLease(
    input: MaintenanceLeaseRequest,
  ): Promise<MaintenanceLease | undefined> {
    return acquireMaintenanceLease(this.database, input);
  }

  public async refreshMaintenanceLease(
    input: MaintenanceFence & { readonly expiresAt: string },
  ): Promise<boolean> {
    return refreshMaintenanceLease(this.database, input);
  }

  public async quiesceMaintenanceLease(
    input: MaintenanceFence,
  ): Promise<boolean> {
    return quiesceMaintenanceLease(this.database, input);
  }

  public async completeMaintenanceLease(
    input: MaintenanceFence & { readonly completedAt: string },
  ): Promise<boolean> {
    return completeMaintenanceLease(this.database, input);
  }

  public async releaseMaintenanceLease(
    input: MaintenanceFence,
  ): Promise<boolean> {
    return releaseMaintenanceLease(this.database, input);
  }
}
export async function openPostgresStore(
  pool?: ResearchDatabase,
): Promise<PostgresStore> {
  return PostgresStore.open(pool);
}
export {
  IdempotencyConflictError,
  LaunchReservationError,
  MigrationIntegrityError,
  StateConflictError,
  UnsafePersistenceValueError,
} from "./errors";
export type * from "./types";
