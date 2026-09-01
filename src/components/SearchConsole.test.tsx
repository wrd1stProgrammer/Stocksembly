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
  authConfigured: false,
  authenticated: true,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: testState.push }),
}));

vi.mock("../research/client/api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../research/client/api")>();
  return {
    ...actual,
    createResearchClient: () => ({
      startRun: testState.startRun,
    }),
  };
});

vi.mock("../auth/amplifyClient", () => ({
  authIsConfigured: () => testState.authConfigured,
}));

vi.mock("../auth/researchSession", () => ({
  currentAuthTokens: async () =>
    testState.authenticated ? { accessToken: "token" } : {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  testState.authConfigured = false;
  testState.authenticated = true;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SearchConsole durable research launch", () => {
  it("uses a compact research-mode picker without ticker shortcuts", () => {
    render(<SearchConsole locale="ko" />);

    const researchMode = screen.getByRole("button", {
      name: "전체 에이전트 위원회",
    });
    expect(researchMode).toHaveAttribute("aria-haspopup", "menu");
    expect(researchMode).toBeEnabled();
    expect(screen.getByRole("button", { name: "맞춤 설정" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "NVDA" }),
    ).not.toBeInTheDocument();
  });

  it("explains what each research team investigates in the mode menu", () => {
    render(<SearchConsole locale="ko" />);

    fireEvent.click(
      screen.getByRole("button", { name: "전체 에이전트 위원회" }),
    );

    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("시장 국면·뉴스·가격 흐름·금리 민감도");
    expect(menu).toHaveTextContent("사업 모델·제품·고객·경쟁 우위");
    expect(menu).toHaveTextContent("실적·현금흐름·재무 품질·밸류에이션");
    expect(menu).toHaveTextContent("하방 시나리오·규제·경고 신호");
    expect(screen.getByText("설명 방식", { selector: "span" })).toBeVisible();
  });

  it("closes the customize panel from an outside pointer or Escape", () => {
    render(<SearchConsole locale="ko" />);

    const customize = screen.getByRole("button", { name: "맞춤 설정" });
    fireEvent.click(customize);
    const panel = screen.getByRole("region", { name: "맞춤 설정" });
    fireEvent.pointerDown(panel);
    expect(
      screen.getByRole("region", { name: "맞춤 설정" }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("region", { name: "맞춤 설정" }),
    ).not.toBeInTheDocument();

    fireEvent.click(customize);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("region", { name: "맞춤 설정" }),
    ).not.toBeInTheDocument();
  });

  it("closes the research-mode menu from an outside pointer", () => {
    render(<SearchConsole locale="ko" />);

    fireEvent.click(
      screen.getByRole("button", { name: "전체 에이전트 위원회" }),
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("confirms the single selected stock from an accessible results list", () => {
    render(<SearchConsole locale="en" />);

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "NVDA" },
    });
    const option = screen.getByRole("option", { name: /NVDA/u });
    expect(screen.getByRole("listbox")).toContainElement(option);

    fireEvent.click(option);

    const selection = screen.getByRole("status");
    expect(selection).toHaveTextContent("Selected · one stock at a time");
    expect(selection).toHaveTextContent("NVDA");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Clear selected stock" }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains that custom settings are subscriber-only for free users", async () => {
    render(
      <SearchConsole
        locale="ko"
        subscriptionTier="free"
        creditsRemaining={5}
      />,
    );

    const customize = screen.getByRole("button", { name: "맞춤 설정" });
    expect(customize).toHaveAttribute("aria-disabled", "true");
    expect(customize).toHaveAttribute("data-locked", "true");
    fireEvent.click(customize);

    expect(
      await screen.findByRole("dialog", {
        name: "맞춤 설정은 구독 사용자 전용입니다",
      }),
    ).toBeInTheDocument();
  });

  it("opens the credit modal before launching when the balance is too low", async () => {
    render(
      <SearchConsole
        locale="en"
        subscriptionTier="free"
        creditsRemaining={0}
      />,
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "NVDA" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Investment question" }),
      { target: { value: "What is priced in?" } },
    );

    const form = screen.getByRole("searchbox").closest("form");
    if (!(form instanceof HTMLFormElement))
      throw new TypeError("search form missing");
    fireEvent.submit(form);

    expect(
      await screen.findByRole("dialog", { name: "Not enough credits" }),
    ).toBeInTheDocument();
    expect(testState.startRun).not.toHaveBeenCalled();
  });

  it("redirects a signed-out production user before creating a run", async () => {
    testState.authConfigured = true;
    testState.authenticated = false;
    render(<SearchConsole locale="en" />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "NVDA" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Investment question" }),
      { target: { value: "What changed?" } },
    );

    const form = screen.getByRole("searchbox").closest("form");
    if (!(form instanceof HTMLFormElement))
      throw new TypeError("search form missing");
    fireEvent.submit(form);

    await waitFor(() =>
      expect(testState.push).toHaveBeenCalledWith(
        "/login?next=%2F%3Flang%3Den%23research",
      ),
    );
    expect(testState.startRun).not.toHaveBeenCalled();
  });

  it("requires a ticker and investment question before research can start", () => {
    // Given
    render(<SearchConsole locale="en" />);
    const start = screen.getByRole("button", { name: "Build research" });

    // Then
    expect(start).toBeDisabled();

    // When
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "NVDA" },
    });

    // Then
    expect(start).toBeDisabled();

    // When
    fireEvent.change(
      screen.getByRole("textbox", { name: "Investment question" }),
      {
        target: { value: "Can margins expand?" },
      },
    );

    // Then
    expect(start).toBeEnabled();
  });

  it("limits the investment question to one hundred characters", () => {
    // Given / When
    render(<SearchConsole locale="en" />);
    const question = screen.getByRole("textbox", {
      name: "Investment question",
    });
    fireEvent.change(question, { target: { value: "a".repeat(101) } });

    // Then
    expect(question).toHaveAttribute("maxlength", "100");
    expect(question).toHaveValue("a".repeat(100));
  });

  it("enters the research room as soon as the run is created", async () => {
    // Given
    vi.useFakeTimers();
    render(<SearchConsole locale="en" />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "nvda" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Investment question" }),
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
    await vi.runAllTimersAsync();
    expect(testState.push).toHaveBeenCalledOnce();
    expect(testState.startRun).toHaveBeenCalledWith({
      symbol: "NVDA",
      question: "What changed in margins?",
      locale: "en",
      idempotencyKey: expect.any(String),
      researchProfile: {
        investmentHorizon: "medium",
        counterargumentIntensity: "standard",
        analysisDepth: "standard",
        decisionPurpose: "new_entry",
        comparisonSymbols: [],
        explanationMode: "professional",
      },
      researchTarget: {
        kind: "department",
        departmentId: "financial",
      },
    });
    expect(testState.push).toHaveBeenCalledWith(
      `/research/NVDA?run=${RUN_ID}&lang=en`,
    );
  });

  it("launches easy explanation mode without reducing analysis depth", async () => {
    render(<SearchConsole locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: "쉽게 설명" }));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "NVDA" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "검증할 투자 질문" }),
      { target: { value: "성장성이 유지될까?" } },
    );

    const form = screen.getByRole("searchbox").closest("form");
    if (!(form instanceof HTMLFormElement))
      throw new TypeError("search form missing");
    fireEvent.submit(form);

    await waitFor(() => expect(testState.startRun).toHaveBeenCalledOnce());
    expect(testState.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        researchProfile: expect.objectContaining({
          analysisDepth: "standard",
          explanationMode: "easy",
        }),
      }),
    );
  });

  it("announces a launch failure and does not navigate", async () => {
    // Given
    testState.startRun.mockRejectedValueOnce(new Error("research unavailable"));
    render(<SearchConsole locale="en" />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "NVDA" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Investment question" }),
      {
        target: { value: "What could change the thesis?" },
      },
    );

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
    fireEvent.change(
      screen.getByRole("textbox", { name: "Investment question" }),
      {
        target: { value: "What is priced into the stock?" },
      },
    );
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
    fireEvent.change(
      screen.getByRole("textbox", { name: "Investment question" }),
      {
        target: { value: "What is the earnings outlook?" },
      },
    );

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
