import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminAnalyticsOverview,
  AdminUserDetail,
  AdminUserList,
} from "@/src/admin/analyticsContracts";

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  users: vi.fn(),
  user: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("@/src/admin/server/adminPageRequest", async (original) => {
  const actual =
    await original<typeof import("@/src/admin/server/adminPageRequest")>();
  return {
    ...actual,
    adminPageRequest: async (pathname: string, params: URLSearchParams) =>
      new Request(`http://localhost${pathname}?${params}`),
  };
});
vi.mock("@/src/research/server/api/liveResearchApi", () => ({
  getLiveResearchApi: async () => ({
    adminAnalyticsOverview: mocks.overview,
    adminAnalyticsUsers: mocks.users,
    adminAnalyticsUser: mocks.user,
  }),
}));

import AcquisitionPage from "./acquisition/page";
import BehaviorPage from "./behavior/page";
import BillingPage from "./billing/page";
import OverviewPage from "./page";
import UserPage from "./users/[principalId]/page";
import UsersPage from "./users/page";

const user = {
  principalId: "a".repeat(64),
  email: "admin2@example.com",
  displayName: "관리자 테스트",
  locale: "ko",
  acquisitionChannel: "direct" as const,
  onboardingDiscoverySource: null,
  acquisition: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  lastSeenAt: "2026-10-12T00:00:00.000Z",
  plan: "free" as const,
  status: "none" as const,
  actionCount: 1,
  lastMeaningfulAt: null,
  firstPaidAt: null,
};

const users: AdminUserList = {
  total: 1,
  page: 1,
  pageSize: 50,
  pageCount: 1,
  items: [user],
};

const overview: AdminAnalyticsOverview = {
  generatedAt: "2026-10-12T00:00:00.000Z",
  query: {
    range: "30",
    from: "2026-09-12T15:00:00.000Z",
    to: "2026-10-12T00:00:00.000Z",
    fromDate: "2026-09-13",
    throughDate: "2026-10-12",
    channel: "all",
    page: 1,
    pageSize: 50,
  },
  status: {
    availability: "available",
    accuracy: "exact",
    completeness: "complete",
    caveat: "현행 수집 데이터",
  },
  kpis: {
    newUsers: 1,
    dau: 1,
    wau: 1,
    mau: 1,
    signupToPaidRate: 0,
    activePaid: 0,
  },
  trends: [
    { date: "2026-10-12", signups: 1, activeUsers: 1, actions: 1, payments: 0 },
  ],
  signupFunnel: {
    denominator: 1,
    activated: 1,
    paid: 0,
    activationRate: 100,
    paidRate: 0,
    status: {
      availability: "available",
      accuracy: "exact",
      completeness: "complete",
    },
  },
  checkoutFunnel: {
    denominator: 0,
    paid: 0,
    paidRate: null,
    status: {
      availability: "unavailable",
      accuracy: "exact",
      completeness: "partial",
    },
  },
  acquisition: [],
  acquisitionSources: [],
  acquisitionCampaigns: [],
  onboardingDiscoverySources: [],
  plans: [],
  statuses: [],
  retention: [],
  usage: [],
  engagement: [],
  payments: {
    succeeded: 0,
    failed: 0,
    failureRate: null,
    deactivated: 0,
    cancelScheduled: 0,
    pastDue: 0,
  },
  users,
};

const detail: AdminUserDetail = {
  generatedAt: overview.generatedAt,
  user,
  timeline: [],
};
const searchParams = Promise.resolve({ range: "30" });

describe("admin2 page routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.overview.mockResolvedValue({ kind: "ok", data: overview });
    mocks.users.mockResolvedValue({ kind: "ok", data: users });
    mocks.user.mockResolvedValue({ kind: "ok", data: detail });
  });

  it.each([
    [OverviewPage, "서비스 요약"],
    [BehaviorPage, "사용자 행동"],
    [AcquisitionPage, "유입·전환"],
    [BillingPage, "결제"],
  ])("renders the assigned overview section", async (Page, heading) => {
    render(await Page({ searchParams }));
    expect(
      screen.getByRole("heading", { name: heading, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("navigation", { name: "관리자 메뉴" })
        .querySelectorAll("a"),
    ).toHaveLength(5);
  });

  it("keeps the summary to four decision cards", async () => {
    render(await OverviewPage({ searchParams }));
    expect(
      screen
        .getByRole("region", { name: "핵심 지표" })
        .querySelectorAll("article"),
    ).toHaveLength(4);
  });

  it("uses the users endpoint for the list and preserves detail navigation", async () => {
    render(await UsersPage({ searchParams }));
    expect(mocks.users).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("link", { name: "관리자 테스트 상세 보기" }),
    ).toHaveAttribute("href", expect.stringContaining("/admin2/users/"));
  });

  it("keeps the admin2 shell and breadcrumb on user detail", async () => {
    render(
      await UserPage({
        params: Promise.resolve({ principalId: user.principalId }),
        searchParams,
      }),
    );
    expect(
      screen.getByRole("navigation", { name: "현재 위치" }),
    ).toHaveTextContent(/사용자.*관리자 테스트/);
    expect(screen.getByText("최근 100건 · 필터 없음")).toBeInTheDocument();
  });

  it.each([OverviewPage, BehaviorPage, AcquisitionPage, BillingPage])(
    "redirects unauthenticated direct access to login",
    async (Page) => {
      mocks.overview.mockResolvedValue({ kind: "unauthenticated" });
      await expect(Page({ searchParams })).rejects.toThrow(
        "REDIRECT:/login?next=",
      );
    },
  );

  it("returns a 404-shaped result for a non-admin page request", async () => {
    mocks.users.mockResolvedValue({ kind: "forbidden" });
    await expect(UsersPage({ searchParams })).rejects.toThrow("NOT_FOUND");
  });
});
