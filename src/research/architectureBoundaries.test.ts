import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectResearchArchitecture,
  ResearchArchitectureError,
} from "./ports/test/architectureInspector";

type AdversarialFixture = {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly violation: string;
};

const temporaryRoots: string[] = [];

async function createProject(
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "research-architecture-"));
  temporaryRoots.push(root);
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }),
  );
  for (const [path, source] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, source);
  }
  return root;
}

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

const adversarialFixtures = [
  {
    name: "official composition constructs an aliased test fake",
    files: {
      "src/research/compositions/official.ts":
        'import "@/src/research/officialBridge";\n',
      "src/research/officialBridge.ts":
        'import { StrictStoreFake as Store } from "@/src/research/ports/test/strictFakes";\nexport const store = new Store();\n',
      "src/research/ports/test/strictFakes.ts":
        "export class StrictStoreFake {}\n",
    },
    violation: "OFFICIAL_TEST_FAKE_CONSTRUCTION",
  },
  {
    name: "client reaches a server adapter through a transitive alias",
    files: {
      "src/research/client.ts":
        '"use client";\nimport "@/src/research/clientBridge";\n',
      "src/research/clientBridge.ts":
        'import "@/src/research/server/sqliteAdapter";\n',
      "src/research/server/sqliteAdapter.ts": "export const adapter = 1;\n",
    },
    violation: "CLIENT_SERVER_ADAPTER_IMPORT",
  },
  {
    name: "domain reaches framework, filesystem, SQL, and CLI dependencies transitively",
    files: {
      "src/research/domain/model.ts": 'import "@/src/research/domainBridge";\n',
      "src/research/domainBridge.ts":
        'import "next";\nimport "node:fs";\nimport "better-sqlite3";\nimport "commander";\n',
    },
    violation: "DOMAIN_INFRASTRUCTURE_IMPORT",
  },
  {
    name: "domain imports the bare fs Node builtin",
    files: {
      "src/research/domain/model.ts": 'import "fs";\n',
    },
    violation: "DOMAIN_INFRASTRUCTURE_IMPORT",
  },
  {
    name: "domain imports the bare fs/promises Node builtin",
    files: {
      "src/research/domain/model.ts": 'import "fs/promises";\n',
    },
    violation: "DOMAIN_INFRASTRUCTURE_IMPORT",
  },
  {
    name: "adapter calls a transitively re-exported aliased workflow transition",
    files: {
      "src/research/adapters/sqlite.ts":
        'import { apply } from "../sharedTransition";\napply();\n',
      "src/research/sharedTransition.ts":
        'export { transitionRun as apply } from "./domain/runStateTransitions";\n',
      "src/research/domain/runStateTransitions.ts":
        "export const transitionRun = () => undefined;\n",
    },
    violation: "ADAPTER_WORKFLOW_TRANSITION",
  },
  {
    name: "application calls a transitively re-exported aliased Codex runtime",
    files: {
      "src/research/application/run.ts":
        'import { runtime } from "../sharedCodex";\nruntime.run();\n',
      "src/research/sharedCodex.ts":
        'export { codexRunner as runtime } from "./ports/runtime";\n',
      "src/research/ports/runtime.ts":
        "export const codexRunner = { async run() {} };\n",
    },
    violation: "CODEX_CALLER_OUTSIDE_WORKER",
  },
  {
    name: "application implements an aliased Codex runner port",
    files: {
      "src/research/application/run.ts":
        'import type { CodexRunnerPort as Runner } from "../ports/runtime";\nexport class LocalRunner implements Runner { async run() {} }\n',
      "src/research/ports/runtime.ts":
        "export interface CodexRunnerPort { readonly run: () => Promise<void>; }\n",
    },
    violation: "CODEX_CALLER_OUTSIDE_WORKER",
  },
] as const satisfies readonly AdversarialFixture[];

describe("live research architecture boundaries", () => {
  it("keeps production layers and official composition inside their dependency boundaries", async () => {
    // Given
    const rootDir = process.cwd();

    // When
    const report = await inspectResearchArchitecture({ rootDir });

    // Then
    expect(report.violations).toEqual([]);
  });

  it("fails closed when a required architecture root is missing", async () => {
    // Given
    const rootDir = process.cwd();

    // When / Then
    await expect(
      inspectResearchArchitecture({
        rootDir,
        requiredRoots: ["src/research/definitely-missing"],
      }),
    ).rejects.toBeInstanceOf(ResearchArchitectureError);
  });

  it.each(adversarialFixtures)("rejects $name", async (fixture) => {
    // Given
    const rootDir = await createProject(fixture.files);

    // When
    const report = await inspectResearchArchitecture({ rootDir });

    // Then
    expect(report.violations).toEqual(
      expect.arrayContaining([expect.stringContaining(fixture.violation)]),
    );
  });

  it("allows a type-only Codex port dependency and token comments", async () => {
    // Given
    const rootDir = await createProject({
      "src/research/application/types.ts":
        'import type { CodexRunnerPort as Runner } from "../ports/runtime";\nexport type RunnerDependency = Runner;\n// codex.run() is not executable.\n',
      "src/research/ports/runtime.ts":
        "export interface CodexRunnerPort { readonly run: () => Promise<void>; }\n",
    });

    // When
    const report = await inspectResearchArchitecture({ rootDir });

    // Then
    expect(report.violations).toEqual([]);
  });

  it("allows adapter transition tokens in comments and type positions", async () => {
    // Given
    const rootDir = await createProject({
      "src/research/adapters/sqlite.ts":
        "export type TransitionShape = { readonly transitionRun: string };\n// transitionJob is application-owned.\n",
    });

    // When
    const report = await inspectResearchArchitecture({ rootDir });

    // Then
    expect(report.violations).toEqual([]);
  });
});
