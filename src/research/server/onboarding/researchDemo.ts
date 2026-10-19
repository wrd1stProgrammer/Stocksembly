import {
  isRecentDemo,
  ResearchDemoSchema,
} from "../../../components/onboarding/researchDemo";
import {
  listResearchRoomReports,
  loadResearchRoomReport,
} from "../researchRoom/researchRoomCatalog";
import recordedSample from "./sample-research.json";

export function recordedResearchDemo() {
  return ResearchDemoSchema.parse(recordedSample);
}

export async function selectResearchDemo(symbol: string) {
  // Demo access is deliberately limited to the public catalog's latest
  // completed committee report. Never accept an arbitrary report/run ID.
  const access = { authenticated: true, tier: "free" as const };
  const now = new Date();
  const [latest] = await listResearchRoomReports(access, {
    company: symbol,
    scope: "committee",
    sort: "latest",
    limit: 1,
    now,
  });
  if (!latest || !isRecentDemo(latest.publishedAt, now))
    return recordedResearchDemo();
  const bundle = await loadResearchRoomReport(latest.reportId, access, now);
  if (!bundle || bundle === "locked" || !bundle.runDetail.events.length)
    return recordedResearchDemo();
  // Publish only the existing public meeting and a short blurred backdrop.
  // Full report, evidence archive and follow-up conversations stay gated.
  return ResearchDemoSchema.parse({
    reportId: bundle.item.reportId,
    symbol: bundle.item.symbol,
    publishedAt: bundle.item.publishedAt,
    sourceLocale: bundle.item.locale,
    question: bundle.item.question,
    company: bundle.company,
    runDetail: bundle.runDetail,
    backdrop: {
      posture: bundle.file.posture,
      postureLabel: bundle.file.postureLabel,
      evidenceScore: bundle.file.evidenceScore,
      thesis: bundle.file.thesis,
      sections: bundle.file.analysis.slice(0, 3),
      sourceCount: bundle.file.sourceCount,
      claimCount: bundle.file.claimCount,
    },
    sourceUrl: `https://stocksembly.com/research-room/${bundle.item.reportId}`,
  });
}
