import { randomUUID } from "node:crypto";
import { persistAuthoritativeReport } from "../../../application/assembleReportPersistence";
import type {
  PublishAuthoritativeReportInput,
  PublishAuthoritativeReportOptions,
} from "../../../application/authoritativeReportPublisherContracts";
import { hashCanonical } from "../../../domain/contractHelpers";
import { reserveEditorialQualityRewrite } from "../../../workflow/specialistCommitRetry";
import { publishReportAtomically } from "./atomicReportPublication";
import { loadReportAuthority } from "./authoritativeReportAuthority";

export type PublishAuthoritativeReportResult =
  | {
      readonly kind: "published";
      readonly reportId: string;
      readonly versionId: string;
      readonly artifactId: string;
      readonly digest: string;
    }
  | { readonly kind: "incomplete"; readonly reason: string };

export async function publishAuthoritativeReportForRun(
  options: PublishAuthoritativeReportOptions,
  input: PublishAuthoritativeReportInput,
): Promise<PublishAuthoritativeReportResult> {
  const authority = await loadReportAuthority(
    options.databasePath,
    options.cas,
    input,
  );
  if (authority === undefined)
    return { kind: "incomplete", reason: "authority_authentication_failed" };
  const result = await persistAuthoritativeReport(
    {
      cas: options.cas,
      ...(options.now === undefined ? {} : { now: options.now }),
      persistence: {
        save: (commit) =>
          publishReportAtomically(options.databasePath, {
            runId: input.runId,
            acceptedChairArtifactId: input.acceptedChairArtifactId,
            fence: input.fence,
            expectedRunVersion: authority.runVersion,
            eventId: options.newId?.() ?? randomUUID(),
            commit,
          }),
      },
      reserveEditorialRewrite: (inputHash) =>
        reserveEditorialQualityRewrite({
          databasePath: options.databasePath,
          runId: input.runId,
          inputHash: hashCanonical(inputHash),
          now: options.now?.() ?? new Date().toISOString(),
        }),
    },
    authority,
  );
  if (result.kind === "blocked") {
    process.stderr.write(
      `${JSON.stringify({
        kind: "report_publication_blocked",
        runId: input.runId,
        reason: result.reason,
      })}\n`,
    );
    return { kind: "incomplete", reason: result.reason };
  }
  return {
    kind: "published",
    reportId: result.report.reportId,
    versionId: result.report.versionId,
    artifactId: result.descriptor.artifactId,
    digest: result.descriptor.digest,
  };
}
