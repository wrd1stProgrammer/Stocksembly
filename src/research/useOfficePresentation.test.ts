import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  it("shows durable minutes immediately while visible dialogue finishes in order", () => {
    const { result, rerender } = renderHook(
      ({ events }) => useOfficePresentation(events, "run"),
      { initialProps: { events: [team] } },
    );
    expect(result.current.events).toEqual([team]);
    expect(result.current.tick).toBe(269);
    rerender({ events: [team, visit] });
    expect(result.current.presentation.event?.id).toBe("team");
    expect(result.current.events).toEqual([team, visit]);
    act(() =>
      result.current.presentation.onChange({ id: "team", status: "started" }),
    );
    expect(result.current.events).toEqual([team, visit]);
    expect(result.current.presentation.event?.id).toBe("team");
    const previousCallback = result.current.presentation.onChange;
    act(() => previousCallback({ id: "team", status: "finished" }));
    expect(result.current.tick).toBe(501);
    expect(result.current.events).toEqual([team, visit]);
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
    expect(result.current.events).toEqual([team]);
    expect(result.current.drained).toBe(false);
  });
});

it("catches up hidden history and resumes only newly committed dialogue", () => {
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  try {
    const { result, rerender } = renderHook(
      ({ events }) => useOfficePresentation(events, "background"),
      { initialProps: { events: [team] } },
    );
    act(() => {
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    rerender({ events: [team, visit] });
    expect(result.current.drained).toBe(true);
    act(() => {
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.tick).toBe(501);
    expect(result.current.presentation.active).toBe(false);
    expect(result.current.snapToProgress).toBe(true);
    const next = { ...visit, id: "new" };
    rerender({ events: [team, visit, next] });
    expect(result.current.presentation.event?.id).toBe("new");
    expect(result.current.snapToProgress).toBe(false);
  } finally {
    visibility.mockRestore();
  }
});

it("catches up a reconnect snapshot and flushes terminal history before rendering the failure", () => {
  const { result, rerender } = renderHook(
    ({ revision, terminal, events }) =>
      useOfficePresentation(events, "reconnect", false, {
        syncRevision: revision,
        terminal,
      }),
    { initialProps: { revision: 0, terminal: false, events: [team] } },
  );
  const oldCallback = result.current.presentation.onChange;
  rerender({ revision: 1, terminal: false, events: [team, visit] });
  expect(result.current.drained).toBe(true);
  act(() => oldCallback({ id: "team", status: "finished" }));
  expect(result.current.tick).toBe(501);
  const final = {
    ...visit,
    id: "failure",
    tick: 1541,
    workflowKind: "run_incomplete" as const,
  };
  rerender({ revision: 1, terminal: true, events: [team, visit, final] });
  expect(result.current.events).toHaveLength(3);
  expect(result.current.current.id).toBe("failure");
  expect(result.current.presentation.active).toBe(false);
  expect(result.current.snapToProgress).toBe(true);
  rerender({ revision: 2, terminal: false, events: [team, visit, final] });
  expect(result.current.drained).toBe(true);
});

it("moves to a later server phase without performing the earlier backlog", () => {
  const { result, rerender } = renderHook(
    ({ events }) => useOfficePresentation(events, "advance"),
    { initialProps: { events: [team] } },
  );
  const final = {
    ...visit,
    id: "chair",
    phase: "committee" as const,
    tick: 1541,
  };
  rerender({ events: [team, visit, final] });
  expect(result.current.presentation.event?.id).toBe("chair");
  expect(result.current.tick).toBe(1541);
  expect(result.current.snapToProgress).toBe(true);
});

it("restores a running room at its latest stage without replaying the entrance", () => {
  const { result } = renderHook(() =>
    useOfficePresentation([team, visit], "restored", false, { restore: true }),
  );
  expect(result.current.drained).toBe(true);
  expect(result.current.tick).toBe(501);
  expect(result.current.snapToProgress).toBe(true);
});
