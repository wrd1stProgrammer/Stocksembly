import Database from "better-sqlite3";
import { z } from "zod";
import { type ResearchReport, ResearchReportSchema } from "../../domain/report";
import type { ArtifactCasPort } from "../../ports/artifacts";
import { ArtifactDigestSchema } from "../../ports/artifacts";
import { applyOrderedMigrations } from "../persistence/sqlite/migrations";

const RowSchema = z.object({
  question_id: z.string().uuid(),
  report_id: z.string().uuid(),
  report_version_id: z.string().uuid(),
  artifact_id: z.string().uuid(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  input_hash: z.string().regex(/^[a-f0-9]{64}$/),
  question_json: z.string(),
});

export type QuestionAttemptContext = {
  readonly questionId: string;
  readonly reportId: string;
  readonly reportVersionId: string;
  readonly reportArtifactId: string;
  readonly reportArtifactDigest: string;
  readonly inputHash: string;
  readonly question: { readonly en: string; readonly ko: string };
  readonly report: ResearchReport;
};

export class QuestionAnswerSqliteAuthority {
  readonly #database: Database.Database;

  constructor(
    path: string,
    private readonly cas: ArtifactCasPort,
    migrationsDirectory?: string,
  ) {
    this.#database = new Database(path, { timeout: 5_000 });
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("busy_timeout = 5000");
    applyOrderedMigrations(this.#database, migrationsDirectory);
  }

  async load(attemptId: string): Promise<QuestionAttemptContext | undefined> {
    const value = this.#database
      .prepare(`SELECT questions.question_id, questions.report_id,
        questions.report_version_id, report_versions.artifact_id,
        artifacts.content_hash, attempts.input_hash, questions.question_json
        FROM attempts JOIN questions USING(job_id)
        JOIN report_versions ON report_versions.version_id = questions.report_version_id
        JOIN artifacts ON artifacts.artifact_id = report_versions.artifact_id
        WHERE attempts.attempt_id = ? AND attempts.kind = 'qa'
          AND attempts.status = 'running' AND questions.status = 'running'`)
      .get(attemptId);
    if (value === undefined) return undefined;
    const row = RowSchema.parse(value);
    const artifact = await this.cas.get(
      ArtifactDigestSchema.parse(row.content_hash),
    );
    if (
      artifact === undefined ||
      artifact.descriptor.artifactId !== row.artifact_id ||
      artifact.descriptor.digest !== row.content_hash
    )
      return undefined;
    const decoded: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(artifact.bytes),
    );
    const report = ResearchReportSchema.parse(decoded);
    if (
      report.reportId !== row.report_id ||
      report.versionId !== row.report_version_id
    )
      return undefined;
    return {
      questionId: row.question_id,
      reportId: row.report_id,
      reportVersionId: row.report_version_id,
      reportArtifactId: row.artifact_id,
      reportArtifactDigest: row.content_hash,
      inputHash: row.input_hash,
      question: z
        .object({ en: z.string(), ko: z.string() })
        .strict()
        .parse(JSON.parse(row.question_json)),
      report,
    };
  }

  close(): void {
    if (this.#database.open) this.#database.close();
  }
}
