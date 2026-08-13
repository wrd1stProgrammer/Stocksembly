import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ResearchCompany } from "../../research/types";
import { ResearchSidebar } from "./ResearchSidebar";

const company: ResearchCompany = {
  symbol: "NVDA",
  company: "NVIDIA Corporation",
  exchange: "NASDAQ",
  sector: "Semiconductors",
  price: "$100",
  change: "0%",
  marketStatus: { en: "Open", ko: "개장" },
};

describe("ResearchSidebar history", () => {
  it("renders repeated analyses as separate slots and opens the selected run", () => {
    const onRunSelect = vi.fn();
    render(
      <ResearchSidebar
        company={company}
        agents={[]}
        defaultAgentIds={[]}
        history={[
          {
            symbol: "NVDA",
            company: "NVIDIA Corporation",
            runs: [
              {
                runId: "00000000-0000-4000-8000-000000000001",
                label: "Full agent analysis 2",
                date: "07/29/2026, 02:30 AM",
              },
              {
                runId: "00000000-0000-4000-8000-000000000002",
                label: "Full agent analysis 1",
                date: "07/29/2026, 01:30 AM",
                current: true,
              },
            ],
          },
        ]}
        locale="en"
        collapsed={false}
        onCollapsedChange={vi.fn()}
        onRunSelect={onRunSelect}
        onProfileOpen={vi.fn()}
        onLocaleChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Full agent analysis 2")).toBeVisible();
    expect(screen.getByText("Full agent analysis 1")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: /Full agent analysis 2/u }),
    );
    expect(onRunSelect).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "NVDA",
    );
  });

  it("keeps only the profile action in the footer and opens account details", () => {
    const onProfileOpen = vi.fn();
    render(
      <ResearchSidebar
        company={company}
        agents={[]}
        defaultAgentIds={[]}
        history={[]}
        locale="ko"
        collapsed={false}
        onCollapsedChange={vi.fn()}
        onProfileOpen={onProfileOpen}
        onLocaleChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("개선사항 보내기")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "내 정보" }));
    expect(onProfileOpen).toHaveBeenCalledOnce();
  });
});
