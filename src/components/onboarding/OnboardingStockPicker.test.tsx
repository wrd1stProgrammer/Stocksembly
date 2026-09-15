import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OnboardingStockPicker } from "./OnboardingStockPicker";

vi.mock("../../auth/researchSession", () => ({
  currentAuthTokens: async () => ({ accessToken: "fixture" }),
}));
afterEach(() => vi.unstubAllGlobals());
it("enforces 1–3 selections and keeps selections after a failed Next before retrying", async () => {
  let fail = true;
  const fetcher = vi.fn(async (url: string) =>
    url.includes("tickers")
      ? Response.json({
          tickers: ["NVDA", "AAPL", "MSFT", "GOOG"].map((symbol) => ({
            symbol,
            providerCode: `NASDAQ:${symbol}`,
            company: symbol,
            exchange: "NASDAQ",
          })),
        })
      : Response.json({}, { status: fail ? 503 : 202 }),
  );
  vi.stubGlobal("fetch", fetcher);
  const onNext = vi.fn();
  render(
    <OnboardingStockPicker
      locale="ko"
      titleId="title"
      descriptionId="description"
      onNext={onNext}
    />,
  );
  expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
  for (const symbol of ["NVDA", "AAPL", "MSFT"]) {
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: symbol },
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(`${symbol}.*NASDAQ`),
      }),
    );
  }
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "GOOG" } });
  expect(
    await screen.findByRole("button", { name: /GOOG.*NASDAQ/ }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await screen.findByRole("alert");
  expect(onNext).not.toHaveBeenCalled();
  expect(screen.getByText("3 / 3")).toBeVisible();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
  const last = fetcher.mock.calls.at(-1);
  expect(last?.[0]).toBe("/api/account/onboarding/interests");
});
