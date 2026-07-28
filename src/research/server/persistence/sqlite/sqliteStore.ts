import Database from "better-sqlite3";
import { z } from "zod";
import {
  findAttempt,
  recoverUncertainAttempts,
  researchOrdinals,
} from "./attemptRepository";
import { SqliteConfigurationError } from "./errors";
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
import {
  applyOrderedMigrations,
  defaultMigrationsDirectory,
} from "./migrations";
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
  SqlitePragmas,
  StoredAttempt,
  StoredEvent,
  StoredJob,
  StoredRun,
  TransitionRunInput,
} from "./types";

const VersionSchema = z.object({ version: z.number().int().positive() });
const TableSchema = z.object({ name: z.string() });

export type OpenSqliteStoreOptions = {
  readonly migrationsDirectory?: string;
};

function configure(database: Database.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("synchronous = FULL");
  database.pragma("busy_timeout = 5000");
  database.pragma("wal_autocheckpoint = 1000");
}

export class SqliteStore {
  readonly #database: Database.Database;

  private constructor(database: Database.Database) {
    this.#database = database;
  }

  public static open(
    path: string,
    options: OpenSqliteStoreOptions = {},
  ): SqliteStore {
    const database = new Database(path, { timeout: 5_000 });
    try {
      configure(database);
      applyOrderedMigrations(
        database,
        options.migrationsDirectory ?? defaultMigrationsDirectory,
      );
      return new SqliteStore(database);
    } catch (error) {
      database.close();
      throw error;
    }
  }

  public close(): void {
    if (this.#database.open) this.#database.close();
  }

  public transaction<Result>(
    operation: (store: SqliteStore) => Result,
  ): Result {
    return this.#database.transaction(() => operation(this)).immediate();
  }

  public pragmas(): SqlitePragmas {
    const journalMode = this.#database.pragma("journal_mode", { simple: true });
    const foreignKeys = this.#database.pragma("foreign_keys", { simple: true });
    const synchronous = this.#database.pragma("synchronous", { simple: true });
    const busyTimeout = this.#database.pragma("busy_timeout", { simple: true });
    const walAutocheckpoint = this.#database.pragma("wal_autocheckpoint", {
      simple: true,
    });
    if (journalMode !== "wal")
      throw new SqliteConfigurationError("journal_mode", journalMode);
    if (foreignKeys !== 1)
      throw new SqliteConfigurationError("foreign_keys", foreignKeys);
    if (synchronous !== 2)
      throw new SqliteConfigurationError("synchronous", synchronous);
    if (busyTimeout !== 5_000)
      throw new SqliteConfigurationError("busy_timeout", busyTimeout);
    if (walAutocheckpoint !== 1_000)
      throw new SqliteConfigurationError(
        "wal_autocheckpoint",
        walAutocheckpoint,
      );
    return {
      journalMode,
      foreignKeys,
      synchronous,
      busyTimeout,
      walAutocheckpoint,
    };
  }

  public schemaVersions(): readonly number[] {
    return this.#database
      .prepare<[], unknown>(
        "SELECT version FROM schema_migrations ORDER BY version",
      )
      .all()
      .map((row) => VersionSchema.parse(row).version);
  }

  public tableNames(): readonly string[] {
    return this.#database
      .prepare<[], unknown>(`SELECT name FROM sqlite_schema
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all()
      .map((row) => TableSchema.parse(row).name);
  }

  public createRun(input: CreateRunInput): void {
    createRun(this.#database, input);
  }

  public createChildRun(input: CreateChildRunInput): StoredRun {
    return createChildRun(this.#database, input);
  }

  public requestRunCancellation(
    input: RequestRunCancellationInput,
  ): RunCancellationRequest {
    return requestRunCancellation(this.#database, input);
  }

  public finalizeRunCancellation(input: FinalizeRunCancellationInput): boolean {
    return finalizeRunCancellation(this.#database, input);
  }

  public transitionRun(input: TransitionRunInput): number {
    return transitionRun(this.#database, input);
  }

  public appendRunEvent(input: AppendRunEventInput): number {
    return appendRunEvent(this.#database, input);
  }

  public findRun(runId: string): StoredRun | undefined {
    return findRun(this.#database, runId);
  }

  public findJob(jobId: string): StoredJob | undefined {
    return findJob(this.#database, jobId);
  }

  public eventsAfter(runId: string, sequence: number): readonly StoredEvent[] {
    return eventsAfter(this.#database, runId, sequence);
  }

  public leaseJob(input: LeaseRequest): LeaseGrant | undefined {
    return leaseJob(this.#database, input);
  }

  public heartbeatJobLease(
    input: FencedJobInput & { readonly expiresAt: string },
  ): boolean {
    return heartbeatJobLease(this.#database, input);
  }

  public reserveResearchLaunch(
    input: ReserveResearchLaunchInput,
  ): LaunchReservation {
    return reserveResearchLaunch(this.#database, input);
  }

  public reserveQuestionLaunch(
    input: ReserveQuestionLaunchInput,
  ): LaunchReservation {
    return reserveQuestionLaunch(this.#database, input);
  }

  public recoverUncertainAttempts(): readonly string[] {
    return recoverUncertainAttempts(this.#database);
  }

  public findAttempt(attemptId: string): StoredAttempt | undefined {
    return findAttempt(this.#database, attemptId);
  }

  public researchOrdinals(runId: string): readonly number[] {
    return researchOrdinals(this.#database, runId);
  }

  public saveArtifactMetadata(input: ArtifactMetadataInput): string {
    return saveArtifactMetadata(this.#database, input);
  }

  public findArtifactByContentHash(
    contentHash: string,
    snapshotId: string,
  ): { readonly artifactId: string; readonly snapshotId: string } | undefined {
    return findArtifactByContentHash(this.#database, contentHash, snapshotId);
  }

  public addArtifactEdge(input: ArtifactEdgeInput): void {
    addArtifactEdge(this.#database, input);
  }

  public saveReportVersion(input: SaveReportVersionInput): number {
    return saveReportVersion(this.#database, input);
  }

  public createQuestion(input: CreateQuestionInput): number {
    return createQuestion(this.#database, input);
  }

  public claimIdempotency(input: IdempotencyInput): IdempotencyResult {
    return claimIdempotency(this.#database, input);
  }

  public acquireMaintenanceLease(
    input: MaintenanceLeaseRequest,
  ): MaintenanceLease | undefined {
    return acquireMaintenanceLease(this.#database, input);
  }

  public refreshMaintenanceLease(
    input: MaintenanceFence & { readonly expiresAt: string },
  ): boolean {
    return refreshMaintenanceLease(this.#database, input);
  }

  public quiesceMaintenanceLease(input: MaintenanceFence): boolean {
    return quiesceMaintenanceLease(this.#database, input);
  }

  public completeMaintenanceLease(
    input: MaintenanceFence & { readonly completedAt: string },
  ): boolean {
    return completeMaintenanceLease(this.#database, input);
  }

  public releaseMaintenanceLease(input: MaintenanceFence): boolean {
    return releaseMaintenanceLease(this.#database, input);
  }
}

export function openSqliteStore(
  path: string,
  options: OpenSqliteStoreOptions = {},
): SqliteStore {
  return SqliteStore.open(path, options);
}

export {
  IdempotencyConflictError,
  LaunchReservationError,
  MigrationIntegrityError,
  SqliteConfigurationError,
  StateConflictError,
  UnsafePersistenceValueError,
} from "./errors";
export { loadOrderedMigrations } from "./migrations";
export type * from "./types";
