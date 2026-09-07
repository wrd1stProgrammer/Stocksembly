import { renderHook } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { expect, it } from "vitest";
import {
  markNewResearchEntrance,
  useResearchEntrance,
} from "./useResearchEntrance";

it("plays a new run entrance once, including Strict Mode, then restores revisits", () => {
  markNewResearchEntrance("fresh-run");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>{children}</StrictMode>
  );
  const first = renderHook(() => useResearchEntrance("fresh-run"), { wrapper });
  expect(first.result.current).toBe(true);
  first.rerender();
  expect(first.result.current).toBe(true);
  first.unmount();
  const revisit = renderHook(() => useResearchEntrance("fresh-run"), {
    wrapper,
  });
  expect(revisit.result.current).toBe(false);
});

it("restores an existing run without treating event count as a new launch", () => {
  const view = renderHook(() => useResearchEntrance("existing-run"));
  expect(view.result.current).toBe(false);
});
