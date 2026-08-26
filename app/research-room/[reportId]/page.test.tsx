import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";

const REPORT_ID = "00000000-0000-4000-8000-000000000001";

const pageState = vi.hoisted(() => ({
  loadResearchRoomReport: vi.fn(),
  storedLocale: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "stocksembly_locale" && pageState.storedLocale !== undefined
        ? { value: pageState.storedLocale }
        : undefined,
    toString: () => "",
  }),
  headers: async () => new Headers({ host: "127.0.0.1:3000" }),
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
  pageState.storedLocale = undefined;
});

describe("public research report metadata", () => {
  it("defaults to English metadata for an eligible public report", async () => {
    // Given
    pageState.loadResearchRoomReport.mockResolvedValueOnce(publicReport());

    // When
    const metadata = await generateMetadata(metadataProps());

    // Then
    expect(metadata.description).toBe("English investment thesis");
    expect(metadata.openGraph).toMatchObject({
      description: "English investment thesis",
      url: `/research-room/${REPORT_ID}?lang=en`,
    });
  });

  it("publishes Korean metadata for an eligible report", async () => {
    // Given
    pageState.loadResearchRoomReport.mockResolvedValueOnce(publicReport());

    // When
    const metadata = await generateMetadata(metadataProps(REPORT_ID, "ko"));

    // Then
    expect(metadata).toMatchObject({
      title: {
        absolute: "NVDA 미국주식 분석: Is the growth durable? · Stocksembly",
      },
      description: "한국어 투자 논지",
      robots: { index: true, follow: true },
      alternates: {
        canonical: `/research-room/${REPORT_ID}`,
        languages: {
          ko: `/research-room/${REPORT_ID}`,
          en: `/research-room/${REPORT_ID}?lang=en`,
          "x-default": `/research-room/${REPORT_ID}`,
        },
      },
      openGraph: {
        title: "NVDA 미국주식 분석: Is the growth durable? · Stocksembly",
        description: "한국어 투자 논지",
        locale: "ko_KR",
        alternateLocale: "en_US",
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
      title: {
        absolute: "NVDA Stock Analysis: Is the growth durable? · Stocksembly",
      },
      description: "English investment thesis",
      robots: { index: true, follow: true },
      alternates: {
        canonical: `/research-room/${REPORT_ID}?lang=en`,
        languages: {
          ko: `/research-room/${REPORT_ID}`,
          en: `/research-room/${REPORT_ID}?lang=en`,
          "x-default": `/research-room/${REPORT_ID}`,
        },
      },
      openGraph: {
        title: "NVDA Stock Analysis: Is the growth durable? · Stocksembly",
        description: "English investment thesis",
        locale: "en_US",
        alternateLocale: "ko_KR",
        url: `/research-room/${REPORT_ID}?lang=en`,
        type: "article",
        publishedTime: "2026-08-01T00:00:00.000Z",
      },
    });
  });

  it("defaults an invalid metadata locale to English", async () => {
    // Given
    pageState.loadResearchRoomReport.mockResolvedValueOnce(publicReport());

    // When
    const metadata = await generateMetadata(
      metadataProps(REPORT_ID, "not-a-locale"),
    );

    // Then
    expect(metadata).toMatchObject({
      description: "English investment thesis",
      openGraph: {
        description: "English investment thesis",
        locale: "en_US",
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

  it("bounds user-authored report metadata for search snippets", async () => {
    const report = publicReport();
    report.item.question =
      "Can this unusually long investment question explain every growth driver, valuation assumption, competitive risk, and downside scenario without overflowing a search result?";
    report.file.thesis.en =
      "This intentionally long investment thesis contains enough detail to overflow a normal search snippet. It discusses the business model, competitive position, financial quality, valuation, catalysts, risks, and the evidence that could invalidate the conclusion for a cautious investor.";
    pageState.loadResearchRoomReport.mockResolvedValueOnce(report);

    const metadata = await generateMetadata(metadataProps(REPORT_ID, "en"));
    const { title } = metadata;
    if (typeof title !== "object" || title === null || !("absolute" in title))
      throw new Error("Expected an absolute metadata title");

    expect(title.absolute.length).toBeLessThanOrEqual(60);
    expect(metadata.description?.length).toBeLessThanOrEqual(160);
    expect(metadata.openGraph?.title).toBe(title.absolute);
    expect(metadata.openGraph?.description).toBe(metadata.description);
  });
});
