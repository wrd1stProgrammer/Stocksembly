import { describe, expect, it } from "vitest";
import { teamReportPreviewFixture } from "../../../research/teamReportPreviewFixture";
import { rankStructuredRisks } from "./RiskReportModel";

describe("risk observation semantics", () => {
  it("never converts a vote into a measured red alert or uses recovery as a warning", () => {
    const file = teamReportPreviewFixture("risk");
    const risks = rankStructuredRisks(file, "en");
    expect(risks.length).toBeGreaterThan(0);
    for (const risk of risks) {
      const claim = file.structuredEditorial?.claims?.find(
        (item) => item.claimId === risk.claimId,
      );
      expect(risk.signal).toBe("unknown");
      expect(risk.indicator).toBe(claim?.publicThesis.en);
      expect(risk.recovery).toBe(claim?.falsifier.en);
    }
  });
});
