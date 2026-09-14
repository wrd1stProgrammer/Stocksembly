import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PricingPlansGrid } from "./PricingPlansGrid";

const currentAuthTokens = vi.fn();

vi.mock("../../auth/researchSession", () => ({
  currentAuthTokens: () => currentAuthTokens(),
}));

vi.mock("border-beam", () => ({
  BorderBeam: ({ children }: { readonly children: ReactNode }) => children,
}));

const plans = [
  {
    id: "pro" as const,
    name: "Pro",
    description: "Core research",
    monthlyAmount: 19,
    annualAmount: 190,
    monthlyCheckoutUrl: "/api/billing/checkout?plan=pro-monthly",
    annualCheckoutUrl: "/api/billing/checkout?plan=pro-annual",
    features: ["Research reports"],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  currentAuthTokens.mockReset();
});

describe("PricingPlansGrid hosted checkout", () => {
  it("opens a tab before authentication resolves and navigates to the server session", async () => {
    let resolveAuth: (value: { accessToken: string }) => void = () => {};
    currentAuthTokens.mockReturnValue(
      new Promise((resolve) => {
        resolveAuth = resolve;
      }),
    );
    const popup = {
      opener: window,
      closed: false,
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    const open = vi.fn().mockReturnValue(popup);
    vi.stubGlobal("open", open);
    const purchaseUrl = "https://whop.com/checkout/ch_test/";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ purchaseUrl, sessionId: "ch_test" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PricingPlansGrid plans={plans} locale="en" initialCycle="monthly" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(popup.opener).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    resolveAuth({ accessToken: "access-token" });
    await waitFor(() =>
      expect(popup.location.replace).toHaveBeenCalledWith(purchaseUrl),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing/checkout?plan=pro-monthly",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer access-token",
        }),
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the blank tab and allows retry when session creation fails", async () => {
    currentAuthTokens.mockResolvedValue({ accessToken: "access-token" });
    const popup = { opener: window, closed: false, close: vi.fn() };
    vi.stubGlobal("open", vi.fn().mockReturnValue(popup));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    );
    render(
      <PricingPlansGrid plans={plans} locale="ko" initialCycle="monthly" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "결제 페이지를 열지 못했습니다",
    );
    expect(popup.close).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "시작하기" })).toBeEnabled();
  });
});
