import { workflowV3ReportFromWorkflowV2 } from "./domain/report";
import { workflowV2PresentationFixture } from "./workflowV2Presentation.testSupport";

export function workflowV3PresentationFixture(sourceLocale: "en" | "ko") {
  const v2 = workflowV2PresentationFixture();
  return workflowV3ReportFromWorkflowV2(v2, sourceLocale, "balanced");
}
