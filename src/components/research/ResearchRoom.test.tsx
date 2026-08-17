import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fixtureData,
  fixturePayload,
} from "../../research/compositions/fixture";
import { ResearchRoom } from "./ResearchRoom";

vi.mock("./PixelOfficeGame", () => ({
  PixelOfficeGame: ({ status }: { readonly status?: string }) => (
    <div data-testid="pixel-office-game">{status}</div>
  ),
}));

const liveState = vi.hoisted(() => ({
  projectionState: "live",
  resync: vi.fn(async () => undefined),
}));

vi.mock("../../research/client/api", () => ({
  createResearchClient: () => ({}),
}));

vi.mock("../../research/client/useResearchRun", () => ({
  useResearchRun: (snapshot: unknown) => ({
    snapshot,
    state: liveState.projectionState,
    resync: liveState.resync,
  }),
}));

const company = fixtureData.createCompany(
  "NVDA",
  "NVIDIA Corporation",
  "NASDAQ",
  "Semiconductors",
);

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  liveState.projectionState = "live";
  liveState.resync.mockClear();
});

describe("ResearchRoom product playback", () => {
  it("projects durable live events through the authored three-pane office", async () => {
    // Given
    const snapshot = {
      run: {
        runId: "00000000-0000-4000-8000-000000000001",
        snapshotId: "00000000-0000-4000-8000-000000000002",
        symbol: "NVDA",
        locale: "en" as const,
        status: "running" as const,
        lastEventSeq: 7,
        createdAt: "2026-07-23T06:00:00.000Z",
      },
      events: [
        {
          sequence: 7,
          kind: "gathering_started" as const,
          occurredAt: "2026-07-23T06:10:00.000Z",
          stateId: "gathering",
          summary: {
            en: "Committee gathering started",
            ko: "위원회 소집 시작",
          },
          participantIds: [],
          claimIds: [],
          sourceIds: [],
          limitationIds: [],
        },
      ],
    };
    // When
    const { container } = render(
      <ResearchRoom initialSnapshot={snapshot} initialLocale="en" />,
    );

    // Then
    await waitFor(() =>
      expect(screen.getByTestId("pixel-office-game")).toBeVisible(),
    );
    expect(
      screen.getByRole("heading", { name: "Committee gathering started" }),
    ).toBeVisible();
    expect(screen.getAllByText("NVDA").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("complementary", { name: "Research navigation" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Meeting minutes" }),
    ).toBeVisible();
    expect(container.querySelector(".research-shell")).toHaveAttribute(
      "data-research-state",
      "live",
    );
    expect(container.querySelector(".office-stage")).toBeVisible();
    expect(container.querySelector(".research-sidebar")).toBeVisible();
    expect(container.querySelector(".live-runtime")).toBeNull();
  });

  it("renders the command-free three-pane research workspace", () => {
    // Given
    const { container } = render(
      <ResearchRoom
        company={company}
        payload={fixturePayload}
        initialLocale="en"
      />,
    );

    // When
    expect(
      screen.getByRole("complementary", { name: "Research navigation" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Meeting minutes" }),
    ).toBeVisible();
    expect(screen.getByText("LIVE RESEARCH ROOM")).toBeVisible();
    expect(
      container.querySelectorAll("[data-event-id]").length,
    ).toBeGreaterThan(0);

    // Then
    expect(container.querySelector(".research-command")).toBeNull();
    expect(container.querySelector(".evidence-summary")).toBeNull();
    expect(container.querySelector(".research-progress")).toBeNull();
    expect(container.querySelector(".activity-tabs")).toBeNull();
    expect(container.querySelector(".office-stage")).toHaveAttribute(
      "data-camera-mode",
      "automatic",
    );
    expect(container.querySelector(".office-camera-toggle")).toBeNull();
    expect(container.querySelectorAll("[data-event-id] a")).toHaveLength(0);
    expect(container.textContent).not.toMatch(
      /six agents|six specialists|chain[- ]of[- ]thought|private reasoning|hidden reasoning/i,
    );
  });

  it("collapses and restores the left research navigation", () => {
    const { container } = render(
      <ResearchRoom
        company={company}
        payload={fixturePayload}
        initialLocale="ko"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "좌측 사이드바 접기" }));

    expect(container.querySelector(".research-shell")).toHaveAttribute(
      "data-sidebar-open",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "좌측 사이드바 펼치기" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "좌측 사이드바 펼치기" }),
    );
    expect(container.querySelector(".research-shell")).toHaveAttribute(
      "data-sidebar-open",
      "true",
    );
  });

  it("does not label a failed durable run as live", () => {
    // Given
    liveState.projectionState = "failed";
    const snapshot = {
      run: {
        runId: "00000000-0000-4000-8000-000000000001",
        snapshotId: "00000000-0000-4000-8000-000000000002",
        symbol: "NVDA",
        locale: "en" as const,
        status: "failed" as const,
        lastEventSeq: 8,
        createdAt: "2026-07-23T06:00:00.000Z",
      },
      events: [
        {
          sequence: 8,
          kind: "run_failed" as const,
          occurredAt: "2026-07-23T06:01:00.000Z",
          stateId: "failed",
          participantIds: [],
          claimIds: [],
          sourceIds: [],
          limitationIds: [],
        },
      ],
    };

    // When
    render(<ResearchRoom initialSnapshot={snapshot} initialLocale="en" />);

    // Then
    expect(screen.getByRole("heading", { name: "Run failed." })).toBeVisible();
    expect(screen.getByText("Research failed")).toBeVisible();
    expect(screen.queryByText("Department research in progress")).toBeNull();
    expect(screen.queryByText("Live")).toBeNull();
  });

  it("shows a recoverable status instead of silently appearing stuck", () => {
    // Given
    liveState.projectionState = "connection-interrupted";
    const snapshot = {
      run: {
        runId: "00000000-0000-4000-8000-000000000001",
        snapshotId: "00000000-0000-4000-8000-000000000002",
        symbol: "NVDA",
        locale: "en" as const,
        status: "running" as const,
        lastEventSeq: 7,
        createdAt: "2026-07-23T06:00:00.000Z",
      },
      events: [],
    };

    // When
    render(<ResearchRoom initialSnapshot={snapshot} initialLocale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Reconnect now" }));

    // Then
    expect(
      screen.getByText(
        "Restoring the connection and checking analysis status.",
      ),
    ).toBeVisible();
    expect(liveState.resync).toHaveBeenCalledOnce();
  });

  it("keeps specialist questions out of the research navigation", () => {
    // Given
    render(
      <ResearchRoom
        company={company}
        payload={fixturePayload}
        initialLocale="en"
      />,
    );

    // Then
    expect(
      screen.queryByRole("button", { name: "New conversation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("ASK SPECIALISTS")).not.toBeInTheDocument();
    expect(screen.getByText("ANALYSIS HISTORY")).toBeVisible();
  });

  it("groups repeated analysis runs by ticker without the old roster copy", () => {
    // Given
    const { container } = render(
      <ResearchRoom
        company={company}
        payload={fixturePayload}
        initialLocale="en"
      />,
    );

    // When
    const groups = container.querySelectorAll(".analysis-history__group");

    // Then
    expect(groups).toHaveLength(3);
    expect(
      container.querySelectorAll(
        ".analysis-history__group:first-child .analysis-history__runs button",
      ),
    ).toHaveLength(3);
    expect(container.querySelector(".agent-list")).toBeNull();
    expect(container.textContent).not.toMatch(
      /Representative forum|members ·|Maya → Ethan|Noah → Liam/,
    );
  });
});
