import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AdminAnalyticsOverview } from "../../admin/analyticsContracts";
import { AdminDashboard } from "./AdminDashboard";

const fixture: AdminAnalyticsOverview = {
  generatedAt: "2026-08-14T00:00:00.000Z",
  query: {
    range: "30",
    from: "2026-07-15T15:00:00.000Z",
    to: "2026-08-14T00:00:00.000Z",
    fromDate: "2026-07-16",
    throughDate: "2026-08-14",
    channel: "all",
    page: 1,
    pageSize: 50,
  },
  status: {
    availability: "available",
    accuracy: "estimated",
    completeness: "partial",
    caveat: "신규 계측 이후 정확 집계",
  },
  kpis: {
    newUsers: 120,
    dau: 14,
    wau: 51,
    mau: 88,
    signupToPaidRate: 12.5,
    activePaid: 19,
  },
  trends: [
    {
      date: "2026-08-13",
      signups: 4,
      activeUsers: 8,
      actions: 18,
      payments: 1,
    },
    {
      date: "2026-08-14",
      signups: 6,
      activeUsers: 10,
      actions: 22,
      payments: 2,
    },
  ],
  signupFunnel: {
    denominator: 120,
    activated: 60,
    paid: 15,
    activationRate: 50,
    paidRate: 12.5,
    status: {
      availability: "available",
      accuracy: "estimated",
      completeness: "partial",
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
      caveat: "계측 시작 이후 데이터",
    },
  },
  acquisition: [{ key: "unknown", label: "미확인", count: 120, rate: 100 }],
  acquisitionSources: [
    { key: "threads", label: "threads", count: 12, rate: 10 },
  ],
  acquisitionCampaigns: [
    {
      key: "threads_profile",
      label: "threads_profile",
      count: 12,
      rate: 10,
    },
  ],
  onboardingDiscoverySources: [
    { key: "social", label: "소셜 미디어", count: 42, rate: 35 },
  ],
  plans: [{ key: "free", label: "Free", count: 101, rate: 84.17 }],
  statuses: [{ key: "active", label: "활성", count: 120, rate: 100 }],
  retention: [{ horizon: "D1", eligible: 100, retained: 30, rate: 30 }],
  usage: [
    {
      event: "research_completed",
      label: "리서치 완료",
      events: 55,
      users: 34,
    },
  ],
  payments: {
    succeeded: 15,
    failed: 2,
    failureRate: 11.76,
    deactivated: 1,
    cancelScheduled: 2,
    pastDue: 1,
  },
  users: {
    total: 1,
    page: 1,
    pageSize: 50,
    pageCount: 1,
    items: [
      {
        principalId: "a".repeat(64),
        email: "threads-user@example.com",
        displayName: null,
        locale: "ko",
        acquisitionChannel: "social",
        onboardingDiscoverySource: "social",
        acquisition: {
          source: "threads",
          medium: "organic_social",
          campaign: "threads_profile",
          term: null,
          content: "bio_link",
          referrerHost: "threads.net",
          landingPath: "/",
          capturedAt: "2026-08-13T00:00:00.000Z",
        },
        createdAt: "2026-08-13T00:05:00.000Z",
        lastSeenAt: "2026-08-14T00:00:00.000Z",
        plan: "free",
        status: "none",
        actionCount: 1,
        lastMeaningfulAt: "2026-08-13T00:10:00.000Z",
        firstPaidAt: null,
      },
    ],
  },
};

describe("AdminDashboard", () => {
  it("renders the desktop summary and honest zero-denominator funnel", () => {
    render(<AdminDashboard data={fixture} />);
    expect(
      screen.getByRole("heading", { name: "서비스 현황" }),
    ).toBeInTheDocument();
    expect(screen.getByText("결제 이동 준비 완료 → 결제")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getAllByText("threads").length).toBeGreaterThan(0);
    expect(screen.getAllByText("threads_profile").length).toBeGreaterThan(0);
    expect(screen.getByText("가입 설문 유입 경로")).toBeInTheDocument();
    expect(screen.getAllByText("소셜 미디어").length).toBeGreaterThan(0);
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
