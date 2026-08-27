import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BriefingEditionPayload,
  BriefingListItem,
  BriefingRoomState,
} from "../../briefing/domain/contracts";
import { BriefingRoom } from "./BriefingRoom";

vi.mock("next/image", () => ({
  default: () => <span data-testid="agent-portrait" />,
}));
vi.mock("border-beam", () => ({
  BorderBeam: ({
    children,
    className,
    size,
    colorVariant,
    strength,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
    readonly size?: string;
    readonly colorVariant?: string;
    readonly strength?: number;
  }) => (
    <div
      className={className}
      data-testid="briefing-border-beam"
      data-size={size}
      data-color-variant={colorVariant}
      data-strength={strength}
    >
      {children}
    </div>
  ),
}));

vi.mock("../MobileBottomNav", () => ({ MobileBottomNav: () => null }));
vi.mock("../SignedInSidebar", () => ({ SignedInSidebar: () => null }));
vi.mock("../research/ResearchSidebar", () => ({
  CompanyLogo: ({ symbol }: { readonly symbol: string }) => (
    <span data-testid={`logo-${symbol}`}>{symbol}</span>
  ),
}));
vi.mock("../ui/dots-ring", () => ({ DotsRing: () => <span>loading</span> }));

const newest: BriefingListItem = {
  briefingId: "00000000-0000-4000-8000-000000000001",
  symbol: "NVDA",
  company: "NVIDIA Corporation",
  locale: "ko",
  marketDate: "2026-08-10",
  generatedAt: "2026-08-10T12:30:00.000Z",
  status: "partial",
  attention: "high",
  headline: "NVDA latest headline",
  summary: "같은 사건을 반복하지 않는 최신 판단 요약입니다.",
  price: {
    value: 182.5,
    currency: "USD",
    changePercent: 1.25,
    marketState: "PRE",
    observedAt: "2026-08-10T12:28:00.000Z",
  },
  nextEarnings: {
    name: "분기 실적 발표",
    scheduledAt: "2026-08-27T20:00:00.000Z",
    whyItMatters: "다음 실적 확인",
    certainty: "estimated",
  },
  unread: true,
};

const { nextEarnings: newestNextEarnings, ...newestWithoutEarnings } = newest;
void newestNextEarnings;

const older: BriefingListItem = {
  ...newestWithoutEarnings,
  briefingId: "00000000-0000-4000-8000-000000000002",
  marketDate: "2026-08-09",
  generatedAt: "2026-08-09T12:30:00.000Z",
  headline: "NVDA previous headline",
  summary: "이전 브리핑 요약입니다.",
  status: "ready",
  attention: "low",
  unread: false,
};

