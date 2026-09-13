import { afterEach, describe, expect, it } from "vitest";
import { createResearchTestDatabase } from "../../../../test/researchPostgres";
import { migrateResearchDatabase } from "./migrations";
import { openPostgresStore } from "./postgresStore";
import { createRunFixture, fixture } from "./postgresStore.contractFixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe("PostgreSQL ordered migrations", () => {
  it("creates the complete research schema with durable transactions and foreign keys", async () => {
    const database = await createResearchTestDatabase();
    cleanups.push(database.close);
    const store = await openPostgresStore(database.pool);
    expect(await store.schemaVersions()).toEqual([1, 2, 3]);
    expect(await store.tableNames()).toEqual([
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
      "news_candidate_classifications",
      "news_events",
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
      "storage_imports",
      "symbol_registry",
      "symbol_registry_aliases",
    ]);
    expect(
      (await database.pool.query("SHOW synchronous_commit")).rows[0],
    ).toEqual({ synchronous_commit: "on" });
    expect(
      Number(
        (
          await database.pool.query(
            "SELECT count(*) AS count FROM pg_constraint WHERE connamespace = 'research'::regnamespace AND contype = 'f'",
          )
        ).rows[0].count,
      ),
    ).toBeGreaterThan(0);
  });
  it("reopens a populated database without reapplying migrations or losing rows", async () => {
    const database = await createResearchTestDatabase();
    cleanups.push(database.close);
    const first = await openPostgresStore(database.pool);
    await first.createRun(createRunFixture(60));
    const before = await database.pool.query(
      "SELECT * FROM schema_migrations ORDER BY version",
    );
    await migrateResearchDatabase(database.pool);
    const reopened = await openPostgresStore(database.pool);
    expect(
      (
        await database.pool.query(
          "SELECT * FROM schema_migrations ORDER BY version",
        )
      ).rows,
    ).toEqual(before.rows);
    expect(await reopened.findRun(fixture(60).runId)).toEqual(
      await first.findRun(fixture(60).runId),
    );
  });
});
// Historical SQLite versions are input formats for the one-time importer, not PostgreSQL
// migrations. Their data-preservation coverage belongs to the importer's fixtures. WAL,
// pragma flags and file reopen are replaced here by native durability and schema checks.
