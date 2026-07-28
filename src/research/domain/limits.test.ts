import { describe, expect, it } from "vitest";
import { assertNever } from "./ids";
import {
  allowedFollowUps,
  checkArtifactReplacement,
  checkCommandBodySize,
  checkDiskAdmission,
  checkLaunchBudget,
  checkQuestionLength,
  checkRunAdmission,
  type LimitOutcome,
  stageTimeoutSeconds,
} from "./limits";
import { LIMITS } from "./limits.constants";

function outcomeTag(value: LimitOutcome): string {
  switch (value.kind) {
    case "accepted":
      return "accepted";
    case "limit_exceeded":
      return value.limit;
    case "queue_full":
      return "queue_full";
    case "disk_low":
      return "disk_low";
    case "invalid_measurement":
      return "invalid_measurement";
    default:
      return assertNever(value);
  }
}

describe("local command and worker limits", () => {
  it("accepts a command body at 64 KiB and rejects one byte over", () => {
    expect(outcomeTag(checkCommandBodySize(64 * 1024))).toBe("accepted");
    expect(outcomeTag(checkCommandBodySize(64 * 1024 + 1))).toBe(
      "command_body_bytes",
    );
  });

  it("accepts a 4,000-character question and rejects an oversized one", () => {
    expect(outcomeTag(checkQuestionLength("q".repeat(4_000)))).toBe("accepted");
    expect(outcomeTag(checkQuestionLength("q".repeat(4_001)))).toBe(
      "question_chars",
    );
  });

  it("returns queue-full instead of inventing a run when active and queued slots are full", () => {
    expect(outcomeTag(checkRunAdmission(2, 7))).toBe("accepted");
    expect(outcomeTag(checkRunAdmission(2, 8))).toBe("queue_full");
    expect(outcomeTag(checkRunAdmission(3, 0))).toBe("queue_full");
  });

  it("rejects admission below the two-GiB free-disk floor", () => {
    expect(outcomeTag(checkDiskAdmission(2_147_483_648))).toBe("accepted");
    expect(outcomeTag(checkDiskAdmission(2_147_483_647))).toBe("disk_low");
  });

  it.each([
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])(
    "rejects invalid disk measurements before applying the floor (%s)",
    (availableBytes) => {
      expect(checkDiskAdmission(availableBytes)).toEqual({
        kind: "invalid_measurement",
        field: "disk_free_bytes",
        actual: availableBytes,
      });
    },
  );

  it("keeps the physical launch ceiling at the configured policy", () => {
    expect(outcomeTag(checkLaunchBudget(26, 3, 5))).toBe("accepted");
    expect(outcomeTag(checkLaunchBudget(26, 4, 5))).toBe("physical_launches");
    expect(allowedFollowUps(0)).toBe(3);
    expect(allowedFollowUps(5)).toBe(3);
    expect(LIMITS.research.maxPhysicalLaunches).toBe(34);
  });

  it("enforces 26 mandatory calls, optional ranges 0..3, replacements 0..5, and total <=34", () => {
    expect(outcomeTag(checkLaunchBudget(26, 0, 0))).toBe("accepted");
    expect(outcomeTag(checkLaunchBudget(26, 1, 2))).toBe("accepted");
    expect(outcomeTag(checkLaunchBudget(26, 3, 5))).toBe("accepted");
    expect(outcomeTag(checkLaunchBudget(25, 0, 0))).toBe("mandatory_calls");
    expect(outcomeTag(checkLaunchBudget(26, 4, 0))).toBe("physical_launches");
    expect(outcomeTag(checkLaunchBudget(26, 0, 6))).toBe("physical_launches");
  });

  it.each([
    [-1, 0, 0],
    [0.5, 0, 0],
    [Number.NaN, 0, 0],
  ])(
    "rejects invalid launch counts (%s)",
    (mandatory, followUps, replacements) => {
      expect(
        outcomeTag(checkLaunchBudget(mandatory, followUps, replacements)),
      ).toBe("invalid_measurement");
    },
  );

  it("rejects invalid admission and command measurements", () => {
    expect(outcomeTag(checkRunAdmission(-1, 0))).toBe("invalid_measurement");
    expect(outcomeTag(checkRunAdmission(0, 1.5))).toBe("invalid_measurement");
    expect(outcomeTag(checkCommandBodySize(Number.NaN))).toBe(
      "invalid_measurement",
    );
    expect(outcomeTag(checkCommandBodySize(-1))).toBe("invalid_measurement");
  });

  it("allows exactly one replacement per logical artifact", () => {
    expect(outcomeTag(checkArtifactReplacement(0))).toBe("accepted");
    expect(outcomeTag(checkArtifactReplacement(1))).toBe(
      "replacement_per_artifact",
    );
  });

  it("exposes every locked stage timeout through an exhaustive stage union", () => {
    expect(stageTimeoutSeconds("specialist")).toBe(360);
    expect(stageTimeoutSeconds("department")).toBe(300);
    expect(stageTimeoutSeconds("challenge")).toBe(300);
    expect(stageTimeoutSeconds("response")).toBe(300);
    expect(stageTimeoutSeconds("follow_up")).toBe(300);
    expect(stageTimeoutSeconds("semantic_audit")).toBe(360);
    expect(stageTimeoutSeconds("chair")).toBe(480);
    expect(stageTimeoutSeconds("question")).toBe(90);
  });
});
