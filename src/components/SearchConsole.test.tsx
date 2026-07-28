import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchConsole } from "./SearchConsole";

const RUN_ID = "00000000-0000-4000-8000-000000000001";

const testState = vi.hoisted(() => ({
  push: vi.fn(),
  startRun: vi.fn(async () => ({
    run: { runId: RUN_ID },
    events: [],
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: testState.push }),
}));

vi.mock("../research/client/api", () => ({
  createResearchClient: () => ({
    startRun: testState.startRun,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SearchConsole durable research launch", () => {
  it("limits the optional agent direction to one hundred characters", () => {
    // Given / When
    render(<SearchConsole locale="en" />);
    const question = screen.getByRole("textbox", {
      name: "Research question",
    });
    fireEvent.change(question, { target: { value: "a".repeat(101) } });

    // Then
    expect(question).toHaveAttribute("maxlength", "100");
    expect(question).toHaveValue("a".repeat(100));
  });

  it("keeps the pulse border visible for three seconds before navigating", async () => {
    // Given
    vi.useFakeTimers();
    render(<SearchConsole locale="en" />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "nvda" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Research question" }),
      {
        target: { value: "What changed in margins?" },
      },
    );

    // When
    const form = screen.getByRole("searchbox").closest("form");
    if (!(form instanceof HTMLFormElement))
      throw new TypeError("search form missing");
    fireEvent.submit(form);

    // Then
    await vi.advanceTimersByTimeAsync(2_999);
    expect(testState.push).not.toHaveBeenCalled();
    expect(form.closest("[data-border-beam]")).toHaveAttribute(
      "data-border-beam",
      "pulse-outside",
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(testState.push).toHaveBeenCalledOnce();
    expect(testState.startRun).toHaveBeenCalledWith({
      symbol: "NVDA",
      question: "What changed in margins?",
      locale: "en",
      idempotencyKey: expect.any(String),
    });
    expect(testState.push).toHaveBeenCalledWith(
      `/research/NVDA?run=${RUN_ID}&lang=en`,
    );
  });

  it("enters the research room at three seconds while a slow launch finishes", async () => {
    // Given
    vi.useFakeTimers();
    testState.startRun.mockImplementationOnce(
      async () => await new Promise(() => undefined),
    );
    render(<SearchConsole locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "NVDA" }));

    // When
    const form = screen.getByRole("searchbox").closest("form");
    if (!(form instanceof HTMLFormElement))
      throw new TypeError("search form missing");
    fireEvent.submit(form);
    await vi.advanceTimersByTimeAsync(3_000);

    // Then
    expect(testState.push).toHaveBeenCalledOnce();
    expect(testState.push.mock.calls[0]?.[0]).toMatch(
      /^\/research\/NVDA\?lang=en&launch=.+&question=$/,
    );
  });

  it("announces a launch failure and does not navigate", async () => {
    // Given
    testState.startRun.mockRejectedValueOnce(new Error("research unavailable"));
    render(<SearchConsole locale="en" />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "NVDA" },
    });

    // When
    const form = screen.getByRole("searchbox").closest("form");
    if (!(form instanceof HTMLFormElement))
      throw new TypeError("search form missing");
    fireEvent.submit(form);

    // Then
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to start research. Please try again.",
    );
    expect(testState.push).not.toHaveBeenCalled();
  });

  it("searches the US-listed catalog and starts research for a non-featured stock", async () => {
    // Given
    const tickerSearch = vi.fn(async () => [
      {
        symbol: "AMD",
        company: "Advanced Micro Devices, Inc.",
        exchange: "NASDAQ" as const,
        sector: "SEC listed company",
      },
    ]);
    render(<SearchConsole locale="en" tickerSearch={tickerSearch} />);

    // When
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "advanced micro" },
    });
    const companyName = await screen.findByText("Advanced Micro Devices, Inc.");
    const result = companyName.closest("button");
    expect(result).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(result as HTMLButtonElement);
    const form = screen.getByRole("searchbox").closest("form");
    if (!(form instanceof HTMLFormElement))
      throw new TypeError("search form missing");
    fireEvent.submit(form);

    // Then
    await waitFor(() =>
      expect(testState.startRun).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: "AMD" }),
      ),
    );
    expect(tickerSearch).toHaveBeenCalledWith(
      "advanced micro",
      expect.any(AbortSignal),
    );
  });

  it("starts company-name research with the canonical ticker returned by search", async () => {
    // Given
    const tickerSearch = vi.fn(async () => [
      {
        symbol: "BRK.B",
        company: "Berkshire Hathaway Inc. Class B",
        exchange: "NYSE" as const,
        sector: "SEC listed company",
      },
    ]);
    render(<SearchConsole locale="en" tickerSearch={tickerSearch} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "berkshire class b" },
    });
    fireEvent.click(await screen.findByText("Berkshire Hathaway Inc. Class B"));

    // When
    const form = screen.getByRole("searchbox").closest("form");
    if (!(form instanceof HTMLFormElement))
      throw new TypeError("search form missing");
    fireEvent.submit(form);

    // Then
    await waitFor(() =>
      expect(testState.startRun).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: "BRK.B" }),
      ),
    );
    await waitFor(
      () =>
        expect(testState.push).toHaveBeenCalledWith(
          `/research/BRK.B?run=${RUN_ID}&lang=en`,
        ),
      { timeout: 4_000 },
    );
  });
});
