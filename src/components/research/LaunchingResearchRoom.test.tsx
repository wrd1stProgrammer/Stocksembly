import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ResearchRequestError } from "../../research/client/api";
import { LaunchingResearchRoom } from "./LaunchingResearchRoom";

const state = vi.hoisted(() => ({
  replace: vi.fn(),
  startRun: vi.fn(async (_input: unknown) => ({
    run: { runId: "00000000-0000-4000-8000-000000000001" },
    events: [],
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));

vi.mock("../../auth/researchClient", () => ({
  createAuthenticatedResearchClient: () => ({
    startRun: state.startRun,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it("replays a slow launch with the originally selected department", async () => {
  render(
    <LaunchingResearchRoom
      symbol="NVDA"
      question="성장 가능성"
      locale="ko"
      idempotencyKey="launch-key"
      researchTarget={{ kind: "department", departmentId: "company" }}
    />,
  );

  await waitFor(() =>
    expect(state.startRun).toHaveBeenCalledWith({
      symbol: "NVDA",
      question: "성장 가능성",
      locale: "ko",
      idempotencyKey: "launch-key",
      researchTarget: { kind: "department", departmentId: "company" },
    }),
  );
});

it("starts one durable run when development Strict Mode remounts the room", async () => {
  render(
    <StrictMode>
      <LaunchingResearchRoom
        symbol="MSFT"
        question="Can AI investment preserve free cash flow margins?"
        locale="en"
        idempotencyKey="strict-launch-key"
        researchTarget={{ kind: "department", departmentId: "financial" }}
      />
    </StrictMode>,
  );

  await waitFor(() => expect(state.replace).toHaveBeenCalled());
  expect(state.startRun).toHaveBeenCalledTimes(1);
});

it("retries a transient research admission failure with the same request", async () => {
  state.startRun
    .mockRejectedValueOnce(new ResearchRequestError(503, "RESEARCH_UNREADY"))
    .mockRejectedValueOnce(new ResearchRequestError(503, "RESEARCH_UNREADY"))
    .mockRejectedValueOnce(new ResearchRequestError(503, "RESEARCH_UNREADY"));

  render(
    <LaunchingResearchRoom
      symbol="AAPL"
      question="성장과 주가가 일치하는가?"
      locale="ko"
      idempotencyKey="stable-launch-key"
      researchTarget={{ kind: "department", departmentId: "company" }}
    />,
  );

  await waitFor(
    () => {
      expect(state.startRun).toHaveBeenCalledTimes(4);
      expect(state.replace).toHaveBeenCalledWith(
        "/research/AAPL?run=00000000-0000-4000-8000-000000000001&lang=ko",
      );
    },
    { timeout: 2_000 },
  );
  expect(
    state.startRun.mock.calls.every(
      ([request]) =>
        JSON.stringify(request) ===
        JSON.stringify(state.startRun.mock.calls[0]?.[0]),
    ),
  ).toBe(true);
});
