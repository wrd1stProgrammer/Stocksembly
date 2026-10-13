import { describe, expect, it } from "vitest";
import { metadata as disclaimer } from "../disclaimer/page";
import { metadata as privacy } from "../privacy/page";
import { metadata as riskDisclosure } from "../risk-disclosure/page";
import { metadata as terms } from "./page";

describe("English legal document canonical URLs", () => {
  it.each([
    ["terms", terms],
    ["privacy", privacy],
    ["disclaimer", disclaimer],
    ["risk-disclosure", riskDisclosure],
  ] as const)("deduplicates all query variants of /%s", (path, metadata) => {
    expect(metadata.alternates).toEqual({ canonical: `/${path}` });
    expect(metadata.title).toEqual(expect.any(String));
    expect(metadata.description).toEqual(expect.any(String));
  });
});
