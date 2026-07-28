import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixtureData } from "../../research/compositions/fixture";
import { CompletedResearchFile } from "./CompletedResearchFile";

const company = fixtureData.createCompany(
  "NVDA",
  "NVIDIA Corporation",
  "NASDAQ",
  "Semiconductors",
);

describe("CompletedResearchFile", () => {
  it("shows a continuous evidence dossier with navigable decision layers", () => {
    const onReplay = vi.fn();
    const { container } = render(
      <CompletedResearchFile
        company={company}
        report={fixtureData.report}
        locale="en"
        version={2}
        onReplay={onReplay}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Focus on margin durability and competitive pressure",
      }),
    ).toBeVisible();
    expect(screen.getByText("NVDA")).toBeVisible();
    expect(screen.getByText("NVIDIA Corporation")).toBeVisible();
    expect(screen.getByText("v2.0")).toBeVisible();
    expect(screen.getByText("Key catalysts")).toBeVisible();
    expect(screen.getByText("Key risks")).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: "Research file sections" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Decision" }),
    ).toHaveAttribute("href", "#decision-brief");
    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
    expect(container.querySelectorAll("[data-report-section]")).toHaveLength(5);
    expect(container.querySelector("[data-report-page]")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(
      screen.getByText("Valuation & relative comparison"),
    ).toBeVisible();
    expect(
      screen.getByText("Agent debate & final judgment"),
    ).toBeVisible();
    expect(screen.getByText("Evidence & methodology")).toBeInTheDocument();
    expect(screen.getByText("Team conclusion index")).toBeVisible();
    expect(screen.getByText("Evidence reliability")).toBeVisible();
    expect(screen.getByText("Company key metrics")).toBeVisible();
    expect(screen.queryByText("Audit passed")).not.toBeInTheDocument();
    expect(screen.queryByText("Claims")).not.toBeInTheDocument();
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Linked evidence")).toHaveLength(0);
    expect(
      container.querySelectorAll(".research-team-portrait"),
    ).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(
      container.querySelector("[data-report-theme='dark']"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Replay research room" }),
    );
    expect(onReplay).toHaveBeenCalledOnce();
  });
});
