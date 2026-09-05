import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResearchEvent } from "./types";
import { useOfficePresentation } from "./useOfficePresentation";

const team: ResearchEvent = {
  id: "team",
  agent: "market",
  phase: "analyzing",
  tick: 269,
  progress: 20,
  workflowKind: "department_consolidation_committed",
  summary: { en: "Team consensus", ko: "팀 합의" },
  detail: { en: "", ko: "" },
};
const visit: ResearchEvent = {
  ...team,
  id: "visit",
  tick: 501,
  workflowKind: "challenge_committed",
};

describe("shared minutes and speech presentation", () => {
  it("withholds committed minutes while walking and advances only after the current speech finishes", () => {
    const { result, rerender } = renderHook(
      ({ events }) => useOfficePresentation(events, "run"),
      { initialProps: { events: [team] } },
    );
    expect(result.current.events).toEqual([]);
    expect(result.current.tick).toBe(269);
    rerender({ events: [team, visit] });
    expect(result.current.presentation.event?.id).toBe("team");
    expect(result.current.events).toEqual([]);
    act(() =>
      result.current.presentation.onChange({ id: "team", status: "started" }),
    );
    expect(result.current.events).toEqual([team]);
    expect(result.current.presentation.event?.id).toBe("team");
    const previousCallback = result.current.presentation.onChange;
    act(() => previousCallback({ id: "team", status: "finished" }));
    expect(result.current.tick).toBe(501);
    expect(result.current.events).toEqual([team]);
    act(() =>
      result.current.presentation.onChange({ id: "visit", status: "started" }),
    );
    expect(result.current.events).toEqual([team, visit]);
    act(() =>
      result.current.presentation.onChange({ id: "visit", status: "finished" }),
    );
    expect(result.current.drained).toBe(true);
    expect(result.current.presentation.active).toBe(false);
    rerender({ events: [{ ...team }, { ...visit }] });
    expect(result.current.drained).toBe(true);
    expect(result.current.events).toHaveLength(2);
  });

  it("resets a new run and shows an already-published report without replaying its history", () => {
    const { result, rerender } = renderHook(
      ({ id, bypass }) => useOfficePresentation([team], id, bypass),
      { initialProps: { id: "old", bypass: true } },
    );
    expect(result.current.drained).toBe(true);
    expect(result.current.events).toEqual([team]);
    rerender({ id: "new", bypass: false });
    expect(result.current.events).toEqual([]);
    expect(result.current.drained).toBe(false);
  });
});
