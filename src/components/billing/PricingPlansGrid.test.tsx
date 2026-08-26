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

vi.mock("@whop/checkout/react", () => ({
  WhopCheckoutEmbed: ({
    sessionId,
    returnUrl,
    environment,
    prefill,
  }: {
    readonly sessionId: string;
    readonly returnUrl: string;
    readonly environment: string;
    readonly prefill?: { readonly email?: string };
  }) => (
    <div
      data-testid="whop-checkout"
      data-session-id={sessionId}
      data-return-url={returnUrl}
      data-environment={environment}
      data-email={prefill?.email}
    />
  ),
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
  currentAuthTokens.mockReset();
});

describe("PricingPlansGrid embedded checkout", () => {
  it("opens the official Whop embed with the server-created checkout session", async () => {
    const identityPayload = window.btoa(
      JSON.stringify({ email: "investor@example.com" }),
    );
    currentAuthTokens.mockResolvedValue({
      accessToken: "access-token",
      identityToken: `header.${identityPayload}.signature`,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          purchaseUrl: "https://whop.com/checkout/plan_pro?session=ch_test",
          planId: "plan_pro",
          sessionId: "ch_test",
          returnUrl: "https://stocksembly.com/?billing=success",
          environment: "production",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PricingPlansGrid plans={plans} locale="en" initialCycle="monthly" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    const embed = await screen.findByTestId("whop-checkout");
    expect(embed).toHaveAttribute("data-session-id", "ch_test");
    expect(embed).toHaveAttribute(
      "data-return-url",
      "https://stocksembly.com/?billing=success",
    );
    expect(embed).toHaveAttribute("data-environment", "production");
    expect(embed).toHaveAttribute("data-email", "investor@example.com");
    expect(
      screen.getByRole("link", { name: /open checkout in a new tab/i }),
    ).toHaveAttribute(
      "href",
      "https://whop.com/checkout/plan_pro?session=ch_test",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing/checkout?plan=pro-monthly",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("closes the embedded checkout without changing the selected plan", async () => {
    currentAuthTokens.mockResolvedValue({ accessToken: "access-token" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            purchaseUrl: "https://whop.com/checkout/plan_pro?session=ch_test",
            sessionId: "ch_test",
            returnUrl: "https://stocksembly.com/?billing=success",
            environment: "production",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    render(
      <PricingPlansGrid plans={plans} locale="ko" initialCycle="monthly" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(await screen.findByTestId("whop-checkout")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "결제창 닫기" }));
    await waitFor(() => {
      expect(screen.queryByTestId("whop-checkout")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "시작하기" })).toBeEnabled();
  });
});