const detail: BriefingEditionPayload = {
  schemaVersion: 1,
  symbol: "NVDA",
  company: "NVIDIA Corporation",
  locale: "ko",
  marketDate: "2026-08-10",
  generatedAt: newest.generatedAt,
  cutoffAt: "2026-08-10T12:30:00.000Z",
  coverageStart: "2026-08-09T12:30:00.000Z",
  status: "partial",
  evidenceCompleteness: "complete",
  generationMode: "fallback",
  attention: "high",
  headline: newest.headline,
  summary: newest.summary,
  price: newest.price,
  materialChanges: [
    {
      id: "news:1",
      kind: "company",
      direction: "mixed",
      title: "데이터센터 공급 계약 보도",
      detail: "계약 규모는 아직 회사 자료로 확인되지 않았습니다.",
      investmentMeaning: "공식 수주 금액 확인 전까지 추정치 반영을 유보합니다.",
      occurredAt: "2026-08-10T10:00:00.000Z",
      sourceUrl: "https://example.com/nvda-contract",
    },
  ],
  agentViews: [
    {
      agent: "company",
      stance: "watch",
      headline: "공식 계약 규모가 핵심",
      detail: "회사 자료에서 수주 금액과 인식 시점을 확인합니다.",
    },
  ],
  bullCase: "공식 수주 금액이 컨센서스를 높이면 상방 근거가 강화됩니다.",
  bearCase: "계약 확인이 지연되면 현재 반응의 근거가 약해집니다.",
  upcomingEvents: [
    {
      name: "분기 실적 발표",
      scheduledAt: "2026-08-27T20:00:00.000Z",
      whyItMatters: "매출과 마진 가이던스가 추정치의 다음 기준입니다.",
      certainty: "estimated",
    },
    {
      name: "정기 주주총회",
      scheduledAt: "2026-08-27T14:00:00.000Z",
      whyItMatters: "이사회 안건과 자본 배분 정책을 확인합니다.",
      certainty: "confirmed",
    },
  ],
  todayChecks: [
    {
      horizon: "today",
      title: "개장 수급 확인",
      timing: "개장 후 30분",
      metric: "전일 고가와 첫 30분 거래량",
      confirmation: "전일 고가 위에서 거래량이 유지되는 경우",
      ifConfirmed: "당일 수요 확인 근거가 강해집니다.",
      ifUnclear: "가격과 거래량이 엇갈리면 기존 판단을 유지합니다.",
      ifFailed: "헤드라인의 당일 영향은 약화됩니다.",
    },
    {
      horizon: "next_catalyst",
      title: "다음 실적에서 추정치 방어",
      timing: "2026-08-27",
      metric: "매출·마진 가이던스",
      confirmation: "매출과 마진이 컨센서스를 지키는 경우",
      ifConfirmed: "성장 지속성의 근거가 확인됩니다.",
      ifUnclear: "지표가 엇갈리면 기존 추정치를 유지합니다.",
      ifFailed: "기대 조정 위험이 커집니다.",
    },
    "장중 회사 공시에서 계약 규모를 확인합니다.",
  ],
  changedSincePrevious: "새 계약 보도 한 건이 추가됐습니다.",
  sources: [
    {
      title: "NVIDIA supplier report",
      publisher: "Example News",
      publishedAt: "2026-08-10T10:00:00.000Z",
      url: "https://example.com/nvda-contract",
    },
    {
      title: "Unsafe source",
      publisher: "Unknown",
      publishedAt: newest.generatedAt,
      url: "javascript:alert(1)",
    },
  ],
  limitations: ["documents", "fundamentals"],
};

