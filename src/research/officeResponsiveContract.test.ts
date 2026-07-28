import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("responsive office contract source guard", () => {
  it("does not reintroduce the retired 4:3 research contract", () => {
    const responsiveCss = readFileSync(
      resolve(process.cwd(), "src/styles/research-responsive.css"),
      "utf8",
    );
    const visualSpec = readFileSync(
      resolve(process.cwd(), "tests/e2e/office-visual.spec.ts"),
      "utf8",
    );

    expect(responsiveCss).not.toMatch(/aspect-ratio\s*:\s*4\s*\/\s*3/);
    expect(visualSpec).not.toMatch(/4\s*\/\s*3|4:3/);
  });
});
