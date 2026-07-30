import { z } from "zod";
import { type ResearchReport, ResearchReportSchema } from "./report";
import { LocalizedReportSchema } from "./reportComponents";

const StoredRecordSchema = z.record(z.string(), z.unknown());
const StoredLocaleSchema = z.enum(["en", "ko"]);

/**
 * Published artifacts keep only the language selected for the run. The
 * canonical in-memory report remains backward-compatible with older bilingual
 * artifacts so existing readers and historical reports continue to work.
 */
export function singleLocaleReportForStorage(
  report: ResearchReport,
  locale: "en" | "ko",
): Record<string, unknown> {
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

export function parseStoredResearchReport(value: unknown): ResearchReport {
  const candidate = StoredRecordSchema.safeParse(value);
  if (
    !candidate.success ||
    candidate.data["schemaVersion"] !== "workflow-v1-single-locale"
  )
    return ResearchReportSchema.parse(value);

  StoredLocaleSchema.parse(candidate.data["locale"]);
  const narrative = LocalizedReportSchema.parse(candidate.data["narrative"]);
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
    .parse(candidate.data["teamViews"]);
  const claims = z
    .array(z.object({ text: z.string().min(1).optional() }).passthrough())
    .parse(candidate.data["claims"]);
  const providerDisagreements = z
    .array(z.object({ note: z.string().min(1) }).passthrough())
    .parse(candidate.data["providerDisagreements"]);
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
