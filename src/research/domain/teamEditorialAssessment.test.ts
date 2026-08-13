import { describe, expect, it } from "vitest";
import {
  departmentEditorialStance,
  teamEditorialAssessment,
} from "./teamEditorialAssessment";

describe("team editorial assessment", () => {
  it("interprets evidence supporting a risk as downside, not upside", () => {
    const stance = departmentEditorialStance("risk", "supports");

    expect(stance).toBe("downside_skewed");
    expect(teamEditorialAssessment("risk", stance)).toEqual({
      departmentId: "risk",
      lens: "risk_exposure",
      signal: "severe",
      investmentAction: "reduce_exposure",
    });
  });

  it("keeps each team's lens distinct from its investment action", () => {
    expect(teamEditorialAssessment("market", "upside_skewed")).toMatchObject({
      lens: "market_regime",
      signal: "favorable_setup",
      investmentAction: "consider_entry",
    });
    expect(teamEditorialAssessment("company", "wait_for_proof")).toMatchObject({
      lens: "business_quality",
      signal: "stable",
      investmentAction: "hold_or_monitor",
    });
    expect(
      teamEditorialAssessment("financial", "downside_skewed"),
    ).toMatchObject({
      lens: "financial_quality",
      signal: "value_dilutive",
      investmentAction: "reduce_exposure",
    });
  });
});
