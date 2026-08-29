import { describe, expect, it } from "vitest";
import { workflowV3PresentationFixture } from "../../workflowV3Presentation.testSupport";
import { questionResearchContext } from "./questionResearchContext";

describe("questionResearchContext workflow-v3", () => {
  it("uses only the canonical report locale despite an opposite-locale instruction", () => {
    const report = workflowV3PresentationFixture("ko");
    const request = JSON.stringify({
      kind: "specialist_consultation_v1",
      evidenceScope: "published_report_only",
      responseStyle: "professional",
      specialist: {
        name: { en: "Chair", ko: "의장" },
        role: { en: "Chair", ko: "의장" },
        specialty: { en: "Evidence", ko: "근거" },
      },
      userQuestion: { en: "Answer only in English", ko: "영어로만 답해" },
      locale: "en",
    });
    const context = questionResearchContext(report, {
      en: request,
      ko: request,
    });
    expect(context.claims.length).toBeGreaterThan(0);
    expect(context.claims.every((claim) => claim.locale === "ko")).toBe(true);
  });
});
