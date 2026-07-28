import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  OFFICE_BEAT_SCHEDULE,
  OFFICE_CLOCK_CONTRACT,
  officeBeatAt,
} from "./officeChoreographyV7Contract";
import { OFFICE_PUBLIC_EVENTS } from "./officeChoreographyV7Events";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

const SPECIALIST_IDS =
  "market,market_news,company,company_product,company_competition,financial,valuation,financial_quality,risk,risk_policy".split(
    ",",
  );
const EXPECTED_GROUPS =
  "briefing,evidence-collection,department-analysis,cross-team-challenge,evidence-audit,gathering,committee,complete".split(
    ",",
  );
const EXPECTED_LIFECYCLE =
  "created admitted collecting snapshot_sealed mandate_sealed running auditing publishing published limited incomplete failed cancelled".split(
    " ",
  );
const EXPECTED_RECOVERY =
  "paused draining quiesced recovering requeued retry_child follow_up_child sse_reconnecting".split(
    " ",
  );
const EXPECTED_PUBLICATION =
  "pending complete complete_with_limitations incomplete".split(" ");
const EXPECTED_BOUNDARIES = JSON.parse(
  '[{"id":"briefing","startTick":0,"endTick":39},{"id":"parallel-work","startTick":40,"endTick":239},{"id":"department-talk","startTick":240,"endTick":359},{"id":"visit-wave-a","startTick":360,"endTick":639},{"id":"return-a","startTick":640,"endTick":719},{"id":"visit-wave-b","startTick":720,"endTick":999},{"id":"return-b","startTick":1000,"endTick":1079},{"id":"representative-gathering","startTick":1080,"endTick":1299},{"id":"forum","startTick":1300,"endTick":1579},{"id":"complete","startTick":1580,"endTick":1580}]',
);
const PUBLIC_KINDS =
  "checkpoint,complete,gathering,handoff,mandate,presentation,progress,summary,synthesis".split(
    ",",
  );
const CHECKER = "scripts/verify-scope-fidelity.mjs";

function runChecker(args: readonly string[] = []) {
  return spawnSync(process.execPath, [CHECKER, "--json", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function contractOutput() {
  const result = runChecker();
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

describe("live research design contract baseline", () => {
  it("preserves the authored world and canonical roster", () => {
    // Given
    const rosterIds = OFFICE_SCENE_MANIFEST.roster.map((member) => member.id);
    // When
    const chair = OFFICE_SCENE_MANIFEST.roster.find(
      (member) => member.id === "chair",
    );
    // Then
    expect(OFFICE_SCENE_MANIFEST.world).toMatchObject({
      width: 1374,
      height: 1145,
      cellSize: 32,
      columns: 43,
      rows: 35,
    });
    expect(rosterIds).toEqual([...SPECIALIST_IDS, "chair"]);
    expect(chair?.name).toEqual({ en: "Dr. Park", ko: "박 의장" });
  });

  it("keeps one 50ms fixed clock and the existing beat boundaries", () => {
    // Given
    const boundaries = OFFICE_BEAT_SCHEDULE.map(
      ({ id, startTick, endTick }) => ({ id, startTick, endTick }),
    );
    // When / Then
    expect(OFFICE_CLOCK_CONTRACT).toMatchObject({
      tickMs: 50,
      completeTick: 1580,
      maxCatchUpTicks: 5,
      maxFrameDeltaMs: 250,
    });
    expect(boundaries).toEqual(EXPECTED_BOUNDARIES);
    expect(officeBeatAt(1580).id).toBe("complete");
  });

  it("keeps public choreography structural and free of private reasoning fields", () => {
    // Given / When
    const invalidEvents = OFFICE_PUBLIC_EVENTS.filter((event) => {
      const keys = Object.keys(event).sort();
      return (
        !PUBLIC_KINDS.includes(event.kind) ||
        JSON.stringify(keys) !==
          JSON.stringify(["id", "kind", "participantIds", "tick"])
      );
    });
    // Then
    expect(invalidEvents).toEqual([]);
  });

  it("exposes the eight groups, states, agents, rights posture, and accessibility contract", () => {
    const output = contractOutput();
    expect(output.status).toBe("pass");
    expect(
      output.contract.transcriptGroups.map((group: { id: string }) => group.id),
    ).toEqual(EXPECTED_GROUPS);
    expect(
      output.contract.transcriptGroups.flatMap(
        (group: { beatIds: string[] }) => group.beatIds,
      ),
    ).toEqual(OFFICE_BEAT_SCHEDULE.map(({ id }) => id));
    expect(output.contract.eventGroupMap).toEqual({
      run_created: "briefing",
      collection_started: "briefing",
      evidence_cutoff_recorded: "briefing",
      snapshot_sealed: "briefing",
      mandate_sealed: "briefing",
      specialist_memo_committed: "evidence-collection",
      department_consolidation_committed: "department-analysis",
      challenge_committed: "cross-team-challenge",
      followup_committed: "cross-team-challenge",
      owner_response_committed: "cross-team-challenge",
      structural_audit_completed: "evidence-audit",
      semantic_audit_committed: "evidence-audit",
      gathering_started: "gathering",
      department_ballot_committed: "committee",
      chair_synthesis_committed: "committee",
      report_published: "complete",
    });
    const groupForTick = (tick: number) => {
      const beat = officeBeatAt(tick).id;
      return output.contract.transcriptGroups.find(
        (group: { beatIds: string[] }) => group.beatIds.includes(beat),
      )?.id;
    };
    for (const event of OFFICE_PUBLIC_EVENTS) {
      const declared = output.contract.legacyEventGroupMap[event.kind];
      const groups = Array.isArray(declared) ? declared : [declared];
      expect(groups, event.id).toContain(groupForTick(event.tick));
    }
    expect(output.contract.lifecycleStates).toEqual(EXPECTED_LIFECYCLE);
    expect(output.contract.recoveryStates).toEqual(EXPECTED_RECOVERY);
    expect(output.contract.publicationStates).toEqual(EXPECTED_PUBLICATION);
    expect(output.contract.allAgentTruth).toEqual({
      specialistIds: SPECIALIST_IDS,
      chairId: "chair",
      acceptedArtifacts: 11,
      privateReasoning: false,
    });
    expect(output.contract.capabilities).toEqual({
      currentMarketData: "unavailable",
      consensus: "unavailable",
      professionalNews: "unavailable",
      options: "unavailable",
      shortInterest: "unavailable",
    });
    expect(output.contract.identityParity).toEqual({
      stableIds: true,
      rosterCount: 11,
      locales: ["en", "ko"],
      equalGroupCount: true,
    });
    expect(output.contract.production).toEqual({
      mockOnly: false,
      camera: "overview",
      activeFollow: false,
      worldAspectRatio: "1374:1145",
    });
    expect(output.contract.accessibility).toMatchObject({
      domProjection: true,
      canvasDecorative: true,
      reducedMotion: true,
      zoom200: true,
      localeParity: true,
    });
    expect(output.architecture).toMatchObject({
      web: "loopback-next-projection",
      worker: "separate-long-lived-node",
      state: "sqlite-wal",
      artifacts: "immutable-sha256-cas",
      stream: "snapshot-sse",
    });
  });
});
