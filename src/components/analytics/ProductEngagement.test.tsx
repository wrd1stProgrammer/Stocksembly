import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProductEngagement } from "./ProductEngagement";

vi.mock("next/navigation", () => ({ usePathname: () => "/research-room" }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // biome-ignore lint/suspicious/noDocumentCookie: isolated consent fixture
  document.cookie = "stocksembly_analytics_consent=; Path=/; Max-Age=0";
});
it("counts only visible time and reuses the page event ID on flush", () => {
  vi.useFakeTimers();
  // biome-ignore lint/suspicious/noDocumentCookie: isolated consent fixture
  document.cookie = "stocksembly_analytics_consent=granted; Path=/";
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  let tick = 0;
  vi.spyOn(performance, "now").mockImplementation(() => tick);
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const view = render(<ProductEngagement />);
  tick = 1000;
  visibility.mockReturnValue("hidden");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  tick = 11000;
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  tick = 12000;
  view.unmount();
  const payloads = fetcher.mock.calls.map((call) => JSON.parse(call[1].body));
  expect(payloads.map((p) => p.visibleMs)).toEqual([1000, 1000, 2000]);
  expect(new Set(payloads.map((p) => p.eventId)).size).toBe(1);
  expect(payloads[0].surface).toBe("reports");
});
