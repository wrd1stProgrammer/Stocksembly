import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectImportBoundary } from "../productionImportBoundary";
import type * as publicCapabilities from "./capabilities";
import { admitFixtureSecurityIdentity } from "./securityIdentity.test-support";

const expectedPublicRuntimeExports = [
  "CAPABILITY_KEYS",
  "CAPABILITY_SOURCES",
  "serializeCapabilityDisclosures",
] as const;
type PublicRuntimeExports = keyof typeof publicCapabilities;
type UnexpectedPublicRuntimeExports = Exclude<
  PublicRuntimeExports,
  (typeof expectedPublicRuntimeExports)[number]
>;
type MissingPublicRuntimeExports = Exclude<
  (typeof expectedPublicRuntimeExports)[number],
  PublicRuntimeExports
>;
const publicExportAllowlistIsExact: [
  UnexpectedPublicRuntimeExports,
  MissingPublicRuntimeExports,
] extends [never, never]
  ? true
  : false = true;

async function sourceFilesIn(directory: string): Promise<readonly string[]> {
  const entries: readonly Dirent<string>[] = await readdir(directory, {
    encoding: "utf8",
    withFileTypes: true,
  });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFilesIn(path)));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
      files.push(path);
  }
  return files;
}

describe("capability public API boundary", () => {
  it("keeps the exact runtime export allowlist", async () => {
    expect(publicExportAllowlistIsExact).toBe(true);
    const publicCapabilities = await import("./capabilities");
    expect(Object.keys(publicCapabilities).sort()).toEqual(
      [...expectedPublicRuntimeExports].sort(),
    );
  });

  it("cannot mint any availability from a genuine identity through the public module", async () => {
    const admission = admitFixtureSecurityIdentity({
      submittedSymbol: "NVDA",
      tickerExchangeRows: [
        { symbol: "NVDA", cik: "1045810", exchange: "Nasdaq" },
      ],
      filingForms: [
        { form: "10-K", cik: "1045810" },
        { form: "10-Q", cik: "1045810" },
        { form: "8-K", cik: "1045810" },
      ],
      coverPages: [
        {
          form: "10-K",
          tradingSymbol: "NVDA",
          cik: "1045810",
          securityExchangeName: "Nasdaq",
          security12bTitle: "Common Stock",
        },
      ],
    });
    expect(admission.kind).toBe("admitted");
    if (admission.kind !== "admitted") return;
    expect(admission.identity.ticker).toBe("NVDA");
    const publicCapabilities = await import("./capabilities");
    for (const availability of [
      "available",
      "stale",
      "unavailable",
      "withheld_by_rights",
    ]) {
      expect(
        Reflect.get(
          publicCapabilities,
          `create${availability}CapabilityDisclosure`,
        ),
      ).toBeUndefined();
    }
    expect(
      Reflect.get(publicCapabilities, "createCapabilityDisclosureForIdentity"),
    ).toBeUndefined();
  });

  it("keeps the restricted internal mint out of client, API, and production UI dependencies", async () => {
    const roots = [
      ...(await sourceFilesIn("app")),
      ...(await sourceFilesIn("src/components")),
      "src/research/compositions/official.ts",
    ].filter((path) => !path.includes(".test."));
    const report = await inspectImportBoundary({
      roots,
      forbiddenSegments: ["capabilities.internal"],
    });
    expect(report.violations).toEqual([]);
  });
});
