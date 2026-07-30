import { describe, expect, it } from "vitest";
import { validReport } from "./report.testSupport";
import {
  parseStoredResearchReport,
  singleLocaleReportForStorage,
} from "./reportStorage";

describe("single-locale report storage", () => {
  it("stores only the selected narrative language and restores legacy readers", () => {
    const report = validReport();
    const stored = singleLocaleReportForStorage(
      parseStoredResearchReport(report),
      "ko",
    );
    const serialized = JSON.stringify(stored);

    expect(stored["schemaVersion"]).toBe("workflow-v1-single-locale");
    expect(stored["locale"]).toBe("ko");
    expect(stored).not.toHaveProperty("locales");
    expect(serialized).toContain("수요는 견조합니다.");
    expect(serialized).not.toContain("Demand remains constructive.");

    const restored = parseStoredResearchReport(stored);
    expect(restored.locales.ko).toEqual(restored.locales.en);
    expect(restored.teamViews[0]?.position.ko).toBe("수요는 견조합니다.");
    expect(restored.teamViews[0]?.position.en).toBe("수요는 견조합니다.");
  });
});
