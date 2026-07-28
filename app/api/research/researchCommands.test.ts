import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerResearchCancellationCommandTests } from "./researchCommandsCancellation.testCases";
import { registerResearchQuestionCommandTests } from "./researchCommandsQuestion.testCases";
import { registerResearchQuestionWorkerTests } from "./researchCommandsQuestionWorker.testCases";
import { registerResearchRunCommandTests } from "./researchCommandsRun.testCases";
import {
  type ApiHarness,
  createApiHarness,
  createRunRequest,
  json,
} from "./researchRoutes.testSupport";

describe("research command routes", () => {
  let harness: ApiHarness | undefined;

  beforeEach(async () => {
    harness = await createApiHarness();
  });

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  const currentHarness = (): ApiHarness => {
    if (harness === undefined)
      throw new TypeError("command harness is unavailable");
    return harness;
  };

  registerResearchCancellationCommandTests(currentHarness);
  registerResearchRunCommandTests(currentHarness);
  registerResearchQuestionCommandTests(currentHarness);
  registerResearchQuestionWorkerTests(currentHarness);

  it("cancels an admitted run through the authenticated command surface", async () => {
    // Given
    const activeHarness = currentHarness();
    const created = await activeHarness.api.handle(
      createRunRequest(activeHarness, "cancel-red"),
    );
    const createdBody = (await json(created)) as {
      readonly run: { readonly runId: string };
    };

    // When
    const response = await activeHarness.api.handle(
      activeHarness.request(
        `/api/research/runs/${createdBody.run.runId}/cancel`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "cancel-command-red",
            origin: activeHarness.allowedOrigin,
          },
          body: "{}",
        },
      ),
    );

    // Then
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      run: { runId: createdBody.run.runId, status: "cancelled" },
    });
  });
});
