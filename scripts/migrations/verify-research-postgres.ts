import { withResearchAuditDatabase } from "../../src/research/quality/researchAuditDatabase";
import {
  findPublicReport,
  findPublicRun,
  listPublicEventsForRun,
} from "../../src/research/server/api/researchApiQueries";
import { loadPublicResearchReport } from "../../src/research/server/api/researchApiReportReader";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Usage: verify-research-postgres --data-root DIRECTORY\nReads every run, event, and published report through application readers using a read-only PostgreSQL connection. The directory must contain the existing artifact store.",
    );
    return;
  }
  const dataRoot = args[1];
  if (args.length !== 2 || args[0] !== "--data-root" || !dataRoot) {
    throw new Error("Expected --data-root DIRECTORY");
  }
  await withResearchAuditDatabase(async (database) => {
    const runs = (
      await database.query<{ run_id: string; principal_id: string }>(
        "SELECT run_id, principal_id FROM research.research_requests",
      )
    ).rows;
    let events = 0;
    for (const row of runs) {
      if (!(await findPublicRun(database, row.principal_id, row.run_id))) {
        throw new Error("Stored run could not be read");
      }
      events += (await listPublicEventsForRun(database, row.run_id)).length;
    }
    const publications = (
      await database.query<{ report_id: string; principal_id: string }>(
        "SELECT reports.report_id, research_requests.principal_id FROM research.reports JOIN research.research_requests USING(run_id) WHERE state='published'",
      )
    ).rows;
    for (const row of publications) {
      const publication = await findPublicReport(
        database,
        row.principal_id,
        row.report_id,
      );
      if (
        !publication ||
        !(await loadPublicResearchReport({ database, dataRoot }, publication))
      ) {
        throw new Error("Published report or its artifact could not be read");
      }
    }
    console.log(
      JSON.stringify({
        status: "verified",
        runs: runs.length,
        reports: publications.length,
        events,
      }),
    );
  });
}
main().catch(() => {
  console.error(
    "Research verification failed; check database connectivity, ownership, and the artifact directory. No data was changed.",
  );
  process.exitCode = 1;
});
