import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  cleanupApiTestDatabases,
  createApiTestDatabase,
} from "../api/postgresApi.testSupport";
import { backfillPublishedResearchQuestionLocalizations } from "./researchRoomLocalizations";
import { translateResearchText } from "./researchTranslationRunner";

vi.mock("./researchTranslationRunner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./researchTranslationRunner")>()),
  translateResearchText: vi.fn(async () => new Map<string, string>()),
}));

it("restarts over published ticker-only research without trying to translate an absent direction", async () => {
  const root = await mkdtemp(join(tmpdir(), "question-backfill-"));
  const database = await createApiTestDatabase();
  await database.query(`
    CREATE TABLE reports(run_id TEXT, state TEXT);
    CREATE TABLE research_requests(run_id TEXT, locale TEXT, question TEXT, created_at TEXT);
    CREATE TABLE research_question_localizations(run_id TEXT, locale TEXT, question TEXT);
  `);
  for (const [index, question] of ["", "   ", "\t\n", "\u3000"].entries()) {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    await database.query("INSERT INTO reports VALUES ($1, 'published')", [id]);
    await database.query(
      "INSERT INTO research_requests VALUES ($1, 'en', $2, '2026-09-10')",
      [id, question],
    );
  }
  try {
    await expect(
      backfillPublishedResearchQuestionLocalizations(database),
    ).resolves.toBe(0);
    expect(translateResearchText).not.toHaveBeenCalled();
    expect(
      (
        await database.query(
          "SELECT question FROM research_requests ORDER BY run_id",
          [],
        )
      ).rows,
    ).toEqual([
      { question: "" },
      { question: "   " },
      { question: "\t\n" },
      { question: "\u3000" },
    ]);
  } finally {
    await cleanupApiTestDatabases();
    // Pool is cleaned up after the test.
    await rm(root, { recursive: true, force: true });
  }
});
