import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TechnicalChartResearchPage } from "./TechnicalChartResearchPage";

afterEach(() => vi.unstubAllGlobals());

it("fetches once across parent animation renders and reloads only for a new snapshot", async () => {
  const fetchChart = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ chart: null }),
  });
  vi.stubGlobal("fetch", fetchChart);
  const file = {
    reportId: "00000000-0000-4000-8000-000000000001",
    technicalChart: {
      schemaVersion: "technical-chart-v1" as const,
      digest: "a".repeat(64),
      analysisAsOf: "2026-09-06T00:00:00.000Z",
      status: "ready" as const,
    },
  };
  const { rerender } = render(
    <TechnicalChartResearchPage file={file} locale="ko" />,
  );
  await screen.findByRole("button", { name: "다시 불러오기" });
  expect(fetchChart).toHaveBeenCalledTimes(1);
  rerender(
    <TechnicalChartResearchPage
      file={{ ...file, technicalChart: { ...file.technicalChart } }}
      locale="ko"
    />,
  );
  expect(fetchChart).toHaveBeenCalledTimes(1);
  rerender(
    <TechnicalChartResearchPage
      file={{
        ...file,
        technicalChart: { ...file.technicalChart, digest: "b".repeat(64) },
      }}
      locale="ko"
    />,
  );
  await waitFor(() => expect(fetchChart).toHaveBeenCalledTimes(2));
});
