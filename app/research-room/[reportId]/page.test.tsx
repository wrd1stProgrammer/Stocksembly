import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";

const REPORT_ID = "00000000-0000-4000-8000-000000000001";

const pageState = vi.hoisted(() => ({
  loadResearchRoomReport: vi.fn(),
}));

vi.mock("@/src/research/server/researchRoom/researchRoomCatalog", () => ({
  loadResearchRoomReport: pageState.loadResearchRoomReport,
  recordResearchRoomView: vi.fn(),
}));

function metadataProps(reportId = REPORT_ID, lang?: string) {
  return {
    params: Promise.resolve({ reportId }),
    searchParams: Promise.resolve(lang === undefined ? {} : { lang }),
  };
}

function publicReport() {
  return {
    item: {
      reportId: REPORT_ID,
      symbol: "NVDA",
      question: "Is the growth durable?",
      publishedAt: "2026-08-01T00:00:00.000Z",
    },
    file: {
      thesis: {
        ko: "한국어 투자 논지",
        en: "English investment thesis",
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public research report metadata", () => {
  it("characterizes the current Korean default for an eligible public report", async () => {
    // Given
    pageState.loadResearchRoomReport.mockResolvedValueOnce(publicReport());

    // When
    const metadata = await generateMetadata(metadataProps());

    // Then
    expect(metadata.description).toBe("한국어 투자 논지");
    expect(metadata.openGraph).toMatchObject({
      description: "한국어 투자 논지",
      url: `/research-room/${REPORT_ID}`,
    });
  });

  it("publishes Korean metadata for an eligible report", async () => {
    // Given
    pageState.loadResearchRoomReport.mockResolvedValueOnce(publicReport());

    // When
    const metadata = await generateMetadata(metadataProps(REPORT_ID, "ko"));

    // Then
    expect(metadata).toMatchObject({
      title: "NVDA · Is the growth durable?",
      description: "한국어 투자 논지",
      robots: { index: true, follow: true },
      alternates: { canonical: `/research-room/${REPORT_ID}` },
      openGraph: {
        title: "NVDA 리서치 · Stocksembly",
        description: "한국어 투자 논지",
        locale: "ko_KR",
        url: `/research-room/${REPORT_ID}`,
        type: "article",
        publishedTime: "2026-08-01T00:00:00.000Z",
      },
    });
  });

  it("publishes English metadata for an eligible report", async () => {
    // Given
    pageState.loadResearchRoomReport.mockResolvedValueOnce(publicReport());

    // When
    const metadata = await generateMetadata(metadataProps(REPORT_ID, "en"));

    // Then
    expect(metadata).toMatchObject({
      title: "NVDA · Is the growth durable?",
      description: "English investment thesis",
      robots: { index: true, follow: true },
      alternates: { canonical: `/research-room/${REPORT_ID}` },
      openGraph: {
        title: "NVDA Research · Stocksembly",
        description: "English investment thesis",
        locale: "en_US",
        url: `/research-room/${REPORT_ID}`,
        type: "article",
        publishedTime: "2026-08-01T00:00:00.000Z",
      },
    });
  });

  it("defaults an invalid metadata locale to Korean", async () => {
    // Given
    pageState.loadResearchRoomReport.mockResolvedValueOnce(publicReport());

    // When
    const metadata = await generateMetadata(
      metadataProps(REPORT_ID, "not-a-locale"),
    );

    // Then
    expect(metadata).toMatchObject({
      description: "한국어 투자 논지",
      openGraph: {
        description: "한국어 투자 논지",
        locale: "ko_KR",
      },
    });
  });

  it("does not index a malformed report identifier", async () => {
    // Given
    const malformedReportId = "not-a-uuid";

    // When
    const metadata = await generateMetadata(metadataProps(malformedReportId));

    // Then
    expect(metadata).toMatchObject({
      title: "Research Room",
      robots: { index: false, follow: false },
    });
  });

  it("does not index a missing public report", async () => {
    // Given
    pageState.loadResearchRoomReport.mockResolvedValueOnce(undefined);

    // When
    const metadata = await generateMetadata(metadataProps());

    // Then
    expect(metadata).toMatchObject({
      title: "Research Room",
      robots: { index: false, follow: false },
    });
  });

  it("does not index a recent locked report", async () => {
    // Given
    pageState.loadResearchRoomReport.mockResolvedValueOnce("locked");

    // When
    const metadata = await generateMetadata(metadataProps());

    // Then
    expect(metadata).toMatchObject({
      title: "Research Room",
      robots: { index: false, follow: false },
    });
  });
});
