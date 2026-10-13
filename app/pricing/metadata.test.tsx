import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PricingPage, { generateMetadata } from "./page";

vi.mock("@/src/lib/whop/server", () => ({
  getWhopEnvironment: () => "sandbox",
  getWhopPricing: async () => [],
}));
vi.mock("@/src/components/billing/PublicPricingGrid", () => ({
  PublicPricingGrid: () => null,
}));

describe("pricing metadata", () => {
  it.each([
    [
      undefined,
      "en",
      "Pricing",
      "Stocksembly Pro and Ultra subscription plans",
      "Choose your research depth.",
    ],
    [
      "en",
      "en",
      "Pricing",
      "Stocksembly Pro and Ultra subscription plans",
      "Choose your research depth.",
    ],
    [
      "ko",
      "ko",
      "요금제",
      "Stocksembly Pro와 Ultra 구독 요금제",
      "원하는 리서치 깊이를 선택하세요.",
    ],
    [
      "ja",
      "en",
      "Pricing",
      "Stocksembly Pro and Ultra subscription plans",
      "Choose your research depth.",
    ],
    [
      "invalid",
      "en",
      "Pricing",
      "Stocksembly Pro and Ultra subscription plans",
      "Choose your research depth.",
    ],
  ])(
    "matches the rendered language for lang=%s",
    async (lang, locale, title, description, heading) => {
      const props = {
        searchParams: Promise.resolve(lang === undefined ? {} : { lang }),
      };
      const metadata = await generateMetadata(props);
      render(await PricingPage(props));

      expect(screen.getByRole("main")).toHaveAttribute("lang", locale);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        heading,
      );
      expect(metadata).toEqual({
        title,
        description,
        alternates: {
          canonical: `/pricing?lang=${locale}`,
          languages: {
            "en-US": "/pricing?lang=en",
            "ko-KR": "/pricing?lang=ko",
            "x-default": "/pricing?lang=en",
          },
        },
      });
    },
  );
});
