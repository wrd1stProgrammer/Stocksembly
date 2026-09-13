import { z } from "zod";
import type {
  ResearchReport,
  WorkflowV2ResearchReport,
  WorkflowV3ResearchReport,
} from "../../domain/report";
import { parseStoredResearchReportVersioned } from "../../domain/reportStorage";
import type { ArtifactCasPort } from "../../ports/artifacts";
import { ArtifactDigestSchema } from "../../ports/artifacts";
import type { ResearchDatabase } from "../persistence/postgres/database";

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
  readonly report:
    | ResearchReport
    | WorkflowV2ResearchReport
    | WorkflowV3ResearchReport;
};

export class QuestionAnswerPostgresAuthority {
  readonly #database: ResearchDatabase;

  constructor(
    database: ResearchDatabase,
    private readonly cas: ArtifactCasPort,
  ) {
    this.#database = database;
  }

  async load(attemptId: string): Promise<QuestionAttemptContext | undefined> {
    const value = (
      await this.#database.query(
        `SELECT questions.question_id, questions.report_id,
        questions.report_version_id, report_versions.artifact_id,
        artifacts.content_hash, attempts.input_hash, questions.question_json
        FROM attempts JOIN questions USING(job_id)
        JOIN report_versions ON report_versions.version_id = questions.report_version_id
        JOIN artifacts ON artifacts.artifact_id = report_versions.artifact_id
        WHERE attempts.attempt_id = $1 AND attempts.kind = 'qa'
          AND attempts.status = 'running' AND questions.status = 'running'`,
        [attemptId],
      )
    ).rows[0];
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
    const report = parseStoredResearchReportVersioned(decoded);
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
    // The process owns the shared pool.
  }
}
