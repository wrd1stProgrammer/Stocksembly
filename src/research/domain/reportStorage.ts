import { z } from "zod";
import {
  type ResearchReport,
  ResearchReportSchema,
  type WorkflowV2ResearchReport,
  WorkflowV2ResearchReportSchema,
} from "./report";
import { LocalizedReportSchema } from "./reportComponents";

const StoredRecordSchema = z.record(z.string(), z.unknown());
const StoredLocaleSchema = z.enum(["en", "ko"]);

/**
 * Workflow-v1 artifacts keep only the language selected for the run. V2 is
 * persisted unchanged so rollback selection never backfills either artifact.
 */
export function singleLocaleReportForStorage(
  report: ResearchReport | WorkflowV2ResearchReport,
  locale: "en" | "ko",
): Record<string, unknown> {
  if (report.schemaVersion === "workflow-v2")
    return structuredClone(report) as Record<string, unknown>;
  const { locales, ...reportFields } = report;
  return {
    ...reportFields,
    schemaVersion: "workflow-v1-single-locale",
    locale,
    narrative: locales[locale],
    teamViews: report.teamViews.map((view) => ({
      ...view,
      position: view.position[locale],
      rationale: view.rationale[locale],
    })),
    claims: report.claims.map((claim) => ({
      ...claim,
      ...(claim.text === undefined ? {} : { text: claim.text[locale] }),
    })),
    providerDisagreements: report.providerDisagreements.map((entry) => ({
      ...entry,
      note: entry.note[locale],
    })),
  };
}

export type PresentationResearchReport =
  | Readonly<{ kind: "legacy-v1-read-only"; report: Readonly<ResearchReport> }>
  | Readonly<{
      kind: "workflow-v2";
      report: Readonly<WorkflowV2ResearchReport>;
    }>;

/** Explicit compatibility boundary. Legacy reports are parsed for presentation only. */
export function parseStoredResearchReportForPresentation(
  value: unknown,
): PresentationResearchReport {
  const report = parseStoredResearchReportVersioned(value);
  return report.schemaVersion === "workflow-v1"
    ? { kind: "legacy-v1-read-only", report }
    : { kind: "workflow-v2", report };
}

/** Publisher rollback selects an existing artifact and never rewrites either version. */
export function selectPublisherReportVersion(
  input: Readonly<{
    workflowV1: unknown;
    workflowV2: unknown;
    rollbackToV1: boolean;
  }>,
): ResearchReport | WorkflowV2ResearchReport {
  const v1 = parseStoredResearchReportVersioned(input.workflowV1);
  const v2 = parseStoredResearchReportVersioned(input.workflowV2);
  if (v1.schemaVersion !== "workflow-v1")
    throw new Error("publisher rollback requires a workflow-v1 artifact");
  if (v2.schemaVersion !== "workflow-v2")
    throw new Error("publisher selection requires a workflow-v2 artifact");
  return input.rollbackToV1 ? v1 : v2;
}

export function parseStoredResearchReportVersioned(
  value: unknown,
): ResearchReport | WorkflowV2ResearchReport {
  const candidate = StoredRecordSchema.safeParse(value);
  if (candidate.success) {
    const { schemaVersion } = candidate.data;
    if (schemaVersion === "workflow-v2")
      return WorkflowV2ResearchReportSchema.parse(value);
  }
  return parseStoredResearchReport(value);
}

export function parseStoredResearchReport(value: unknown): ResearchReport {
  const candidate = StoredRecordSchema.safeParse(value);
  if (!candidate.success) return ResearchReportSchema.parse(value);
  const {
    schemaVersion,
    locale,
    narrative: storedNarrative,
    teamViews: storedTeamViews,
    claims: storedClaims,
    providerDisagreements: storedProviderDisagreements,
  } = candidate.data;
  if (schemaVersion !== "workflow-v1-single-locale")
    return ResearchReportSchema.parse(value);

  StoredLocaleSchema.parse(locale);
  const narrative = LocalizedReportSchema.parse(storedNarrative);
  const teamViews = z
    .array(
      z
        .object({
          departmentId: z.string(),
          position: z.string().min(1),
          vote: z.string(),
          rationale: z.string().min(1),
        })
        .passthrough(),
    )
    .parse(storedTeamViews);
  const claims = z
    .array(z.object({ text: z.string().min(1).optional() }).passthrough())
    .parse(storedClaims);
  const providerDisagreements = z
    .array(z.object({ note: z.string().min(1) }).passthrough())
    .parse(storedProviderDisagreements);
  const canonicalFields = Object.fromEntries(
    Object.entries(candidate.data).filter(
      ([key]) => key !== "locale" && key !== "narrative",
    ),
  );
  const mirrored = (text: string) => ({ en: text, ko: text });

  return ResearchReportSchema.parse({
    ...canonicalFields,
    schemaVersion: "workflow-v1",
    locales: { en: narrative, ko: narrative },
    teamViews: teamViews.map((view) => ({
      ...view,
      position: mirrored(view.position),
      rationale: mirrored(view.rationale),
    })),
    claims: claims.map((claim) => ({
      ...claim,
      ...(claim.text === undefined ? {} : { text: mirrored(claim.text) }),
    })),
    providerDisagreements: providerDisagreements.map((entry) => ({
      ...entry,
      note: mirrored(entry.note),
    })),
  });
}
