import { rmSync } from "node:fs";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadOrderedMigrations,
  openSqliteStore,
  type SqliteStore,
} from "./sqliteStore";
import {
  at,
  fixture,
  hash,
  temporaryDatabase,
} from "./sqliteStore.contractFixtures";

const stores: SqliteStore[] = [];
const directories: string[] = [];

function databasePath(): string {
  const temporary = temporaryDatabase();
  directories.push(temporary.directory);
  return temporary.path;
}

function open(path: string): SqliteStore {
  const store = openSqliteStore(path);
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("SQLite ordered migrations", () => {
  it("migrates an empty database and applies the required durability pragmas", () => {
    // Given
    const path = databasePath();

    // When
    const store = open(path);

    // Then
    expect(store.schemaVersions()).toEqual(
      loadOrderedMigrations().map((migration) => migration.version),
    );
    expect(store.pragmas()).toEqual({
      journalMode: "wal",
      foreignKeys: 1,
      synchronous: 2,
      busyTimeout: 5_000,
      walAutocheckpoint: 1_000,
    });
    expect(store.tableNames()).toEqual([
      "agent_output_commits",
      "agent_runner_evidence",
      "artifact_citation_metadata",
      "artifact_edges",
      "artifacts",
      "attempt_web_evidence",
      "attempts",
      "auxiliary_codex_usage",
      "idempotency_records",
      "job_input_artifacts",
      "jobs",
      "maintenance_leases",
      "question_call_ordinals",
      "question_runner_evidence",
      "questions",
      "report_follow_up_versions",
      "report_versions",
      "reports",
      "research_call_ordinals",
      "research_quality_observations",
      "research_question_localizations",
      "research_report_translations",
      "research_requests",
      "research_room_views",
      "research_translation_model_calls",
      "run_events",
      "run_lineage",
      "run_public_limitations",
      "run_stage_recoveries",
      "runs",
      "schema_migrations",
      "snapshots",
      "symbol_registry",
      "symbol_registry_aliases",
    ]);
  });

  it("continues a prior schema and reopens without reapplying migrations", () => {
    // Given
    const path = databasePath();
    const first = loadOrderedMigrations()[0];
    expect(first).toBeDefined();
    if (first === undefined)
      throw new RangeError("missing first migration fixture");
    const prior = new Database(path);
    prior.exec("BEGIN IMMEDIATE");
    prior.exec(first.sql);
    prior
      .prepare(`INSERT INTO schema_migrations(version, name, checksum, applied_at)
        VALUES (?, ?, ?, '2026-07-22T00:00:00.000Z')`)
      .run(first.version, first.name, first.checksum);
    prior.exec("COMMIT");
    prior.close();

    // When
    const migrated = open(path);
    const applied = migrated.schemaVersions();
    migrated.close();
    const reopened = open(path);

    // Then
    const expectedVersions = loadOrderedMigrations().map(
      (migration) => migration.version,
    );
    expect(applied).toEqual(expectedVersions);
    expect(reopened.schemaVersions()).toEqual(expectedVersions);
  });

  it("reopens a database after the applied recovery migration without a checksum error", () => {
    // Given: migration 22 was already applied by the local database before
    // the current source tree was loaded.
    const path = databasePath();
    const appliedRecoveryMigrationChecksum =
      "8d4d4b7486b0335f37d0f45cbfa29593acc0f580b47a6ff623e754156aa924b3";
    const prior = new Database(path);
    prior.exec(`CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT`);
    const insert = prior.prepare(
      `INSERT INTO schema_migrations(version, name, checksum, applied_at)
       VALUES (?, ?, ?, ?)`,
    );
    for (const migration of loadOrderedMigrations().slice(0, 21)) {
      prior.exec(migration.sql);
      insert.run(migration.version, migration.name, migration.checksum, at(0));
    }
    const recoveryMigration = loadOrderedMigrations()[21];
    if (recoveryMigration === undefined)
      throw new RangeError("missing recovery migration fixture");
    prior.exec(recoveryMigration.sql);
    insert.run(
      22,
      "022_research_recovery.sql",
      appliedRecoveryMigrationChecksum,
      at(0),
    );
    prior.close();

    // When
    const reopened = open(path);

    // Then
    expect(reopened.schemaVersions()).toEqual(
      loadOrderedMigrations().map((migration) => migration.version),
    );
  });

  it("upgrades a populated version-three schema without losing its attempt", () => {
    // Given
    const path = databasePath();
    const ids = fixture(60);
    const inputHash = hash(60);
    const prior = new Database(path);
    prior.pragma("foreign_keys = ON");
    prior.exec("BEGIN IMMEDIATE");
    for (const migration of loadOrderedMigrations().slice(0, 3)) {
      prior.exec(migration.sql);
      prior
        .prepare(`INSERT INTO schema_migrations(version, name, checksum, applied_at)
          VALUES (?, ?, ?, ?)`)
        .run(migration.version, migration.name, migration.checksum, at(0));
    }
    prior
      .prepare(`INSERT INTO runs(
        run_id, snapshot_id, status, last_event_seq, created_at
      ) VALUES (?, ?, 'running', 0, ?)`)
      .run(ids.runId, ids.snapshotId, at(0));
    prior
      .prepare(`INSERT INTO snapshots(
        snapshot_id, run_id, state, requested_at
      ) VALUES (?, ?, 'collecting', ?)`)
      .run(ids.snapshotId, ids.runId, at(0));
    prior
      .prepare(`INSERT INTO jobs(
        job_id, run_id, snapshot_id, kind, logical_key, input_hash,
        status, created_at, attempt_id
      ) VALUES (?, ?, ?, 'research', 'prior-job', ?, 'retry-wait', ?, ?)`)
      .run(
        ids.jobId,
        ids.runId,
        ids.snapshotId,
        inputHash,
        at(0),
        ids.attemptId,
      );
    prior
      .prepare(`INSERT INTO attempts(
        attempt_id, job_id, run_id, snapshot_id, kind, status,
        logical_artifact_key, input_hash, created_at, outcome
      ) VALUES (?, ?, ?, ?, 'research', 'unknown', 'prior-artifact', ?, ?, 'unknown')`)
      .run(
        ids.attemptId,
        ids.jobId,
        ids.runId,
        ids.snapshotId,
        inputHash,
        at(0),
      );
    prior
      .prepare(`INSERT INTO research_call_ordinals(
        run_id, ordinal, job_id, attempt_id, logical_artifact_key,
        input_hash, reserved_at
      ) VALUES (?, 1, ?, ?, 'prior-artifact', ?, ?)`)
      .run(ids.runId, ids.jobId, ids.attemptId, inputHash, at(0));
    prior.exec("COMMIT");
    prior.close();

    // When
    const upgraded = open(path);

    // Then
    expect(upgraded.schemaVersions()).toEqual(
      loadOrderedMigrations().map((migration) => migration.version),
    );
    expect(upgraded.findAttempt(ids.attemptId)).toMatchObject({
      attemptId: ids.attemptId,
      status: "unknown",
      ordinal: 1,
    });
  });

  it("preserves populated probe-low provenance when applying migration thirteen", () => {
    // Given
    const path = databasePath();
    const ids = fixture(70);
    const inputHash = hash(70);
    const transcriptHash =
      "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570";
    const prior = new Database(path);
    prior.pragma("foreign_keys = ON");
    prior.exec("BEGIN IMMEDIATE");
    for (const migration of loadOrderedMigrations().slice(0, 12)) {
      prior.exec(migration.sql);
      prior
        .prepare(`INSERT INTO schema_migrations(version, name, checksum, applied_at)
          VALUES (?, ?, ?, ?)`)
        .run(migration.version, migration.name, migration.checksum, at(0));
    }
    prior.exec("COMMIT");
    prior.pragma("ignore_check_constraints = ON");
    prior.exec("BEGIN IMMEDIATE");
    prior
      .prepare(`INSERT INTO runs(
        run_id, snapshot_id, status, last_event_seq, created_at
      ) VALUES (?, ?, 'running', 0, ?)`)
      .run(ids.runId, ids.snapshotId, at(0));
    prior
      .prepare(`INSERT INTO snapshots(
        snapshot_id, run_id, state, requested_at
      ) VALUES (?, ?, 'collecting', ?)`)
      .run(ids.snapshotId, ids.runId, at(0));
    prior
      .prepare(`INSERT INTO jobs(
        job_id, run_id, snapshot_id, kind, logical_key, input_hash,
        input_manifest_hash, status, created_at, attempt_id
      ) VALUES (?, ?, ?, 'research', 'probe', ?, ?, 'running', ?, ?)`)
      .run(
        ids.jobId,
        ids.runId,
        ids.snapshotId,
        inputHash,
        inputHash,
        at(0),
        ids.attemptId,
      );
    prior
      .prepare(`INSERT INTO attempts(
        attempt_id, job_id, run_id, snapshot_id, kind, status,
        logical_artifact_key, input_hash, input_manifest_hash, created_at
      ) VALUES (?, ?, ?, ?, 'research', 'running', 'probe', ?, ?, ?)`)
      .run(
        ids.attemptId,
        ids.jobId,
        ids.runId,
        ids.snapshotId,
        inputHash,
        inputHash,
        at(0),
      );
    prior
      .prepare(`INSERT INTO agent_runner_evidence(
        attempt_id, stage, prompt_hash, schema_hash, input_hash,
        binary_hash, cli_version, recorded_at, model, reasoning,
        browsing_policy, tool_transcript_hash
      ) VALUES (?, 'probe', ?, ?, ?, ?, 'codex-cli 0.146.0-alpha.3.1', ?,
        'gpt-5.6-sol', 'low', 'disabled', ?)`)
      .run(
        ids.attemptId,
        inputHash,
        inputHash,
        inputHash,
        inputHash,
        at(0),
        transcriptHash,
      );
    prior.pragma("ignore_check_constraints = OFF");
    prior.exec("COMMIT");
    prior.close();

    // When
    const upgraded = open(path);
    const inspection = new Database(path, { readonly: true });

    // Then
    expect(upgraded.schemaVersions()).toEqual(
      loadOrderedMigrations().map((migration) => migration.version),
    );
    expect(
      inspection
        .prepare(`SELECT stage, reasoning, browsing_policy
          FROM agent_runner_evidence WHERE attempt_id = ?`)
        .get(ids.attemptId),
    ).toEqual({
      stage: "probe",
      reasoning: "low",
      browsing_policy: "disabled",
    });
    inspection.close();
  });
});
