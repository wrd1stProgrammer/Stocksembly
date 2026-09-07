import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy, locales } from "../../lib/i18n";
import type { PublicRun } from "../../research/client/schemas";
import { SearchConsole } from "../SearchConsole";
import { SignedInHome } from "./SignedInHome";

const testState = vi.hoisted(() => ({
  bootstrapSession: vi.fn<() => Promise<void>>(),
  listRuns: vi.fn<(limit?: number) => Promise<readonly PublicRun[]>>(),
}));
vi.mock("../../auth/researchClient", () => ({
  createAuthenticatedResearchClient: () => testState,
}));
vi.mock("./HomeResearchActivity", () => ({
  HomeResearchActivity: ({ run }: { run: PublicRun }) => (
    <div data-testid="active-research">
      <a href={`/research/${run.symbol}?run=${run.runId}`}>
        {run.symbol} {run.status}
      </a>
    </div>
  ),
}));
vi.mock("../SearchConsole", () => ({
  SearchConsole: vi.fn(() => <div data-testid="search-console" />),
}));
vi.mock("../billing/MembershipAccessModal", () => ({
  MembershipAccessModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="membership-gate" /> : null,
}));
const RUN: PublicRun = {
  runId: "00000000-0000-4000-8000-000000000001",
  snapshotId: "00000000-0000-4000-8000-000000000002",
  symbol: "NVDA",
  question: "Can growth justify valuation?",
  locale: "en",
  status: "completed",
  lastEventSeq: 10,
  createdAt: "2026-09-06T01:30:00.000Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  testState.bootstrapSession.mockReset().mockResolvedValue(undefined);
  testState.listRuns.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
describe("daily workspace", () => {
  it.each(locales)(
    "preserves search and leaves completed history in the sidebar (%s)",
    async (locale) => {
      testState.listRuns.mockResolvedValue([RUN]);
      render(<SignedInHome locale={locale} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        copy[locale].home.title,
      );
      await waitFor(() => expect(testState.listRuns).toHaveBeenCalledWith(12));
      expect(screen.getAllByTestId("search-console")).toHaveLength(1);
      expect(screen.queryByText(RUN.question ?? "")).not.toBeInTheDocument();
      expect(screen.queryByTestId("active-research")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", {
          name: copy[locale].home.researchTitle,
        }),
      ).not.toBeInTheDocument();
    },
  );
  it("keeps search props and omits the watchlist briefing", async () => {
    const props = {
      locale: "ko" as const,
      onOpenPlans: vi.fn(),
      subscriptionTier: "paid" as const,
      creditsRemaining: 42,
    };
    render(<SignedInHome {...props} />);
    expect(
      screen.queryByRole("heading", { name: "내 종목의 브리핑" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "관심 종목 등록하기" }),
    ).not.toBeInTheDocument();
    expect(vi.mocked(SearchConsole).mock.lastCall?.[0]).toEqual(props);
  });
  it("only opens an office for active research", async () => {
    testState.listRuns.mockResolvedValue([
      RUN,
      {
        ...RUN,
        runId: "00000000-0000-4000-8000-000000000003",
        symbol: "AMD",
        status: "running",
      },
    ]);
    render(<SignedInHome locale="en" />);
    expect(await screen.findByTestId("active-research")).toHaveTextContent(
      "AMD running",
    );
    expect(screen.queryByText("NVDA")).not.toBeInTheDocument();
  });
  it("keeps tracked completion available after polling", async () => {
    vi.useFakeTimers();
    testState.listRuns.mockResolvedValue([{ ...RUN, status: "running" }]);
    render(<SignedInHome locale="en" />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    testState.listRuns.mockResolvedValue([RUN]);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByTestId("active-research")).toHaveTextContent(
      "NVDA completed",
    );
  });
  it("waits for authentication and retries failed activity loads", async () => {
    vi.useFakeTimers();
    testState.bootstrapSession.mockRejectedValueOnce(new Error("Restoring"));
    testState.listRuns.mockRejectedValue(new Error("Unavailable"));
    render(<SignedInHome locale="en" />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(testState.listRuns).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(2_650));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to check for active research.",
    );
    testState.listRuns.mockResolvedValue([]);
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("stops retries and polling after unmount", async () => {
    vi.useFakeTimers();
    testState.bootstrapSession.mockRejectedValue(new Error("Unavailable"));
    const { unmount } = render(<SignedInHome locale="en" />);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(testState.bootstrapSession).toHaveBeenCalledOnce();
  });
  it("keeps locked community questions behind membership access", async () => {
    const report = {
      reportId: "00000000-0000-4000-8000-000000000004",
      symbol: "MU",
      question: "Can HBM margins hold?",
      locale: "en" as const,
      researchTarget: { kind: "committee" as const },
      publishedAt: RUN.createdAt,
      status: "complete" as const,
      locked: true,
      viewCount: 1,
    };
    render(
      <SignedInHome
        locale="en"
        communityPreview={{ reports: [report], companyNames: {} }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `MU · ${copy.en.landing.researchRoom.locked}`,
      }),
    );
    expect(screen.getByTestId("membership-gate")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /Can HBM/ }),
    ).not.toBeInTheDocument();
  });
});
