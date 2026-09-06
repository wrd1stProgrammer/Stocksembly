import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy, intlLocale, locales } from "../../lib/i18n";
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

vi.mock("../SearchConsole", () => ({
  SearchConsole: vi.fn(() => <div data-testid="search-console" />),
}));

const RUN: PublicRun = {
  runId: "00000000-0000-4000-8000-000000000001",
  snapshotId: "00000000-0000-4000-8000-000000000002",
  symbol: "NVDA",
  question: "Can growth justify today's valuation?",
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

afterEach(() => {
  vi.useRealTimers();
});

describe("SignedInHome", () => {
  it.each(locales)(
    "renders research statuses and links in %s",
    async (locale) => {
      const content = copy[locale].home;
      const statuses = Object.keys(content.statuses) as PublicRun["status"][];
      const runs = statuses.map((status, index) => ({
        ...RUN,
        runId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        status,
        ...(index > 0 ? { question: undefined } : {}),
      }));
      testState.listRuns.mockResolvedValue(runs);

      render(<SignedInHome locale={locale} />);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        content.title,
      );
      const research = within(
        screen.getByRole("region", { name: content.researchTitle }),
      );
      const links = await research.findAllByRole("link");
      expect(links).toHaveLength(runs.length);
      const expectedDate = new Intl.DateTimeFormat(intlLocale(locale), {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(RUN.createdAt));
      for (const [index, run] of runs.entries()) {
        const link = links[index];
        expect(link).toHaveAttribute(
          "href",
          `/research/${run.symbol}?run=${run.runId}&lang=${locale}`,
        );
        expect(link).toHaveTextContent(run.symbol);
        expect(link).toHaveTextContent(content.statuses[run.status]);
        expect(link?.querySelector("time")).toHaveAttribute(
          "datetime",
          run.createdAt,
        );
        expect(link?.querySelector("time")).toHaveTextContent(expectedDate);
      }
      expect(research.getAllByText(RUN.question ?? "")).toHaveLength(1);
      expect(testState.bootstrapSession).toHaveBeenCalledOnce();
      expect(testState.listRuns).toHaveBeenCalledWith(12);
    },
  );

  it("keeps the existing search props and invites the first research when empty", async () => {
    const props = {
      locale: "ko" as const,
      onOpenPlans: vi.fn(),
      subscriptionTier: "paid" as const,
      creditsRemaining: 42,
    };
    render(<SignedInHome {...props} />);

    expect(await screen.findByText(copy.ko.home.emptyTitle)).toBeVisible();
    expect(screen.getByText(copy.ko.home.emptyDescription)).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(vi.mocked(SearchConsole).mock.lastCall?.[0]).toEqual(props);
  });

  it("waits for the session before requesting research", async () => {
    let restoreSession = () => {};
    testState.bootstrapSession.mockReturnValue(
      new Promise<void>((resolve) => {
        restoreSession = resolve;
      }),
    );
    render(<SignedInHome locale="en" />);

    expect(screen.getByRole("status")).toHaveTextContent(copy.en.home.loading);
    expect(testState.listRuns).not.toHaveBeenCalled();
    await act(async () => restoreSession());
    expect(screen.getByText(copy.en.home.emptyTitle)).toBeVisible();
    expect(testState.listRuns).toHaveBeenCalledWith(12);
  });

  it("recovers automatically when Cognito session restoration is delayed", async () => {
    vi.useFakeTimers();
    testState.bootstrapSession.mockRejectedValueOnce(
      new Error("Session is restoring"),
    );
    testState.listRuns.mockResolvedValue([RUN]);
    render(<SignedInHome locale="ko" />);

    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(testState.listRuns).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(copy.ko.home.loading);
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByRole("link")).toHaveTextContent("NVDA");
    expect(testState.bootstrapSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a retry button after repeated failures and reloads successfully", async () => {
    vi.useFakeTimers();
    testState.listRuns.mockRejectedValue(new Error("Service unavailable"));
    render(<SignedInHome locale="en" />);

    await act(async () => vi.advanceTimersByTimeAsync(2_650));
    expect(testState.bootstrapSession).toHaveBeenCalledTimes(4);
    expect(testState.listRuns).toHaveBeenCalledTimes(4);
    expect(screen.getByRole("alert")).toHaveTextContent(copy.en.home.error);

    testState.listRuns.mockResolvedValue([RUN]);
    fireEvent.click(screen.getByRole("button", { name: copy.en.home.retry }));
    expect(screen.getByRole("status")).toHaveTextContent(copy.en.home.loading);
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(screen.getByRole("link")).toHaveTextContent("NVDA");
    expect(testState.listRuns).toHaveBeenCalledTimes(5);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: copy.en.home.retry }),
    ).not.toBeInTheDocument();
  });

  it("stops scheduled retries when the signed-in home unmounts", async () => {
    vi.useFakeTimers();
    testState.bootstrapSession.mockRejectedValue(
      new Error("Session unavailable"),
    );
    const { unmount } = render(<SignedInHome locale="en" />);

    await act(async () => vi.advanceTimersByTimeAsync(0));
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(2_650));

    expect(testState.bootstrapSession).toHaveBeenCalledOnce();
    expect(testState.listRuns).not.toHaveBeenCalled();
  });
});
