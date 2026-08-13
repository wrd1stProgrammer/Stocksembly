import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StockSymbolSchema } from "../../research/server/researchRoom/researchRoomPublicCatalog";
import type { StockResearchHub } from "../../research/server/researchRoom/stockResearchHubCatalog";
import { StockResearchHubPage } from "./StockResearchHubPage";

vi.mock("./UsStockAnalysisHeader", () => ({
  SeoLocaleHeader: ({
    locale,
    paths,
  }: {
    readonly locale: "en" | "ko";
    readonly paths: Readonly<Record<"en" | "ko", string>>;
  }) => (
    <div
      data-testid="locale-header"
      data-locale={locale}
      data-ko-path={paths.ko}
      data-en-path={paths.en}
    />
  ),
}));

vi.mock("../LandingSections", () => ({
  LandingFooter: ({ locale }: { readonly locale: "en" | "ko" }) => (
    <footer data-testid="footer">{locale}</footer>
  ),
}));

const hub = {
  symbol: StockSymbolSchema.parse("NVDA"),
  company: "NVIDIA Corporation",
  latestPublishedAt: "2026-08-03T00:00:00.000Z",
  reports: [
    {
      reportId: "00000000-0000-4000-8000-000000000001",
      question: "How durable is data-center demand?",
      locale: "en",
      researchTarget: { kind: "committee" },
      publishedAt: "2026-08-03T00:00:00.000Z",
      status: "complete_with_limitations",
    },
    {
      reportId: "00000000-0000-4000-8000-000000000002",
      question: "마진의 핵심 변수를 분석해줘",
      locale: "ko",
      researchTarget: {
        kind: "department",
        departmentId: "financial",
      },
      publishedAt: "2026-08-02T00:00:00.000Z",
      status: "complete",
    },
  ],
} satisfies StockResearchHub;

describe("stock research hub page", () => {
  it("renders Korean public-report links and matching language routes", () => {
    // Given
    // When
    const page = render(<StockResearchHubPage hub={hub} locale="ko" />);

    // Then
    expect(
      page.getByRole("heading", {
        level: 1,
        name: "NVIDIA Corporation(NVDA) 미국주식 분석",
      }),
    ).toBeInTheDocument();
    expect(
      page.getByRole("link", {
        name: "How durable is data-center demand?",
      }),
    ).toHaveAttribute(
      "href",
      "/research-room/00000000-0000-4000-8000-000000000001",
    );
    expect(page.getByTestId("locale-header")).toHaveAttribute(
      "data-en-path",
      "/en/stocks/nvda",
    );
    expect(page.getAllByRole("article")).toHaveLength(2);
  });

  it("renders English report URLs and machine-readable collection data", () => {
    // Given
    // When
    const page = render(<StockResearchHubPage hub={hub} locale="en" />);

    // Then
    expect(
      page.getByRole("link", {
        name: "How durable is data-center demand?",
      }),
    ).toHaveAttribute(
      "href",
      "/research-room/00000000-0000-4000-8000-000000000001?lang=en",
    );
    const structuredData = page.container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(JSON.parse(structuredData?.textContent ?? "{}")).toEqual(
      expect.objectContaining({
        "@type": "CollectionPage",
        inLanguage: "en-US",
        mainEntity: expect.objectContaining({
          "@type": "ItemList",
          numberOfItems: 2,
        }),
      }),
    );
  });
});
