import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResearchPage from "./page";

const RUN_ID = "00000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000002";

const pageState = vi.hoisted(() => ({
  handle: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    toString: () => "stocksembly_local_session=session",
  }),
  headers: async () => new Headers({ host: "127.0.0.1:3000" }),
}));

vi.mock("next/navigation", () => ({ notFound: pageState.notFound }));

vi.mock("../../../src/research/server/api/liveResearchApi", () => ({
  getLiveResearchApi: async () => ({ handle: pageState.handle }),
}));

vi.mock("../../../src/components/research/ResearchRoom", () => ({
  ResearchRoom: ({
    initialSnapshot,
    recovery,
  }: {
    readonly initialSnapshot?: { readonly run: { readonly runId: string } };
    readonly recovery?: string;
  }) => (
    <output data-testid="research-route">
      {initialSnapshot?.run.runId ?? recovery}
    </output>
  ),
}));

vi.mock("../../../src/components/research/LaunchingResearchRoom", () => ({
  LaunchingResearchRoom: ({
    researchTarget,
  }: {
    readonly researchTarget: unknown;
  }) => (
    <output data-testid="launch-target">
      {JSON.stringify(researchTarget)}
    </output>
  ),
}));

function detail(symbol: string) {
  return {
    run: {
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      symbol,
      locale: "ko",
      status: "running",
      lastEventSeq: 1,
      createdAt: "2026-07-23T06:00:00.000Z",
    },
    events: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("production research route", () => {
  it("preserves the selected department through slow-launch recovery", async () => {
    // Given
    const props = {
      params: Promise.resolve({ symbol: "NVDA" }),
      searchParams: Promise.resolve({
        lang: "ko",
        launch: "launch-key",
        question: "성장 가능성",
        target: "company",
      }),
    };

    // When
    render(await ResearchPage(props));

    // Then
    expect(screen.getByTestId("launch-target")).toHaveTextContent(
      '{"kind":"department","departmentId":"company"}',
    );
    expect(pageState.handle).not.toHaveBeenCalled();
  });

  it("renders a typed recovery surface when the route has no persisted run identity", async () => {
    // Given
    const props = {
      params: Promise.resolve({ symbol: "NVDA" }),
      searchParams: Promise.resolve({ lang: "en" }),
    };

    // When
    render(await ResearchPage(props));

    // Then
    expect(screen.getByTestId("research-route")).toHaveTextContent(
      "run-required",
    );
    expect(pageState.handle).not.toHaveBeenCalled();
  });

  it("passes an authenticated persisted snapshot to the live client hook", async () => {
    // Given
    pageState.handle.mockResolvedValueOnce(Response.json(detail("NVDA")));
    const props = {
      params: Promise.resolve({ symbol: "NVDA" }),
      searchParams: Promise.resolve({ run: RUN_ID, lang: "ko" }),
    };

    // When
    render(await ResearchPage(props));

    // Then
    expect(screen.getByTestId("research-route")).toHaveTextContent(RUN_ID);
    const request = pageState.handle.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect(request?.url).toBe(
      `http://127.0.0.1:3000/api/research/runs/${RUN_ID}`,
    );
    expect(request?.headers.get("cookie")).toBe(
      "stocksembly_local_session=session",
    );
  });

  it("renders a typed recovery surface for a symbol and persisted-run mismatch", async () => {
    // Given
    pageState.handle.mockResolvedValueOnce(Response.json(detail("AAPL")));
    const props = {
      params: Promise.resolve({ symbol: "NVDA" }),
      searchParams: Promise.resolve({ run: RUN_ID, lang: "en" }),
    };

    // When
    render(await ResearchPage(props));

    // Then
    expect(screen.getByTestId("research-route")).toHaveTextContent(
      "run-symbol-mismatch",
    );
  });

  it("renders reauthentication recovery when the protected snapshot read is unauthorized", async () => {
    // Given
    pageState.handle.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const props = {
      params: Promise.resolve({ symbol: "NVDA" }),
      searchParams: Promise.resolve({ run: RUN_ID, lang: "en" }),
    };

    // When
    render(await ResearchPage(props));

    // Then
    expect(screen.getByTestId("research-route")).toHaveTextContent(
      "reauthentication-required",
    );
  });
});
