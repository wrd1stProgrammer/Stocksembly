import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchQuestionField, SearchField } from "./SearchPrimitives";

function useViewport(matchesMobile: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 768px)" && matchesMobile,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("home search inputs", () => {
  it("uses plain native fields on mobile", () => {
    useViewport(true);

    const { container } = render(
      <>
        <SearchField
          value="NVDA"
          label="Company or ticker"
          placeholder="Search"
          onChange={() => undefined}
          onKeyDown={() => undefined}
        />
        <ResearchQuestionField
          value="What changed?"
          label="Investment question"
          placeholder="Ask"
          onChange={() => undefined}
        />
      </>,
    );

    expect(
      container.querySelectorAll('[data-input-mode="native"]'),
    ).toHaveLength(2);
    expect(
      container.querySelector(".search-field__native-input"),
    ).toBeVisible();
    expect(
      container.querySelector(".research-question-field__native-input"),
    ).toBeVisible();
    expect(container.querySelector(".search-field__live-input")).toBeNull();
  });

  it("keeps the animated input treatment on desktop", () => {
    useViewport(false);

    const { container } = render(
      <SearchField
        value=""
        label="Company or ticker"
        placeholder="Search"
        onChange={() => undefined}
        onKeyDown={() => undefined}
      />,
    );

    expect(
      container.querySelector('[data-input-mode="animated"]'),
    ).toBeVisible();
    expect(container.querySelector(".search-field__live-input")).toBeVisible();
    expect(container.querySelector(".search-field__native-input")).toBeNull();
  });
});
