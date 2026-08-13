import { fireEvent, render, screen } from "@testing-library/react";
import {
  type ComponentProps,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchRoomCatalog } from "../../src/components/researchRoom/ResearchRoomCatalog";
import type {
  ResearchRoomAccess,
  ResearchRoomCatalogItem,
  ResearchRoomReportPage,
} from "../../src/research/server/researchRoom/researchRoomCatalog";
import ResearchRoomPage from "./page";

const pageState = vi.hoisted(() => ({
  access: {
    authenticated: false,
    tier: "free",
  } satisfies ResearchRoomAccess,
  researchRoomAccess: vi.fn(),
  listResearchRoomReportPage: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    toString: () => "stocksembly_local_session=session",
  }),
  headers: async () => new Headers({ host: "127.0.0.1:3000" }),
}));

vi.mock("@/src/research/server/api/liveResearchApi", () => ({
  getLiveResearchApi: async () => ({
    researchRoomAccess: pageState.researchRoomAccess,
  }),
}));

vi.mock("@/src/research/server/researchRoom/researchRoomCatalog", () => ({
  RESEARCH_ROOM_PAGE_SIZE: 32,
  listResearchRoomReportPage: pageState.listResearchRoomReportPage,
}));

vi.mock("border-beam", () => ({
  BorderBeam: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/src/components/Brand", () => ({
  Brand: ({ locale }: { readonly locale: "en" | "ko" }) => (
    <span data-testid={`brand-${locale}`}>Stocksembly</span>
  ),
}));

vi.mock("@/src/components/research/ResearchSidebar", () => ({
  CompanyLogo: ({ symbol }: { readonly symbol: string }) => (
    <span data-testid={`company-${symbol}`}>{symbol}</span>
  ),
}));

vi.mock("@/src/components/SignedInSidebar", () => ({
  SignedInSidebar: () => null,
}));

vi.mock("@/src/components/MobileBottomNav", () => ({
  MobileBottomNav: () => null,
}));

vi.mock("@/src/components/billing/MembershipAccessModal", () => ({
  MembershipAccessModal: ({
    open,
    reason,
  }: {
    readonly open: boolean;
    readonly reason: string;
  }) => (open ? <div role="dialog" data-reason={reason} /> : null),
}));

const eligibleReport = {
  reportId: "00000000-0000-4000-8000-000000000001",
  symbol: "NVDA",
  question: "Is NVDA's growth durable?",
  locale: "en",
  researchTarget: { kind: "committee" },
  publishedAt: "2026-07-01T00:00:00.000Z",
  status: "complete",
  locked: false,
  viewCount: 4,
} satisfies ResearchRoomCatalogItem;

const lockedReport = {
  reportId: "00000000-0000-4000-8000-000000000002",
  symbol: "AAPL",
  question: "Can AAPL sustain its services growth?",
  locale: "en",
  researchTarget: { kind: "committee" },
  publishedAt: "2026-08-09T00:00:00.000Z",
  status: "complete",
  locked: true,
  viewCount: 2,
} satisfies ResearchRoomCatalogItem;

const reportPage = {
  reports: [eligibleReport, lockedReport],
  total: 2,
  companies: [
    { symbol: "NVDA", count: 1 },
    { symbol: "AAPL", count: 1 },
  ],
} satisfies ResearchRoomReportPage;

