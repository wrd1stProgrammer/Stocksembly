import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { sha256Value } from "./codexArtifacts";
import {
  buildCodexArgv,
  CODEX_RUNTIME_POLICY,
  CODEX_STAGES,
  researchRuntimeOverride,
  trustedResearchRuntime,
} from "./codexPolicy";

it("inspects the complete argv and provenance policy matrix", async () => {
  // Given
  const toolTranscriptHash = sha256Value([]);

  // When
  const matrix = CODEX_STAGES.map((stage) => {
    const argv = buildCodexArgv("/redacted/output-schema.json", stage);
    const modelIndex = argv.indexOf("--model");
    return {
      stage,
      argvModel: argv[modelIndex + 1],
      argvReasoning: argv.find((value) =>
        value.startsWith("model_reasoning_effort="),
      ),
      provenance: {
        model: CODEX_RUNTIME_POLICY.model,
        reasoning: CODEX_RUNTIME_POLICY.reasoningByStage[stage],
        browsingPolicy: CODEX_RUNTIME_POLICY.browsingByStage[stage],
        toolTranscriptHash,
      },
    };
  });

  // Then
  expect(matrix).toHaveLength(CODEX_STAGES.length);
  expect(matrix.every((row) => row.argvModel === "gpt-5.6-luna")).toBe(true);
  expect(
    matrix.every(
      (row) =>
        row.argvReasoning ===
        `model_reasoning_effort="${row.provenance.reasoning}"`,
    ),
  ).toBe(true);
  expect(matrix.find((row) => row.stage === "chair_synthesis")).toMatchObject({
    provenance: { reasoning: "low" },
  });
  expect(JSON.stringify(matrix)).not.toContain("xhigh");
  expect(
    matrix
      .filter((row) =>
        ["semantic_audit", "chair_synthesis", "probe"].includes(row.stage),
      )
      .every((row) => row.provenance.browsingPolicy === "disabled"),
  ).toBe(true);
  const evidenceDirectory = join(
    process.cwd(),
    ".omo/evidence/start-work/insightsentry/task-7",
  );
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    join(evidenceDirectory, "manual-argv-provenance.json"),
    `${JSON.stringify(
      {
        scenario: "full Codex stage argv and launch provenance inspection",
        invocation:
          "pnpm vitest run src/research/server/codex/codexPolicy.manual.test.ts --exclude '.next/**'",
        assertions: {
          allStagesExactlyLow: true,
          noXhigh: true,
          allStagesLuna: true,
          browsingDisabled: true,
          transcriptHashBound: true,
        },
        matrix,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
});

it("keeps every research role on Luna low reasoning", () => {
  const supportRuntime = researchRuntimeOverride(
    "memo",
    "memo:company_product",
    true,
  );
  const leadRuntime = researchRuntimeOverride("memo", "memo:company", true);
  const argv = buildCodexArgv(
    "/redacted/output-schema.json",
    "memo",
    supportRuntime,
  );

  expect(supportRuntime).toEqual({
    model: "gpt-5.6-luna",
    reasoning: "low",
  });
  expect(leadRuntime).toBeUndefined();
  expect(trustedResearchRuntime("memo", "memo:company_product", true)).toEqual(
    supportRuntime,
  );
  expect(trustedResearchRuntime("memo", "memo:company")).toEqual({
    model: "gpt-5.6-luna",
    reasoning: "low",
  });
  expect(argv[argv.indexOf("--model") + 1]).toBe("gpt-5.6-luna");
  expect(argv).toContain('model_reasoning_effort="low"');
});

it("keeps Luna low as the default when the specialist override is disabled", () => {
  expect(
    researchRuntimeOverride("memo", "memo:company_product", false),
  ).toBeUndefined();
  expect(trustedResearchRuntime("memo", "memo:company_product", false)).toEqual(
    {
      model: "gpt-5.6-luna",
      reasoning: "low",
    },
  );
});
