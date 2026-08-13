import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FullReportPreview } from "../../../src/components/research/FullReportPreview";
import { ResearchRoom } from "../../../src/components/research/ResearchRoom";
import FixtureResearchPage from "./page";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fixture research report versions", () => {
  it("keeps the legacy fixture as the default", async () => {
    const element = (await FixtureResearchPage({
      params: Promise.resolve({ symbol: "NVDA" }),
      searchParams: Promise.resolve({ view: "report" }),
    })) as ReactElement;

    expect(element.type).toBe(ResearchRoom);
  });

  it("selects the structured committee surface only for version=v2", async () => {
    const element = (await FixtureResearchPage({
      params: Promise.resolve({ symbol: "NVDA" }),
      searchParams: Promise.resolve({
        view: "report",
        version: "v2",
        lang: "en",
      }),
    })) as ReactElement<{
      readonly locale: string;
      readonly reportId: string;
      readonly report: { readonly presentationVersion?: string };
    }>;

    expect(element.type).toBe(FullReportPreview);
    expect(element.props.locale).toBe("en");
    expect(element.props.reportId).toBe("committee-fixture");
    expect(element.props.report.presentationVersion).toBe("workflow-v2");
  });

  it("returns not found in production instead of exposing fixture content", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      FixtureResearchPage({
        params: Promise.resolve({ symbol: "NVDA" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow();
  });
});
