import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it, vi } from "vitest";
import { backfillPublishedResearchQuestionLocalizations } from "./researchRoomLocalizations";
import { translateResearchText } from "./researchTranslationRunner";

vi.mock("./researchTranslationRunner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./researchTranslationRunner")>()),
  translateResearchText: vi.fn(async () => new Map<string, string>()),
}));

it("restarts over published ticker-only research without trying to translate an absent direction", async () => {
  const root = await mkdtemp(join(tmpdir(), "question-backfill-"));
  const path = join(root, "research.sqlite");
  const database = new Database(path);
  database.exec(`
    CREATE TABLE reports(run_id TEXT, state TEXT);
    CREATE TABLE research_requests(run_id TEXT, locale TEXT, question TEXT, created_at TEXT);
    CREATE TABLE research_question_localizations(run_id TEXT, locale TEXT, question TEXT);
  `);
  for (const [index, question] of ["", "   ", "\t\n", "\u3000"].entries()) {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    database.prepare("INSERT INTO reports VALUES (?, 'published')").run(id);
    database
      .prepare(
        "INSERT INTO research_requests VALUES (?, 'en', ?, '2026-09-10')",
      )
      .run(id, question);
  }
  try {
    await expect(
      backfillPublishedResearchQuestionLocalizations(path),
    ).resolves.toBe(0);
    expect(translateResearchText).not.toHaveBeenCalled();
    expect(
      database
        .prepare("SELECT question FROM research_requests ORDER BY run_id")
        .all(),
    ).toEqual([
      { question: "" },
      { question: "   " },
      { question: "\t\n" },
      { question: "\u3000" },
    ]);
  } finally {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});
