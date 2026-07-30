import { notFound } from "next/navigation";
import { FullReportPreview } from "@/src/components/research/FullReportPreview";
import { buildAnticipatedQuestions } from "@/src/research/anticipatedQuestions";
import { researchFileFixture } from "@/src/research/mockResearchFile";
import { teamReportPreviewFixture } from "@/src/research/teamReportPreviewFixture";

export default function FullReportPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const numericPreview = teamReportPreviewFixture("financial").metricSnapshot;
  const report = {
    ...researchFileFixture,
    ...(numericPreview === undefined ? {} : { metricSnapshot: numericPreview }),
  };
  return (
    <FullReportPreview
      company={{
        symbol: "NVDA",
        company: "NVIDIA Corporation",
        exchange: "NASDAQ",
        sector: "Technology",
        price: "172.41",
        change: "+1.8%",
        marketStatus: { en: "Market open", ko: "장중" },
      }}
      report={{
        ...report,
        anticipatedQuestions: buildAnticipatedQuestions(report),
      }}
    />
  );
}
