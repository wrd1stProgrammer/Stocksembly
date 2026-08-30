import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  evaluateResearchQuality,
  type ResearchQualityFixture,
  ResearchQualityFixtureSchema,
} from "../domain/researchQualityEvaluator";

type Options = {
  readonly fixturePaths: readonly string[];
  readonly outputBase?: string;
  readonly assertEmbeddedExpectations: boolean;
};

class CliUsageError extends Error {}

function parseOptions(args: readonly string[]): Options {
  const fixturePaths: string[] = [];
  let outputBase: string | undefined;
  let assertEmbeddedExpectations = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
    } else if (argument === "--fixture") {
      const value = args[index + 1];
      if (value === undefined)
        throw new CliUsageError("--fixture requires a path");
      fixturePaths.push(value);
      index += 1;
    } else if (argument === "--fixtures") {
      let next = index + 1;
      while (next < args.length && !args[next]?.startsWith("--")) {
        const value = args[next];
        if (value !== undefined) fixturePaths.push(value);
        next += 1;
      }
      index = next - 1;
    } else if (argument === "--output") {
      outputBase = args[index + 1];
      if (outputBase === undefined)
        throw new CliUsageError("--output requires a path");
      index += 1;
    } else if (argument === "--assert-embedded-expectations") {
      assertEmbeddedExpectations = true;
    } else {
      throw new CliUsageError(`unknown argument: ${argument}`);
    }
  }
  if (fixturePaths.length === 0)
    fixturePaths.push(
      "src/research/testFixtures/quality/qualified-peer-profitable-tech.green.json",
      "src/research/testFixtures/quality/capital-intensive-auto.green.json",
      "src/research/testFixtures/quality/loss-making-biotech.green.json",
      "src/research/testFixtures/quality/financial-institution.green.json",
      "src/research/testFixtures/quality/sparse-no-valid-peer.green.json",
    );
  return {
    fixturePaths,
    ...(outputBase === undefined ? {} : { outputBase }),
    assertEmbeddedExpectations,
  };
}

function exactExpectationsMatch(
  fixture: ResearchQualityFixture,
  result: ReturnType<typeof evaluateResearchQuality>,
): boolean {
  return (
    JSON.stringify(result.fatalReasons) ===
      JSON.stringify(fixture.expectedFatalReasons) &&
    JSON.stringify(result.scoreComponents) ===
      JSON.stringify(fixture.expectedScoreComponents) &&
    result.runtimeDisposition === fixture.expectedRuntimeDisposition
  );
}

const options = parseOptions(process.argv.slice(2));
const reports = await Promise.all(
  options.fixturePaths.map(async (fixturePath) => {
    const fixture = ResearchQualityFixtureSchema.parse(
      JSON.parse(await readFile(path.resolve(fixturePath), "utf8")),
    );
    const result = evaluateResearchQuality(fixture);
    const expectationsMatch = exactExpectationsMatch(fixture, result);
    return {
      fixture: fixturePath,
      id: fixture.id,
      expectationsMatch,
      ...result,
    };
  }),
);
const passed = options.assertEmbeddedExpectations
  ? reports.every((report) => report.expectationsMatch)
  : reports.every(
      (report) =>
        report.expectationsMatch &&
        report.fatalReasons.length === 0 &&
        report.totalScore >= 8,
    );
const output = {
  schemaVersion: 1,
  mode: options.assertEmbeddedExpectations
    ? "assert_embedded_expectations"
    : "gate",
  passed,
  thresholds: { minimumSecondaryScore: 8, maximumWaitPostures: 1 },
  reports,
};
if (options.outputBase !== undefined) {
  const base = path.resolve(options.outputBase);
  await mkdir(path.dirname(base), { recursive: true });
  await writeFile(
    `${base}.json`,
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
  const markdown = [
    "# Research quality gate",
    "",
    `- Mode: ${output.mode}`,
    `- Passed: ${passed}`,
    `- Minimum secondary score: ${output.thresholds.minimumSecondaryScore}`,
    "",
    "| Fixture | Score | Reasons | Disposition | Expectations |",
    "| --- | ---: | --- | --- | --- |",
    ...reports.map(
      (report) =>
        `| ${report.id} | ${report.totalScore.toFixed(2)} | ${report.fatalReasons.join(", ") || "none"} | ${report.runtimeDisposition} | ${report.expectationsMatch ? "match" : "mismatch"} |`,
    ),
    "",
    "## Predicate outcomes and component points",
    "",
    "```json",
    JSON.stringify(
      reports.map(({ id, predicates, scoreComponents }) => ({
        id,
        predicates,
        scoreComponents,
      })),
      null,
      2,
    ),
    "```",
    "",
  ].join("\n");
  await writeFile(`${base}.md`, markdown, "utf8");
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (!passed) process.exitCode = 1;
