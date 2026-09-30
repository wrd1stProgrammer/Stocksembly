import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import LandingBriefing from "./LandingBriefing";
import LandingReport from "./LandingReport";

it("routes the public briefing CTA through login and preserves its destination", () => {
  render(<LandingBriefing locale="ko" />);
  const link = screen.getByRole("link", { name: "브리핑 룸 살펴보기" });
  const url = new URL(
    link.getAttribute("href") ?? "",
    "https://stocksembly.com",
  );
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe("/briefing-room?lang=ko");
});

it("removes the full-report CTA and exposes expandable questions in the report preview", () => {
  const { container } = render(<LandingReport locale="en" />);
  const viewport = container.querySelector(".landing-file__viewport");
  if (viewport) Object.defineProperty(viewport, "scrollTo", { value: vi.fn() });
  expect(
    screen.queryByRole("link", { name: "Open the full report" }),
  ).toBeNull();
  expect(container.querySelector(".research-anticipated-qa")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Investor Q&A/ }));
  const questions = container.querySelectorAll(
    ".research-anticipated-qa details",
  );
  expect(questions).toHaveLength(10);
  const question = questions[0];
  expect(question?.querySelector("summary")?.textContent).toBeTruthy();
  expect(question?.querySelector("p")?.textContent).toBeTruthy();
});
