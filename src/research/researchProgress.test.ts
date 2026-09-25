import { describe, expect, it } from "vitest";
import { researchProgressCopy } from "../lib/researchProgressCopy";
import { locales } from "../lib/supportedLocales";
import { appendPublicEvent } from "./client/projection";
import { detail, publicEvent } from "./client/useResearchRun.testSupport";
import { researchProgress } from "./researchProgress";

describe("research progress from server truth", () => {
  it("advances from streamed milestones and waits for publication to finish", () => {
    let snapshot = detail(0);
    const milestones = [
      "collection_started",
      "mandate_sealed",
      "department_consolidation_committed",
      "semantic_audit_committed",
      "chair_synthesis_committed",
      "report_published",
    ] as const;
    milestones.forEach((kind, index) => {
      snapshot = appendPublicEvent(snapshot, publicEvent(index + 1, kind));
      expect(researchProgress(snapshot, "live")).toMatchObject({
        index: Math.min(index, 4),
        published: index === 5,
      });
    });
  });
  it("uses active work before its completion event and ignores delayed earlier activities", () => {
    expect(
      researchProgress(
        {
          ...detail(),
          activeActivities: [{ actorId: "chair", activity: "semantic_audit" }],
        },
        "live",
      ).index,
    ).toBe(3);
    expect(
      researchProgress(
        {
          ...detail(),
          events: [publicEvent(8, "gathering_started")],
          activeActivities: [{ actorId: "market", activity: "macro_analysis" }],
        },
        "live",
      ).index,
    ).toBe(4);
  });
  it("restores stage on reconnect without pretending work is currently confirmed", () => {
    const snapshot = {
      ...detail(),
      events: [
        publicEvent(8, "semantic_audit_committed"),
        publicEvent(9, "runtime_status"),
      ],
    };
    expect(researchProgress(snapshot, "connection-interrupted")).toMatchObject({
      index: 3,
      status: "reconnecting",
      published: false,
    });
    expect(researchProgress(snapshot, "live").status).toBe("working");
  });
  it.each([
    "queued",
    "cancelling",
    "cancelled",
    "failed",
    "incomplete",
  ] as const)("preserves %s without false publication", (status) => {
    expect(
      researchProgress(
        {
          ...detail(12, status),
          events: [publicEvent(12, "chair_synthesis_committed")],
        },
        "live",
      ),
    ).toMatchObject({ index: 4, status, published: false });
  });
  it.each(["completed", "complete-with-limitations"] as const)(
    "recognizes %s even after returning to a disconnected tab",
    (status) => {
      expect(
        researchProgress(detail(12, status), "connection-interrupted"),
      ).toMatchObject({ index: 4, status: "published", published: true });
    },
  );
  it("has every nonempty key in every supported language", () => {
    for (const locale of locales) {
      expect(Object.keys(researchProgressCopy[locale])).toEqual(
        Object.keys(researchProgressCopy.en),
      );
      expect(
        Object.values(researchProgressCopy[locale]).every(
          (value) => value.trim().length > 0,
        ),
      ).toBe(true);
    }
  });
});
