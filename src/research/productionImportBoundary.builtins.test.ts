import type { Dirent } from "node:fs";
import {
  mkdtemp as makeTemporaryDirectory,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectImportBoundary } from "./productionImportBoundary";

const temporaryRoots: string[] = [];

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    const path = temporaryRoots.pop();
    if (path) await rm(path, { recursive: true, force: true });
  }
});

async function mkdtemp(): Promise<string> {
  const path = await makeTemporaryDirectory(
    join(tmpdir(), "stocksembly-boundary-builtins-"),
  );
  temporaryRoots.push(path);
  return path;
}

async function sourceFilesIn(directory: string): Promise<readonly string[]> {
  let entries: readonly Dirent<string>[];
  try {
    entries = await readdir(directory, {
      encoding: "utf8",
      withFileTypes: true,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFilesIn(path)));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
      files.push(path);
  }
  return files;
}

async function productionRoots(): Promise<readonly string[]> {
  const components = (await sourceFilesIn("src/components/research")).filter(
    (path) => !path.includes(".test."),
  );
  const apiRoutes = await sourceFilesIn("app/api");
  return [
    "app/research/[symbol]/page.tsx",
    "app/research-fixture/[symbol]/page.tsx",
    "app/showcase/office-calibration/page.tsx",
    "src/research/compositions/fixture.ts",
    "src/research/compositions/official.ts",
    "src/research/compositions/calibration.ts",
    ...components,
    ...apiRoutes,
  ];
}

async function writeGraph(
  root: string,
  target: string,
  targetPath: string,
): Promise<void> {
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@/*": ["src/*"] } } }),
  );
  await writeFile(
    join(root, "entry.ts"),
    [
      'import "@/neutral";',
      'const required = require("@/neutralRequire");',
      'void import("@/neutralDynamic");',
      "void required;",
    ].join("\n"),
  );
  for (const helper of ["neutral", "neutralRequire", "neutralDynamic"]) {
    await writeFile(
      join(root, `src/${helper}.ts`),
      `export { value } from "${target}";\n`,
    );
  }
  await writeFile(join(root, targetPath), "export const value = 1;\n");
}

describe("built-in official import classifications", () => {
  it("rejects fixture playback reached through neutral alias, require, and dynamic helpers", async () => {
    const root = await mkdtemp();
    await mkdir(join(root, "src/research/compositions"), { recursive: true });
    await writeGraph(
      root,
      "./research/compositions/fixturePlayback",
      "src/research/compositions/fixturePlayback.ts",
    );
    const report = await inspectImportBoundary({
      rootDir: root,
      tsconfigPath: join(root, "tsconfig.json"),
      roots: ["entry.ts"],
    });
    expect(
      report.violations.filter((violation) =>
        violation.includes("BUILTIN_FIXTURE_MODULE"),
      ),
    ).toHaveLength(4);
  });

  it("rejects test modules reached through neutral alias, require, and dynamic helpers", async () => {
    const root = await mkdtemp();
    await mkdir(join(root, "src"), { recursive: true });
    await writeGraph(
      root,
      "./research-helper.test",
      "src/research-helper.test.ts",
    );
    const report = await inspectImportBoundary({
      rootDir: root,
      tsconfigPath: join(root, "tsconfig.json"),
      roots: ["entry.ts"],
    });
    expect(
      report.violations.filter((violation) =>
        violation.includes("BUILTIN_TEST_MODULE"),
      ),
    ).toHaveLength(4);
  });

  it("keeps calibration imports explicit to the calibration showcase scope", async () => {
    const root = await mkdtemp();
    await mkdir(join(root, "app/showcase/office-calibration"), {
      recursive: true,
    });
    await writeFile(join(root, "tsconfig.json"), "{}");
    await writeFile(
      join(root, "app/showcase/office-calibration/page.ts"),
      'import { value } from "./calibration";\nvoid value;\n',
    );
    await writeFile(
      join(root, "app/showcase/office-calibration/calibration.ts"),
      "export const value = 1;\n",
    );
    const calibrationReport = await inspectImportBoundary({
      rootDir: root,
      tsconfigPath: join(root, "tsconfig.json"),
      roots: ["app/showcase/office-calibration/page.ts"],
      scope: "calibration",
    });
    expect(calibrationReport.violations).toEqual([]);
    const officialReport = await inspectImportBoundary({
      rootDir: root,
      tsconfigPath: join(root, "tsconfig.json"),
      roots: ["app/showcase/office-calibration/page.ts"],
      scope: "official",
    });
    expect(officialReport.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("BUILTIN_CALIBRATION_MODULE_OUTSIDE_SHOWCASE"),
      ]),
    );
    const officialRootReport = await inspectImportBoundary({
      rootDir: root,
      tsconfigPath: join(root, "tsconfig.json"),
      roots: ["app/showcase/office-calibration/calibration.ts"],
      scope: "official",
    });
    expect(officialRootReport.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("BUILTIN_CALIBRATION_MODULE_OUTSIDE_SHOWCASE"),
      ]),
    );
  });

  it("keeps attestation minting behind the composition construction importer allowlist", async () => {
    const allowedRoots = new Set([
      "app/research/[symbol]/page.tsx",
      "app/research-fixture/[symbol]/page.tsx",
      "src/research/compositions/fixture.ts",
      "src/research/compositions/official.ts",
      "src/research/compositions/calibration.ts",
    ]);
    const observedAllowedReachability: string[] = [];
    const unexpectedReachability: string[] = [];
    for (const root of await productionRoots()) {
      const report = await inspectImportBoundary({
        roots: [root],
        forbiddenSegments: ["compositions/internal"],
        scope: "calibration",
      });
      if (report.violations.length === 0) continue;
      if (allowedRoots.has(root)) observedAllowedReachability.push(root);
      else unexpectedReachability.push(...report.violations);
    }
    expect(observedAllowedReachability).toEqual(
      expect.arrayContaining([
        "app/research/[symbol]/page.tsx",
        "app/research-fixture/[symbol]/page.tsx",
        "src/research/compositions/fixture.ts",
        "src/research/compositions/official.ts",
      ]),
    );
    expect(unexpectedReachability).toEqual([]);
  });

  it("rejects the restricted attestation surface through neutral alias, require, and dynamic helpers", async () => {
    const root = await mkdtemp();
    await mkdir(join(root, "src/research/compositions"), {
      recursive: true,
    });
    await writeGraph(
      root,
      "./research/compositions/internal",
      "src/research/compositions/internal.ts",
    );
    const report = await inspectImportBoundary({
      rootDir: root,
      tsconfigPath: join(root, "tsconfig.json"),
      roots: ["entry.ts"],
      forbiddenSegments: ["compositions/internal"],
      scope: "calibration",
    });
    expect(report.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining("src/neutral.ts"),
        expect.stringContaining("src/neutralRequire.ts"),
        expect.stringContaining("src/neutralDynamic.ts"),
        expect.stringContaining("src/research/compositions/internal.ts"),
      ]),
    );
  });
});
