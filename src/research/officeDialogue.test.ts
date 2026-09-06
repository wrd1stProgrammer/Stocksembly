import { describe, expect, it } from "vitest";
import { createLiveOfficeFrame } from "./liveOfficeAnimation";
import { OfficeDialoguePlayer, officeDialogue } from "./officeDialogue";
import { FORUM_PLACES } from "./officeMotion/layout";
import { LiveOfficeScene } from "./officeMotion/liveScene";
import { measureOfficeBubble } from "./officeMotion/ui";
import { renderOfficeSnapshot } from "./officeRenderer";
import { layoutOfficeUi } from "./officeRendererUiLayout";
import { officeSimulationSnapshot } from "./officeSimulation";
import type { ResearchEvent } from "./types";

const event = (
  id: string,
  agent: ResearchEvent["agent"],
  workflowKind: string,
  participantIds: ResearchEvent["participantIds"] = [],
): ResearchEvent => ({
  id,
  agent,
  workflowKind,
  participantIds,
  phase: "analyzing",
  progress: 30,
  tick: 300,
  summary: {
    en: "A source-linked finding.",
    ko: "출처를 확인한 조사 결과입니다.",
  },
  detail: { en: "", ko: "" },
});

describe("arrival-driven research dialogue", () => {
  it("starts only on arrival, expires the final segment, and never repeats a committed line", () => {
    const dialogue = officeDialogue(
      event("team", "market", "department_consolidation_committed"),
      "ko",
    );
    const player = new OfficeDialoguePlayer();
    expect(player.update(dialogue, false, 20_000)).toMatchObject({
      message: null,
      changes: [],
    });
    expect(player.update(dialogue, true, 0)).toMatchObject({
      message: dialogue.segments[0],
      changes: [{ id: "team", status: "started" }],
    });
    expect(player.update(dialogue, true, 10_000)).toMatchObject({
      message: null,
      changes: [{ id: "team", status: "finished" }],
    });
    expect(player.update({ ...dialogue }, true, 0)).toMatchObject({
      message: null,
      changes: [],
    });
    expect(
      player.update({ ...dialogue, id: "duplicate-summary" }, true, 0),
    ).toMatchObject({
      message: null,
      changes: [
        { id: "duplicate-summary", status: "started" },
        { id: "duplicate-summary", status: "finished" },
      ],
    });
  });

  it("waits for the full team, actual visiting partners, and all five final representatives", () => {
    const scene = new LiveOfficeScene();
    const snapshot = officeSimulationSnapshot(
      createLiveOfficeFrame(220).simulation,
    );
    const options = { reducedMotion: false, paused: false };
    scene.update(snapshot, undefined, 0, options);
    const events = [
      event("market-team", "market", "department_consolidation_committed"),
      event("company-team", "company", "department_consolidation_committed"),
      event(
        "financial-team",
        "financial",
        "department_consolidation_committed",
      ),
      event("risk-team", "risk", "department_consolidation_committed"),
      event("cross", "risk", "challenge_committed", ["risk", "company"]),
      event("response", "company", "owner_response_committed", [
        "risk",
        "company",
      ]),
      event("ballot", "market", "department_ballot_committed"),
    ];
    for (const entry of events) {
      const dialogue = officeDialogue(entry, "ko");
      let frame = scene.update(snapshot, undefined, 0, {
        ...options,
        dialogue,
        speech: null,
      });
      expect(scene.readyForDialogue(dialogue), entry.id).toBe(
        entry.id === "response",
      );
      for (
        let tick = 0;
        tick < 2_400 && !scene.readyForDialogue(dialogue);
        tick += 1
      )
        frame = scene.update(snapshot, undefined, 1 / 60, {
          ...options,
          dialogue,
          speech: null,
        });
      const people = frame.actors.filter((actor) =>
        dialogue.participantIds.includes(actor.id),
      );
      expect(
        scene.readyForDialogue(dialogue),
        JSON.stringify({ id: entry.id, people }),
      ).toBe(true);
      expect(
        people.every(
          (actor) => !["walk", "stand", "sit"].includes(actor.action),
        ),
      ).toBe(true);
      if (dialogue.kind !== "visit")
        expect(people.every((actor) => actor.seated)).toBe(true);
      else {
        expect(new Set(people.map((actor) => actor.facing))).toEqual(
          new Set(["left", "right"]),
        );
        expect(
          Math.abs((people[0]?.position.x ?? 0) - (people[1]?.position.x ?? 0)),
        ).toBeLessThan(60);
      }
    }
    const forum = officeDialogue(
      event("forum", "market", "department_ballot_committed"),
      "ko",
    );
    const actions = new Set<string>();
    for (let tick = 0; tick < 600; tick += 1) {
      const frame = scene.update(snapshot, undefined, 1 / 60, {
        ...options,
        dialogue: forum,
        speech: null,
      });
      frame.actors
        .filter((actor) => forum.participantIds.includes(actor.id))
        .forEach((actor) => {
          actions.add(actor.action);
        });
    }
    expect(actions).toEqual(new Set(["read", "write", "listen"]));
  });

  it("keeps independent pairs in place when questions become responses", () => {
    const scene = new LiveOfficeScene();
    const snapshot = officeSimulationSnapshot(
      createLiveOfficeFrame(220).simulation,
    );
    const options = { reducedMotion: false, paused: false };
    scene.update(snapshot, undefined, 0, options);
    const positions = new Map<
      string,
      { position: { x: number; y: number }; facing: string }
    >();
    const exchanges = [
      event("question-a", "market", "challenge_committed", [
        "market",
        "company",
      ]),
      event("question-b", "financial", "challenge_committed", [
        "financial",
        "risk",
      ]),
      event("answer-a", "company", "owner_response_committed", [
        "company",
        "market",
      ]),
      event("answer-b", "risk", "owner_response_committed", [
        "risk",
        "financial",
      ]),
      event("followup-a", "market", "followup_committed", [
        "market",
        "company",
      ]),
    ];
    for (const entry of exchanges) {
      const dialogue = officeDialogue(entry, "ko");
      let frame = scene.update(snapshot, undefined, 0, {
        ...options,
        dialogue,
        speech: null,
      });
      const returningPair = dialogue.participantIds.every((id) =>
        positions.has(id),
      );
      expect(scene.readyForDialogue(dialogue)).toBe(returningPair);
      for (
        let tick = 0;
        tick < 2400 && !scene.readyForDialogue(dialogue);
        tick += 1
      ) {
        frame = scene.update(snapshot, undefined, 1 / 60, {
          ...options,
          dialogue,
          speech: null,
        });
        for (const actor of frame.actors) {
          const prior = positions.get(actor.id);
          if (prior) {
            expect(actor.position, `${entry.id}: ${actor.id}`).toEqual(
              prior.position,
            );
            expect(actor.facing).toBe(prior.facing);
            expect(actor.action).not.toBe("walk");
          }
        }
      }
      expect(scene.readyForDialogue(dialogue)).toBe(true);
      for (const actor of frame.actors) {
        if (!dialogue.participantIds.includes(actor.id)) continue;
        const prior = positions.get(actor.id);
        if (prior)
          expect({ position: actor.position, facing: actor.facing }).toEqual(
            prior,
          );
        positions.set(actor.id, {
          position: actor.position,
          facing: actor.facing,
        });
      }
    }
  });

  it("gathers five people for evidence review before report arrival and keeps the final meeting seated", () => {
    const scene = new LiveOfficeScene();
    const snapshot = officeSimulationSnapshot(
      createLiveOfficeFrame(220).simulation,
    );
    const options = { reducedMotion: false, paused: false };
    scene.update(snapshot, undefined, 0, options);
    const audit = officeDialogue(
      event("audit", "chair", "structural_audit_completed"),
      "ko",
    );
    expect(audit.kind).toBe("forum");
    expect(audit.participantIds).toHaveLength(5);
    scene.update(snapshot, undefined, 0, {
      ...options,
      dialogue: audit,
      speech: null,
    });
    expect(scene.readyForDialogue(audit)).toBe(false);
    for (let tick = 0; tick < 2400 && !scene.readyForDialogue(audit); tick += 1)
      scene.update(snapshot, undefined, 1 / 60, {
        ...options,
        dialogue: audit,
        speech: null,
      });
    expect(scene.readyForDialogue(audit)).toBe(true);
    const finalEvents = [
      event("meaning", "chair", "semantic_audit_committed"),
      ...(["market", "company", "financial", "risk"] as const).map((id) => ({
        ...event(`present-${id}`, id, "committee_team_view"),
        phase: "committee" as const,
      })),
      {
        ...event("chair", "chair", "chair_synthesis_committed"),
        phase: "committee" as const,
      },
      {
        ...event("complete", "chair", "report_published"),
        phase: "complete" as const,
      },
    ];
    for (const entry of finalEvents) {
      const dialogue = officeDialogue(entry, "ko");
      const frame = scene.update(snapshot, undefined, 0.05, {
        ...options,
        dialogue,
        speech: { speakerId: entry.agent, message: entry.summary.ko },
      });
      expect(scene.readyForDialogue(dialogue), entry.id).toBe(true);
      for (const [id, place] of Object.entries(FORUM_PLACES)) {
        const actor = frame.actors.find((actor) => actor.id === id);
        expect(actor).toMatchObject({ seated: true, position: place.position });
        expect(["walk", "stand", "sit"]).not.toContain(actor?.action);
      }
      expect(frame.speaker).toBe(entry.agent);
    }
  });

  it("keeps every central speaker visible when neighboring heads block the first bubble position", () => {
    const snapshot = officeSimulationSnapshot(
      createLiveOfficeFrame(1301).simulation,
    );
    const scene = new LiveOfficeScene();
    const dialogue = officeDialogue(
      event("forum-layout", "market", "department_ballot_committed"),
      "ko",
    );
    const frame = scene.update(snapshot, undefined, 0, {
      reducedMotion: true,
      paused: false,
      dialogue,
    });
    const viewport = { width: 710, height: 595 };
    const semantic = renderOfficeSnapshot({
      snapshot,
      viewport,
      locale: "ko",
      cameraMode: "overview",
    });
    for (const speaker of dialogue.participantIds) {
      const projection = {
        ...semantic,
        actors: semantic.actors.map((actor) => ({
          ...actor,
          world:
            frame.actors.find((physical) => physical.id === actor.id)
              ?.position ?? actor.world,
          bubble: {
            visible: actor.id === speaker,
            message:
              "기업의 성장성과 실적을 확인했습니다. 남아 있는 위험과 판단 조건을 최종 보고서에서 함께 검토합니다.",
          },
        })),
      };
      const layouts = layoutOfficeUi({
        projection,
        viewport,
        actorDisplayScale: 0.6,
        measureBubble: (message, size, width) =>
          measureOfficeBubble(
            message,
            size,
            width,
            (text) => [...text].length * size,
          ),
      });
      expect(
        layouts.find((layout) => layout.actorId === speaker)?.bubble.visible,
        speaker,
      ).toBe(true);
    }
  });

  it("sizes the bubble from exactly the lines painted, including long words", () => {
    const measure = (text: string) => [...text].length * 10;
    for (const message of [
      "짧은 문장",
      "현재 주가는 실적과 성장률을 확인하고 판단해야 합니다. 출처와 근거도 함께 확인했습니다.",
      "Supercalifragilisticexpialidocious".repeat(3),
    ]) {
      const layout = measureOfficeBubble(message, 10.5, 212, measure);
      expect(layout.height).toBe(layout.lines.length * layout.lineHeight + 16);
      expect(
        layout.lines.every((line) => measure(line) <= layout.width - 20),
      ).toBe(true);
      expect(layout.lines.join("").replaceAll(" ", "")).toBe(
        message.replaceAll(" ", ""),
      );
    }
  });
});
