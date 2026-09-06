import { expect, it } from "vitest";
import { officeDialogue } from "./officeDialogue";
import { dialogueDestinations } from "./officeMotion/destinations";
import { officeRepresentativeMeetings } from "./officeRepresentativeMeetings";
import type { AgentId, ResearchEvent } from "./types";

function event(
  id: string,
  agent: AgentId,
  other: AgentId,
  workflowKind = "challenge_committed",
): ResearchEvent {
  return {
    id,
    agent,
    participantIds: [agent, other],
    workflowKind,
    phase: "challenging",
    progress: 50,
    tick: 501,
    summary: { en: `${id} actual argument`, ko: `${id} 실제 반론` },
    detail: { en: "", ko: "" },
  };
}

it("streams disjoint visits once, then preserves the remaining arguments at the central table", () => {
  const input = [
    event("a", "market", "financial"),
    event("b", "financial", "company"),
    event("c", "company", "risk"),
    event("d", "risk", "market"),
    event("reply", "financial", "market", "owner_response_committed"),
  ];
  expect(
    officeRepresentativeMeetings(input.slice(0, 2)).map((e) => e.id),
  ).toEqual(["a"]);
  const output = officeRepresentativeMeetings(input);
  expect(output.map((e) => e.id)).toEqual(["a", "c", "b", "d", "reply"]);
  expect(output.slice(0, 2).flatMap((e) => e.participantIds)).toEqual([
    "market",
    "financial",
    "company",
    "risk",
  ]);
  expect(
    output.slice(2).every((e) => officeDialogue(e, "en").kind === "forum"),
  ).toBe(true);
  expect(output.find((e) => e.id === "reply")?.summary).toEqual(
    input[4]?.summary,
  );
  for (let length = 1; length <= input.length; length++) {
    const prefix = officeRepresentativeMeetings(input.slice(0, length));
    expect(output.slice(0, prefix.length)).toEqual(prefix);
  }
  const first = output[0],
    second = output[1];
  if (!first || !second) throw new Error("missing visits");
  const destinations = dialogueDestinations(
    officeDialogue(second, "en"),
    new Set(),
    dialogueDestinations(officeDialogue(first, "en"), new Set()),
  );
  expect(destinations.get("market")?.kind).toBe("forum");
  expect(destinations.get("financial")?.kind).toBe("forum");
  expect(destinations.get("company")?.kind).toBe("visit");
  expect(destinations.get("risk")?.kind).toBe("visit");
});

it("releases an incomplete matching when responses start instead of waiting for another visitor", () => {
  const input = [
    event("a", "market", "company"),
    event("b", "market", "risk"),
    event("reply", "company", "market", "owner_response_committed"),
  ];
  const output = officeRepresentativeMeetings(input);
  expect(output.map((e) => e.id)).toEqual(["a", "b", "reply"]);
  expect(output.map((e) => officeDialogue(e, "en").kind)).toEqual([
    "visit",
    "forum",
    "forum",
  ]);
});
