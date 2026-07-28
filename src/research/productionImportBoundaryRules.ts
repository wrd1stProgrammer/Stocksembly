export type BoundaryScope = "official" | "calibration";

export type RestrictedInternalImport = {
  readonly segment: string;
  readonly allowedImporters: readonly string[];
};

export const BUILTIN_RESTRICTED_INTERNAL_IMPORTS = [
  {
    segment: "compositionMode.authority.internal",
    allowedImporters: [
      "src/research/compositionMode.membership.ts",
      "src/research/compositions/internal.ts",
    ],
  },
  {
    segment: "compositions/internal",
    allowedImporters: [
      "src/research/compositions/fixture.ts",
      "src/research/compositions/official.ts",
      "src/research/compositions/calibration.ts",
    ],
  },
] as const satisfies readonly RestrictedInternalImport[];

const BUILTIN_FIXTURE_PATTERNS = [
  /(?:^|\/)compositions\/fixture(?:\.[cm]?[jt]sx?|\/|$)/,
  /(?:^|\/)fixturePlayback(?:\.[cm]?[jt]sx?|\/|$)/,
  /(?:^|\/)(?:mockResearch(?:File)?|officePlaybackCopy)(?:\.[cm]?[jt]sx?|\/|$)/,
] as const;
const BUILTIN_TEST_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const CALIBRATION_PATTERN =
  /(?:^|\/)(?:compositions\/calibration|OfficeCalibration|calibration)(?:\.[cm]?[jt]sx?|\/|$)/;

export function builtInViolation(
  relativePath: string,
  importedFrom: string | undefined,
  scope: BoundaryScope,
): string | undefined {
  const path = normalizedPath(relativePath);
  if (BUILTIN_FIXTURE_PATTERNS.some((pattern) => pattern.test(path))) {
    return `${path} -> BUILTIN_FIXTURE_MODULE`;
  }
  if (BUILTIN_TEST_PATTERN.test(path)) {
    return `${path} -> BUILTIN_TEST_MODULE`;
  }
  if (
    scope === "official" &&
    CALIBRATION_PATTERN.test(path) &&
    (importedFrom === undefined ||
      !CALIBRATION_PATTERN.test(normalizedPath(importedFrom)))
  ) {
    return `${path} -> BUILTIN_CALIBRATION_MODULE_OUTSIDE_SHOWCASE`;
  }
  return undefined;
}

export function forbiddenMatch(
  value: string,
  forbiddenSegments: readonly string[] | undefined,
): string | undefined {
  return forbiddenSegments?.find((segment) => value.includes(segment));
}

export function restrictedImportViolation(
  relativePath: string,
  importedFrom: string | undefined,
  rules: readonly RestrictedInternalImport[] | undefined,
): string | undefined {
  const path = normalizedPath(relativePath);
  const rule = rules?.find(({ segment }) => path.includes(segment));
  if (rule === undefined) return undefined;
  if (importedFrom !== undefined) {
    const importer = normalizedPath(importedFrom);
    if (rule.allowedImporters.includes(importer)) return undefined;
  }
  return `${path} -> RESTRICTED_INTERNAL_MODULE`;
}

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/");
}
