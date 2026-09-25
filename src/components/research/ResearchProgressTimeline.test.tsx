import { act, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useResearchRun } from "../../research/client/useResearchRun";
import {
  client,
  detail,
  FakeEventSource,
  publicEvent,
} from "../../research/client/useResearchRun.testSupport";
import { ResearchProgressTimeline } from "./ResearchProgressTimeline";

it("updates the displayed stage through the real stream reducer and snapshot resync", async () => {
  const source = new FakeEventSource();
  const initial = {
    ...detail(1),
    events: [publicEvent(1, "collection_started")],
  };
  const restored = {
    ...detail(5),
    events: [publicEvent(5, "semantic_audit_committed")],
  };
  const options = {
    client: client(vi.fn(async () => restored)),
    createEventSource: () => source,
  };
  function Harness() {
    const projection = useResearchRun(initial, options);
    return (
      <ResearchProgressTimeline
        snapshot={projection.snapshot}
        connection={projection.state}
        locale="ko"
      />
    );
  }
  const { container, unmount } = render(<Harness />);
  const stage = () => container.querySelector("[data-stage]");
  act(() => source.onopen?.());
  expect(stage()).toHaveAttribute("data-stage", "prepare");
  act(() => source.emit(publicEvent(2, "mandate_sealed")));
  expect(stage()).toHaveAttribute("data-stage", "investigate");
  // A gap, as on tab return, triggers the same server resync used in production.
  act(() => source.emit(publicEvent(5, "semantic_audit_committed")));
  await waitFor(() => expect(stage()).toHaveAttribute("data-stage", "audit"));
  act(() => source.emit(publicEvent(6, "chair_synthesis_committed")));
  expect(stage()).toHaveAttribute("data-status", "working");
  act(() => source.emit(publicEvent(7, "report_published")));
  expect(stage()).toHaveAttribute("data-status", "published");
  expect(screen.getByRole("status")).toHaveTextContent(
    "리서치 보고서가 발행되었습니다.",
  );
  expect(container.querySelectorAll('[data-state="done"]')).toHaveLength(5);
  unmount();
});
