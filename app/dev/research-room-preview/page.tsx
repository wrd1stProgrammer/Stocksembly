import { notFound } from "next/navigation";
import { ResearchRoomCatalog } from "@/src/components/researchRoom/ResearchRoomCatalog";
import type { ResearchRoomCatalogItem } from "@/src/research/server/researchRoom/researchRoomCatalog";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function item(
  overrides: Pick<
    ResearchRoomCatalogItem,
    "reportId" | "symbol" | "question" | "researchTarget"
  > &
    Partial<ResearchRoomCatalogItem>,
): ResearchRoomCatalogItem {
  return {
    locale: "ko",
    publishedAt: new Date(Date.now() - 3 * HOUR).toISOString(),
    status: "complete",
    locked: false,
    viewCount: 12,
    ...overrides,
  };
}

// Local preview of the research room catalog with fixture reports. The real
// page reads the SQLite archive, which developer machines rarely have.
export default function ResearchRoomPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const reports = [
    item({
      reportId: "preview-committee",
      symbol: "NVDA",
      question: "데이터센터 수요 둔화가 마진 지속성에 어떤 영향을 미칠까?",
      researchTarget: { kind: "committee" },
    }),
    item({
      reportId: "preview-locked",
      symbol: "AAPL",
      question: "서비스 매출 성장이 하드웨어 둔화를 상쇄할 수 있을까?",
      researchTarget: { kind: "department", departmentId: "financial" },
      locked: true,
      publishedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    }),
    item({
      reportId: "preview-english",
      symbol: "MSFT",
      question: "Can Azure growth justify the current valuation?",
      researchTarget: { kind: "department", departmentId: "market" },
      locale: "en",
      publishedAt: new Date(Date.now() - 9 * DAY).toISOString(),
    }),
    item({
      reportId: "preview-fallback",
      symbol: "TSLA",
      question: "",
      researchTarget: { kind: "department", departmentId: "risk" },
      publishedAt: new Date(Date.now() - 30 * DAY).toISOString(),
    }),
  ];
  return (
    <div className="research-room-page" lang="ko">
      <ResearchRoomCatalog
        access={{ authenticated: false, tier: "free" }}
        initialCompanies={[]}
        initialPage={1}
        initialReports={reports}
        initialTotal={reports.length}
        locale="ko"
      />
    </div>
  );
}
