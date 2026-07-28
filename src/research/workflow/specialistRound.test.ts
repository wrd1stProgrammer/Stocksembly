import { describe, expect, it } from "vitest";
import { assignAllAgents } from "../application/assignAllAgents";
import {
  makeAssignmentHarness,
  requireAssignments,
} from "../application/createMandate.testSupport";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { ValueRecordSchema } from "../domain/valueRegistry";
import {
  runSpecialistRound,
  type SpecialistJobRequest,
} from "./specialistRound";
import {
  candidateFor,
  makeRoundFaultHarness,
  SPECIALIST_FAULTS,
} from "./specialistRound.testSupport";
import { specialistRequest } from "./specialistRoundInput";

describe("specialist round", () => {
  it("keeps a balanced recent financial history instead of one oversized metric tail", async () => {
    // Given
    const harness = await makeAssignmentHarness({ scope: "broad" });
    const assignments = requireAssignments(
      await assignAllAgents(harness.input, harness.repository),
    );
    const financial = assignments.assignments.find(
      (assignment) => assignment.roleId === "financial",
    );
    if (financial === undefined)
      throw new TypeError("missing financial assignment");
    const records = ["revenue", "operating_margin"].flatMap((metric) =>
      Array.from({ length: 10 }, (_, index) =>
        ValueRecordSchema.parse({
          kind: "value_record",
          valueId: `${metric}:${index}`,
          runId: harness.snapshot.runId,
          snapshotId: harness.snapshot.snapshotId,
          metric,
          value: String(index + 1),
          unit: metric === "revenue" ? "USD" : "percent",
          source: "sec_company_facts",
          accession: "0000000000-26-000001",
          form: "10-K",
          filedAt: "2026-01-20T00:00:00.000Z",
          acceptedAt: "2026-01-20T00:01:00.000Z",
          period: `2025-Q${(index % 4) + 1}-${index}`,
          evidenceCutoffAt: harness.snapshot.evidenceCutoffAt,
          parentValueIds: [],
          parentHashes: [],
          hash: String(index).padStart(64, "a").slice(-64),
        }),
      ),
    );

    // When
    const request = specialistRequest(
      {
        mandate: harness.input.mandate,
        snapshot: {
          ...harness.snapshot,
          valueRegistry: {
            ...harness.snapshot.valueRegistry,
            records,
          },
        },
        assignments,
      },
      financial,
      { ordinal: 1, purpose: "mandatory_first" },
    );

    // Then
    const counts: Record<string, number> = {};
    for (const value of request.registeredValues)
      counts[value.metric] = (counts[value.metric] ?? 0) + 1;
    expect(counts).toEqual({ revenue: 6, operating_margin: 6 });
  });

  it("commits ten isolated role jobs from one snapshot with global concurrency three before public events", async () => {
    // Given
    const harness = await makeAssignmentHarness({ scope: "broad" });
    const assignments = requireAssignments(
      await assignAllAgents(harness.input, harness.repository),
    );
    const requests: SpecialistJobRequest[] = [];
    const lifecycle: string[] = [];
    let active = 0;
    let maximumActive = 0;

    // When
    const result = await runSpecialistRound(
      {
        mandate: harness.input.mandate,
        snapshot: harness.snapshot,
        assignments,
      },
      {
        runner: {
          run: async (request) => {
            requests.push(request);
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            await Promise.resolve();
            active -= 1;
            return {
              kind: "succeeded",
              output: JSON.stringify(candidateFor(request)),
            };
          },
        },
        committer: {
          commit: async (input) => {
            lifecycle.push(`commit:${input.roleId}`);
            return {
              kind: "committed",
              artifactHash: input.candidateHash,
              receiptHash: input.receiptHash,
            };
          },
        },
        publicEvents: {
          append: async (event) => {
            lifecycle.push(`event:${event.roleId}`);
          },
        },
      },
    );

    // Then
    expect(result.kind).toBe("complete");
    expect(result.departmentStartAllowed).toBe(true);
    expect(result.acceptedMemos.map((memo) => memo.roleId)).toEqual(
      WORKFLOW_V1_SPECIALIST_IDS,
    );
    expect(
      new Set(result.receipts.map((receipt) => receipt.receiptHash)).size,
    ).toBe(10);
    expect(
      new Set(result.acceptedMemos.map((memo) => memo.artifactHash)).size,
    ).toBe(10);
    expect(maximumActive).toBe(3);
    expect(requests).toHaveLength(10);
    for (const [index, request] of requests.entries()) {
      const assignment = assignments.assignments.find(
        (item) => item.roleId === request.role.id,
      );
      if (assignment === undefined) throw new TypeError("missing assignment");
      expect(request.snapshotId).toBe(harness.snapshot.snapshotId);
      expect(request.evidenceCutoffAt).toBe(harness.snapshot.evidenceCutoffAt);
      expect(request.promptName).toBe(
        `specialist_memo_prompt_v1:${request.role.id}`,
      );
      expect(request.schemaName).toBe(`specialist_memo_v1:${request.role.id}`);
      expect(request.evidenceSlice).toEqual(assignment.evidenceSlice);
      expect(Object.keys(request).sort()).toEqual([
        "attempt",
        "capabilityStatement",
        "evidenceCutoffAt",
        "evidenceSlice",
        "ids",
        "mandate",
        "promptName",
        "registeredValues",
        "role",
        "schemaName",
        "snapshotId",
      ]);
      expect(lifecycle.indexOf(`commit:${request.role.id}`)).toBeLessThan(
        lifecycle.indexOf(`event:${request.role.id}`),
      );
      expect(result.receipts[index]?.ordinal).toBe(index + 1);
    }
  });

  it.each(SPECIALIST_FAULTS)(
    "burns the %s attempt and accepts one bounded replacement",
    async (fault) => {
      // Given
      const harness = await makeRoundFaultHarness(fault);

      // When
      const result = await runSpecialistRound(
        harness.input,
        harness.dependencies,
      );

      // Then
      expect(result.kind).toBe("complete");
      expect(result.departmentStartAllowed).toBe(true);
      expect(result.acceptedMemos).toHaveLength(10);
      expect(result.receipts).toHaveLength(11);
      expect(result.receipts[1]?.outcome).toBe(
        fault === "timeout" ? "timed_out" : "invalid",
      );
      expect(result.receipts[1]?.ordinal).toBe(2);
      expect(result.receipts[10]?.ordinal).toBe(11);
      expect(result.receipts[10]?.outcome).toBe("accepted");
      expect(harness.requests[10]?.attempt.purpose).toBe(
        "required_replacement",
      );
      expect(
        harness.lifecycle.filter((item) => item.startsWith("event:")),
      ).toHaveLength(10);
    },
  );

  it("remains incomplete and blocks department start when the bounded replacement also fails", async () => {
    // Given
    const harness = await makeRoundFaultHarness("invalid_json", true);

    // When
    const result = await runSpecialistRound(
      harness.input,
      harness.dependencies,
    );

    // Then
    expect(result.kind).toBe("incomplete");
    expect(result.departmentStartAllowed).toBe(false);
    expect(result.missingRoleIds).toEqual(["market_news"]);
    expect(result.receipts.map((receipt) => receipt.ordinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(result.receipts[1]?.outcome).toBe("invalid");
    expect(result.receipts[10]?.outcome).toBe("invalid");
    expect(harness.lifecycle.some((item) => item.startsWith("event:"))).toBe(
      false,
    );
  });
});
