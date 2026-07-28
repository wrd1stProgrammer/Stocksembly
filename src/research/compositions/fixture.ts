import {
  assertSnapshotMode,
  type ResearchArtifactFor,
  type ResearchEventWithModeFor,
} from "../compositionMode";
import {
  agents,
  makeResearchCompany,
  phaseLabels,
  researchEvents,
} from "../mockResearch";
import { researchFileFixture } from "../mockResearchFile";
import { OFFICE_PUBLIC_EVENTS } from "../officeChoreography";
import { researchEventForOfficeEvent } from "./fixturePlayback";
import {
  createCompositionOrigin,
  createCompositionPayload,
  createSnapshot,
  stampArtifact,
  stampEvent,
} from "./internal";
import type {
  CompositionDataFor,
  CompositionViewDataFor,
  ResearchCodexPort,
  ResearchComposition,
  ResearchCompositionPayloadFor,
} from "./types";

const fixtureOrigin = createCompositionOrigin("fixture");

const fixtureEvents: readonly ResearchEventWithModeFor<"fixture">[] =
  researchEvents.map((event) => stampEvent(event, fixtureOrigin));

const fixturePlaybackEvents: readonly ResearchEventWithModeFor<"fixture">[] =
  OFFICE_PUBLIC_EVENTS.map((event) =>
    stampEvent(researchEventForOfficeEvent(event), fixtureOrigin),
  );

const fixtureArtifacts: readonly ResearchArtifactFor<"fixture">[] = [
  stampArtifact(
    {
      id: "fixture-evidence",
      kind: "recorded-evidence",
      snapshotId: "fixture-snapshot-v1",
      contentHash: "fixture-evidence-v1",
    },
    fixtureOrigin,
  ),
  stampArtifact(
    {
      id: "fixture-event-ledger",
      kind: "recorded-public-events",
      snapshotId: "fixture-snapshot-v1",
      contentHash: "fixture-event-ledger-v1",
    },
    fixtureOrigin,
  ),
  stampArtifact(
    {
      id: "fixture-research-file",
      kind: "recorded-research-file",
      snapshotId: "fixture-snapshot-v1",
      contentHash: "fixture-research-file-v1",
    },
    fixtureOrigin,
  ),
];

export const fixtureSnapshot = createSnapshot(
  "fixture-snapshot-v1",
  fixtureOrigin,
  fixtureArtifacts.map((artifact) => artifact.id),
);

const fixtureViewData: CompositionViewDataFor<"fixture"> = {
  agents,
  events: fixtureEvents,
  playbackEvents: fixturePlaybackEvents,
  phaseLabels,
  report: researchFileFixture,
  artifacts: fixtureArtifacts,
  defaultAgentIds: ["market", "risk"],
  history: [
    {
      symbol: "NVDA",
      company: "NVIDIA",
      runs: [
        { label: "Full company research", date: "Today", live: true },
        { label: "Earnings update", date: "Jul 18" },
        { label: "Initial research", date: "Jul 05" },
      ],
    },
    {
      symbol: "AAPL",
      company: "Apple",
      runs: [
        { label: "Quarterly review", date: "Jul 12" },
        { label: "Product cycle update", date: "Jun 24" },
      ],
    },
    {
      symbol: "MSFT",
      company: "Microsoft",
      runs: [{ label: "Cloud outlook", date: "Jun 30" }],
    },
  ],
  sources: [
    { en: "SEC filings", ko: "SEC 공시" },
    { en: "Earnings call", ko: "실적 발표" },
    { en: "Reuters", ko: "Reuters" },
    { en: "Nasdaq market data", ko: "Nasdaq 시장 데이터" },
  ],
};

export const fixtureData: CompositionDataFor<"fixture"> = {
  ...fixtureViewData,
  createCompany: makeResearchCompany,
};

let fakeCodexInvocationCount = 0;
const fixtureCodexPort: ResearchCodexPort = {
  id: "fixture-recorded-codex",
  kind: "fake",
  async run(input: unknown) {
    fakeCodexInvocationCount += 1;
    return {
      input,
      invocationCount: fakeCodexInvocationCount,
      mode: "fixture",
    };
  },
};

function payloadWithInvocation(
  invocationCount: number,
): ResearchCompositionPayloadFor<"fixture"> {
  return createCompositionPayload(
    fixtureOrigin,
    fixtureViewData,
    fixtureSnapshot,
    {
      kind: "fake",
      invocationCount,
    },
  );
}

export const fixturePayload = payloadWithInvocation(1);

export const fixtureComposition: ResearchComposition<"fixture"> = {
  name: "fixture",
  mode: "fixture",
  createCompany: makeResearchCompany,
  async createPayload() {
    const result = await fixtureCodexPort.run({
      mode: "fixture",
      snapshotId: fixtureSnapshot.id,
    });
    const invocationCount =
      typeof result === "object" &&
      result !== null &&
      "invocationCount" in result &&
      typeof result.invocationCount === "number"
        ? result.invocationCount
        : 0;
    return payloadWithInvocation(invocationCount);
  },
  openSnapshot(snapshot) {
    return assertSnapshotMode("fixture", snapshot);
  },
};