function roomState(): BriefingRoomState {
  return {
    authenticated: true,
    tier: "pro",
    enabled: true,
    watchlistLimit: 3,
    watchlistChangesRemaining: 8,
    nextBriefingAt: "2026-08-11T12:30:00.000Z",
    marketTimeZone: "America/New_York",
    watchlist: [
      {
        symbol: "NVDA",
        providerCode: "NASDAQ:NVDA",
        company: "NVIDIA Corporation",
        exchange: "NASDAQ",
        position: 0,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    briefings: [newest, older],
    unreadCount: 1,
  };
}

describe("BriefingRoom editorial hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.endsWith(`/api/briefings/${newest.briefingId}`))
          return new Response(JSON.stringify({ briefing: detail }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        return new Response(null, { status: 204 });
      }),
    );
  });

  it("marks only an opened briefing as read", async () => {
    // Given
    render(<BriefingRoom initialState={roomState()} locale="ko" />);

    // Then
    expect(screen.getByText("안 읽음")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();

    // When
    fireEvent.click(
      screen.getByRole("button", { name: /NVDA latest headline/u }),
    );

    // Then
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/briefings/${newest.briefingId}/read`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(screen.queryByText("안 읽음")).not.toBeInTheDocument();
  });

  it("groups current editions separately from history without a permanent NEW badge", () => {
    // Given / When
    render(<BriefingRoom initialState={roomState()} locale="ko" />);

    // Then
    expect(screen.getByRole("heading", { name: "최신 브리핑" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "이전 브리핑" })).toBeVisible();
    expect(screen.queryByText("NEW")).not.toBeInTheDocument();
    const beam = screen.getByTestId("briefing-border-beam");
    expect(beam).toHaveAttribute("data-size", "pulse-inner");
    expect(beam).toHaveAttribute("data-color-variant", "mono");
    expect(beam).toHaveAttribute("data-strength", "0.97");
    expect(beam).toHaveTextContent("NVDA latest headline");
    expect(beam).not.toHaveTextContent("NVDA previous headline");
  });

  it("keeps the selected application language in the briefing room", () => {
    render(
      <BriefingRoom
        initialState={roomState()}
        locale="ja"
        contentLocale="ko"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "ブリーフィング" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "最新ブリーフィング" }),
    ).toBeVisible();
    expect(screen.getAllByText("次回決算")).toHaveLength(2);
  });

  it("restores top-right next earnings and shows pending when no date exists", () => {
    // Given / When
    render(<BriefingRoom initialState={roomState()} locale="ko" />);

    // Then
    expect(screen.getByText("8월 27일")).toBeVisible();
    expect(screen.getByText("예상")).toBeVisible();
    expect(screen.getByText("미정")).toBeVisible();
  });

  it("removes the diagnostic meta grid while preserving sources and limitations", () => {
    // Given
    render(
      <BriefingRoom
        initialState={roomState()}
        locale="ko"
        initialDetails={{ [newest.briefingId]: detail }}
      />,
    );

    // When
    fireEvent.click(
      screen.getByRole("button", { name: /NVDA latest headline/u }),
    );

    // Then
    expect(screen.queryByText("영향도")).not.toBeInTheDocument();
    expect(screen.queryByText("근거 상태")).not.toBeInTheDocument();
    expect(screen.queryByText("작성 방식")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /NVIDIA supplier report/u }),
    ).toHaveAttribute("href", "https://example.com/nvda-contract");
    expect(
      screen.queryByRole("link", { name: /Unsafe source/u }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("회사 공시·문서 수집 결과가 일부 누락됐습니다."),
    ).toBeVisible();
    expect(
      screen.getByText("핵심 재무 지표 수집 결과가 일부 누락됐습니다."),
    ).toBeVisible();
    expect(screen.queryByText("documents")).not.toBeInTheDocument();
  });

  it("separates checks from catalysts and keeps named agent teams visible", () => {
    // Given
    render(
      <BriefingRoom
        initialState={roomState()}
        locale="ko"
        initialDetails={{ [newest.briefingId]: detail }}
      />,
    );

    // When
    fireEvent.click(
      screen.getByRole("button", { name: /NVDA latest headline/u }),
    );

    // Then
    expect(screen.getByRole("heading", { name: "오늘 확인" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "다음 촉매" })).toBeVisible();
    expect(screen.getByText("예상·미확정")).toBeVisible();
    expect(screen.getAllByText("엇갈리면").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("heading", { name: "분기 실적 발표" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "정기 주주총회" }),
    ).toBeVisible();
    const agentHeading = screen.getByRole("heading", {
      name: "에이전트 해석과 상·하방 경로",
    });
    expect(agentHeading).toBeVisible();
    expect(agentHeading.closest("details")).toBeNull();
    expect(screen.getByText("이든")).toBeVisible();
    expect(screen.getByText("기업 책임")).toBeVisible();
    expect(screen.getByTestId("agent-portrait")).toBeVisible();
    expect(
      screen.getByText("장중 회사 공시에서 계약 규모를 확인합니다."),
    ).toBeVisible();
  });

  it("states the recent 24-hour change window concisely", () => {
    // Given
    const {
      changedSincePrevious: previousChangeSummary,
      ...detailWithoutPreviousChange
    } = detail;
    void previousChangeSummary;
    const noChangeDetail = {
      ...detailWithoutPreviousChange,
      materialChanges: [],
    };
    render(
      <BriefingRoom
        initialState={roomState()}
        locale="ko"
        initialDetails={{ [newest.briefingId]: noChangeDetail }}
      />,
    );

    // When
    fireEvent.click(
      screen.getByRole("button", { name: /NVDA latest headline/u }),
    );

    // Then
    expect(
      screen.getByRole("heading", { name: "최근 24시간 변화" }),
    ).toBeVisible();
    expect(
      screen.getByText("최근 24시간 동안 중요한 변화는 없었습니다."),
    ).toBeVisible();
  });
});
