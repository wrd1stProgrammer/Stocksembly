import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { locales } from "../lib/i18n";
import { Header } from "./Header";
import { LandingFooter } from "./LandingSections";

vi.mock("./auth/HeaderAuthAction", () => ({ HeaderAuthAction: () => null }));

describe("crawlable locale links", () => {
  it("includes all homepage translations in the initial closed header HTML", () => {
    const html = renderToStaticMarkup(
      <Header locale="ko" onLocaleChange={() => {}} />,
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    for (const locale of locales) {
      expect(
        document.querySelector(`#header-language-links a[href="/${locale}"]`),
      ).not.toBeNull();
    }
    expect(
      document.querySelector("#header-language-links")?.hasAttribute("hidden"),
    ).toBe(true);
  });

  it("uses equivalent page links and preserves modified-click browser behavior", () => {
    const onChange = vi.fn();
    render(
      <Header
        locale="en"
        onLocaleChange={onChange}
        localePaths={{ en: "/en/stocks/nvda", ko: "/ko/stocks/nvda" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    const link = screen.getByRole("link", { name: /한국어/ });
    expect(link).toHaveAttribute("href", "/ko/stocks/nvda");
    fireEvent.click(link, { ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(onChange).toHaveBeenCalledWith("ko");
  });

  it.each([
    "",
    "/blog",
    "/glossary",
    "/blog/how-to-read-a-10-k",
    "/glossary/free-cash-flow",
  ])("keeps footer translations on the same page: %s", (suffix) => {
    const html = renderToStaticMarkup(
      <LandingFooter locale="ja" localePathSuffix={suffix} />,
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    for (const locale of locales) {
      expect(
        document.querySelector(
          `.site-footer__locale a[href="/${locale}${suffix}"]`,
        ),
      ).not.toBeNull();
    }
  });
});
