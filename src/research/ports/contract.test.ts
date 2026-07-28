import { describe, expect, it } from "vitest";
import { verifyResearchPortContracts } from "./test/contractHarness";
import { createStrictTestPorts } from "./test/strictFakes";

describe("research dependency-inversion ports", () => {
  it("runs the store, source, artifact, clock, capacity, Codex, cancellation, and notifier contracts against strict test fakes", async () => {
    // Given
    const ports = createStrictTestPorts();

    // When
    const receipt = await verifyResearchPortContracts(ports);

    // Then
    expect(receipt).toEqual({ passed: true, scenarios: 14 });
  });
});