const paginatedReportPage = {
  ...reportPage,
  total: 64,
} satisfies ResearchRoomReportPage;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => undefined)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("research room archive page", () => {
  it("characterizes the server request and catalog component handoff", async () => {
    // Given
    pageState.researchRoomAccess.mockResolvedValueOnce(pageState.access);
    pageState.listResearchRoomReportPage.mockResolvedValueOnce(reportPage);

    // When
    const element = (await ResearchRoomPage({
      searchParams: Promise.resolve({ lang: "en" }),
    })) as ReactElement<{ readonly children: ReactNode }>;
    const catalog = Array.isArray(element.props.children)
      ? element.props.children[0]
      : element.props.children;
    if (!isValidElement<ComponentProps<typeof ResearchRoomCatalog>>(catalog))
      throw new TypeError("Missing catalog");

    // Then
    const [request] = pageState.researchRoomAccess.mock.calls[0] ?? [];
    expect(request).toBeInstanceOf(Request);
    expect(catalog.type).toBe(ResearchRoomCatalog);
    expect(catalog.props.access).toEqual(pageState.access);
    expect(catalog.props.initialReports).toEqual(reportPage.reports);
  });

  it("requests the public archive with the fixed latest page contract", async () => {
    // Given
    pageState.researchRoomAccess.mockResolvedValueOnce(pageState.access);
    pageState.listResearchRoomReportPage.mockResolvedValueOnce(reportPage);

    // When
    await ResearchRoomPage({
      searchParams: Promise.resolve({ lang: "en" }),
    });

    // Then
    expect(pageState.listResearchRoomReportPage).toHaveBeenCalledWith(
      pageState.access,
      { limit: 32, sort: "latest" },
    );
  });

  it("server-renders the requested archive page with the matching offset", async () => {
    // Given
    pageState.researchRoomAccess.mockResolvedValueOnce(pageState.access);
    pageState.listResearchRoomReportPage.mockResolvedValueOnce(
      paginatedReportPage,
    );

    // When
    const element = (await ResearchRoomPage({
      searchParams: Promise.resolve({ lang: "en", page: "2" }),
    })) as ReactElement<{ readonly children: ReactNode }>;
    const catalog = Array.isArray(element.props.children)
      ? element.props.children[0]
      : element.props.children;
    if (!isValidElement<ComponentProps<typeof ResearchRoomCatalog>>(catalog))
      throw new TypeError("Missing catalog");

    // Then
    expect(pageState.listResearchRoomReportPage).toHaveBeenCalledWith(
      pageState.access,
      { limit: 32, offset: 32, sort: "latest" },
    );
    expect(catalog.props.initialPage).toBe(2);
  });

  it("renders the next archive page as a crawlable link", async () => {
    // Given
    pageState.researchRoomAccess.mockResolvedValueOnce(pageState.access);
    pageState.listResearchRoomReportPage.mockResolvedValueOnce(
      paginatedReportPage,
    );

    // When
    render(
      await ResearchRoomPage({
        searchParams: Promise.resolve({ lang: "en" }),
      }),
    );

    // Then
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/research-room?lang=en&page=2",
    );
  });

  it("renders eligible archive cards as canonical report links", async () => {
    // Given
    pageState.researchRoomAccess.mockResolvedValueOnce(pageState.access);
    pageState.listResearchRoomReportPage.mockResolvedValueOnce(reportPage);

    // When
    const element = await ResearchRoomPage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    render(element);

    // Then
    const link = screen.getByRole("link", {
      name: /NVDA Is NVDA's growth durable\?/u,
    });
    expect(link).toHaveAttribute(
      "href",
      "/research-room/00000000-0000-4000-8000-000000000001?lang=en",
    );
    expect(link.querySelector("article")).toHaveAttribute(
      "data-locked",
      "false",
    );
  });

  it("renders locked cards as subscription-gated buttons without report URLs", async () => {
    // Given
    pageState.researchRoomAccess.mockResolvedValueOnce(pageState.access);
    pageState.listResearchRoomReportPage.mockResolvedValueOnce(reportPage);

    // When
    const element = await ResearchRoomPage({
      searchParams: Promise.resolve({ lang: "en" }),
    });
    render(element);
    const lockedButton = screen.getByRole("button", {
      name: "AAPL subscriber access",
    });

    // Then
    expect(lockedButton).toHaveAttribute("type", "button");
    expect(lockedButton).not.toHaveAttribute("href");
    expect(lockedButton.querySelectorAll("a")).toHaveLength(0);
    fireEvent.click(lockedButton);
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-reason",
      "recent-report",
    );
  });
});
