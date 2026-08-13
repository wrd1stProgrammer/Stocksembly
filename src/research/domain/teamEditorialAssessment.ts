import type { z } from "zod";
import type {
  EditorialStanceSchema,
  TeamEditorialAssessmentSchema,
} from "./agentOutputsShared";

type DepartmentId = "market" | "company" | "financial" | "risk";
type StanceContribution = "supports" | "opposes" | "uncertain";
type EditorialStance = z.infer<typeof EditorialStanceSchema>;
type TeamEditorialAssessment = z.infer<typeof TeamEditorialAssessmentSchema>;

export function departmentEditorialStance(
  departmentId: DepartmentId,
  contribution: StanceContribution,
): EditorialStance {
  if (contribution === "uncertain") return "wait_for_proof";
  if (departmentId === "risk")
    return contribution === "supports" ? "downside_skewed" : "upside_skewed";
  return contribution === "supports" ? "upside_skewed" : "downside_skewed";
}

export function teamEditorialAssessment(
  departmentId: DepartmentId,
  stance: EditorialStance,
): TeamEditorialAssessment {
  if (departmentId === "market")
    return {
      departmentId,
      lens: "market_regime",
      signal:
        stance === "upside_skewed"
          ? "favorable_setup"
          : stance === "downside_skewed"
            ? "unfavorable_setup"
            : "mixed_setup",
      investmentAction:
        stance === "upside_skewed"
          ? "consider_entry"
          : stance === "downside_skewed"
            ? "avoid_new_entry"
            : "wait_for_confirmation",
    };
  if (departmentId === "company")
    return {
      departmentId,
      lens: "business_quality",
      signal:
        stance === "upside_skewed"
          ? "strengthening"
          : stance === "downside_skewed"
            ? "weakening"
            : "stable",
      investmentAction:
        stance === "upside_skewed"
          ? "consider_entry"
          : stance === "downside_skewed"
            ? "reduce_exposure"
            : "hold_or_monitor",
    };
  if (departmentId === "financial")
    return {
      departmentId,
      lens: "financial_quality",
      signal:
        stance === "upside_skewed"
          ? "value_creating"
          : stance === "downside_skewed"
            ? "value_dilutive"
            : "mixed_quality",
      investmentAction:
        stance === "upside_skewed"
          ? "consider_entry"
          : stance === "downside_skewed"
            ? "reduce_exposure"
            : "hold_or_monitor",
    };
  return {
    departmentId,
    lens: "risk_exposure",
    signal:
      stance === "upside_skewed"
        ? "contained"
        : stance === "downside_skewed"
          ? "severe"
          : "elevated",
    investmentAction:
      stance === "upside_skewed"
        ? "hold_or_monitor"
        : stance === "downside_skewed"
          ? "reduce_exposure"
          : "wait_for_confirmation",
  };
}
