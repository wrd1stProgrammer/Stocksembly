import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PREFERRED_LOCALE_STORAGE_KEY } from "../SignedInSidebar";
import {
  SeoLocaleHeader,
  UsStockAnalysisHeader,
} from "./UsStockAnalysisHeader";

const headerState = vi.hoisted(() => ({
  push: vi.fn(),
  put: vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: headerState.push }),
}));

vi.mock("ky", () => ({
  default: { put: headerState.put },
  isTimeoutError: () => false,
}));

vi.mock("../Header", () => ({
  Header: ({
    locale,
    onLocaleChange,
  }: {
    readonly locale: "en" | "ko";
    readonly onLocaleChange: (locale: "en" | "ko") => void;
  }) => (
    <button type="button" onClick={() => onLocaleChange("ko")}>
      {locale}
    </button>
  ),
}));

beforeEach(() => {
  headerState.push.mockReset();
  headerState.put.mockClear();
  window.localStorage.clear();
  document.documentElement.lang = "en";
});

describe("US stock analysis language setting", () => {
  it("stores the route locale when the localized page opens", async () => {
    // Given
    render(<UsStockAnalysisHeader locale="ko" />);

    // When
    await waitFor(() =>
      expect(window.localStorage.getItem(PREFERRED_LOCALE_STORAGE_KEY)).toBe(
        "ko",
      ),
    );

    // Then
    expect(document.documentElement.lang).toBe("ko");
  });

  it("moves to the matching Korean URL when the language setting changes", () => {
    // Given
    const { getByRole } = render(<UsStockAnalysisHeader locale="en" />);

    // When
    fireEvent.click(getByRole("button"));

    // Then
    expect(window.localStorage.getItem(PREFERRED_LOCALE_STORAGE_KEY)).toBe(
      "ko",
    );
    expect(headerState.push).toHaveBeenCalledWith("/ko/us-stock-analysis");
    expect(headerState.put).toHaveBeenCalledWith(
      "/api/account/preferences",
      expect.objectContaining({ json: { locale: "ko" } }),
    );
  });

  it("moves a ticker hub to its supplied localized URL", () => {
    // Given
    const { getByRole } = render(
      <SeoLocaleHeader
        locale="en"
        paths={{ ko: "/ko/stocks/nvda", en: "/en/stocks/nvda" }}
      />,
    );

    // When
    fireEvent.click(getByRole("button"));

    // Then
    expect(headerState.push).toHaveBeenCalledWith("/ko/stocks/nvda");
  });
});
