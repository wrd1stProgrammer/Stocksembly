import { describe, expect, it } from "vitest";
import { publicParticipantsForAgentOutput } from "./publicEventParticipants";

describe("publicParticipantsForAgentOutput", () => {
  it("publishes the people who actually collaborate in each round", () => {
    expect(
      publicParticipantsForAgentOutput("department_consolidation", "market"),
    ).toEqual(["market", "market_news", "benchmark"]);
    expect(
      publicParticipantsForAgentOutput("blind_challenge", "market"),
    ).toEqual(["market", "financial"]);
    expect(
      publicParticipantsForAgentOutput("owner_response_ballot", "financial"),
    ).toEqual(["financial", "market"]);
    expect(
      publicParticipantsForAgentOutput("chair_synthesis", "chair"),
    ).toEqual(["chair", "market", "company", "financial", "risk"]);
  });
});
