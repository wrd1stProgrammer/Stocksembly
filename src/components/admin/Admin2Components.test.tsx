import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  AdminAnalyticsQuery,
  AdminUserDetail as AdminUserDetailData,
  AdminUserList,
} from "../../admin/analyticsContracts";
import { AdminEngagementTable, AdminUserTable } from "./AdminAnalyticsSections";
import { AdminFilters } from "./AdminFilters";
import { AdminShell } from "./AdminShell";
import { AdminTrendChart } from "./AdminTrendChart";
import { AdminUserDetail } from "./AdminUserDetail";

const query: AdminAnalyticsQuery = {
  range: "30",
  from: "2026-09-12T15:00:00.000Z",
  to: "2026-10-12T00:00:00.000Z",
  fromDate: "2026-09-13",
  throughDate: "2026-10-12",
  channel: "social",
  plan: "pro",
  status: "active",
  search: "tester",
  page: 2,
  pageSize: 25,
};

const user = {
  principalId: "a".repeat(64),
  email: "tester@example.com",
  displayName: "테스터",
  locale: "ko",
  acquisitionChannel: "social" as const,
  onboardingDiscoverySource: "social" as const,
  acquisition: null,
  createdAt: "2026-09-20T00:00:00.000Z",
  lastSeenAt: "2026-10-12T00:00:00.000Z",
  plan: "pro" as const,
  status: "active" as const,
  actionCount: 8,
  lastMeaningfulAt: "2026-10-11T00:00:00.000Z",
  firstPaidAt: "2026-09-21T00:00:00.000Z",
};

describe("admin2 shared components", () => {
  it("renders exactly five first-level menu destinations", () => {
    render(
      <AdminShell active="behavior">
        <p>content</p>
      </AdminShell>,
    );
    const nav = screen.getByRole("navigation", { name: "관리자 메뉴" });
    expect(nav.querySelectorAll("a")).toHaveLength(5);
    expect(screen.getByRole("link", { name: /사용자 행동/ })).toHaveAttribute(
      "href",
      "/admin2/behavior",
    );
    expect(screen.getByRole("link", { name: /사용자 행동/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("preserves users filters, page size and detail destination", () => {
    const users: AdminUserList = {
      total: 55,
      page: 2,
      pageSize: 25,
      pageCount: 3,
      items: [user],
    };
    render(
      <>
        <AdminFilters
          query={query}
          action="/admin2/users"
          showPlanStatus
          showPageSize
        />
        <AdminUserTable
          query={query}
          users={users}
          basePath="/admin2/users"
          includePageSize
          explicitDetailLink
        />
      </>,
    );
    expect(
      screen.getByRole("button", { name: "적용" }).closest("form"),
    ).toHaveAttribute("action", "/admin2/users");
    expect(
      screen.getByRole("link", { name: "테스터 상세 보기" }),
    ).toHaveAttribute("href", expect.stringContaining("/admin2/users/"));
    expect(
      screen.getByRole("link", { name: "테스터 상세 보기" }),
    ).toHaveAttribute("href", expect.stringContaining("pageSize=25"));
    expect(screen.getByRole("link", { name: "이전" })).toHaveAttribute(
      "href",
      expect.stringContaining("page=1"),
    );
  });

  it("shows behavior series and the honest engagement filter scope", () => {
    render(
      <>
        <AdminTrendChart
          title="행동 추이"
          points={[
            {
              date: "2026-10-12",
              signups: 1,
              activeUsers: 2,
              actions: 3,
              payments: 0,
            },
          ]}
          series={[
            {
              key: "activeUsers",
              label: "활성 사용자",
              className: "is-active",
            },
            { key: "actions", label: "핵심 액션", className: "is-actions" },
          ]}
        />
        <AdminEngagementTable rows={[]} periodOnlyNote />
      </>,
    );
    expect(screen.getByText("활성 사용자")).toBeInTheDocument();
    expect(screen.getByText("핵심 액션")).toBeInTheDocument();
    expect(
      screen.getByText(
        /기간 필터만 적용되며 channel\/plan 필터는 적용되지 않습니다/,
      ),
    ).toBeInTheDocument();
  });

  it("keeps detail back-query and states the timeline limitation", () => {
    const detail: AdminUserDetailData = {
      generatedAt: "2026-10-12T00:00:00.000Z",
      user,
      timeline: [],
    };
    render(
      <AdminUserDetail
        data={detail}
        backQuery="range=30&page=2"
        backPath="/admin2/users"
        embedded
        showTimelineLimit
      />,
    );
    expect(screen.getByRole("link", { name: /사용자 목록/ })).toHaveAttribute(
      "href",
      "/admin2/users?range=30&page=2#users",
    );
    expect(screen.getByText("최근 100건 · 필터 없음")).toBeInTheDocument();
  });
});
