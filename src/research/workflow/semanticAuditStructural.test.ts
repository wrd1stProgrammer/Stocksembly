import { describe, expect, it } from "vitest";
import { semanticEvidenceWindow } from "./semanticAuditStructural";

describe("semantic audit evidence window", () => {
  it("locates Korean financial evidence inside a long provider artifact", () => {
    const filler = "unrelated provider metadata ".repeat(100);
    const evidence = `${filler}영업이익률은 66.23710000935347%이며 매출은 962억2,100만 달러입니다.${filler}`;

    const selected = semanticEvidenceWindow(
      evidence,
      "최근 분기 매출 962억2,100만 달러와 영업이익률 66.24%가 확인됐다.",
    );

    expect(selected.text).toContain("영업이익률은 66.23710000935347%");
    expect(selected.start).toBeGreaterThan(0);
  });
});

it("retains rounded cash-flow amounts and their table period instead of a matching introduction", async () => {
  const { semanticEvidenceWindows } = await import("./semanticAuditStructural");
  const introduction =
    "Microsoft operating cash flow and property equipment spending capacity. ".repeat(
      80,
    );
  const table =
    "STATEMENTS OF CASH FLOWS (in millions) Year ended June 30 2026 2025 ";
  const filler = " \n ".repeat(500);
  const text = `${introduction}${table}${filler}Net cash from operations 182,935 136,162 ${filler}Additions to property and equipment 115,948 64,551 ${filler}`;
  const windows = semanticEvidenceWindows(
    text,
    "Microsoft FY26 operating cash flow of $182.9 billion exceeded property and equipment spending of $115.9 billion.",
  );
  expect(windows.some((w) => w.text.includes("182,935"))).toBe(true);
  expect(windows.some((w) => w.text.includes("115,948"))).toBe(true);
  expect(
    windows.some((w) => w.text.includes("Year ended June 30 2026 2025")),
  ).toBe(true);
  for (const window of windows) {
    expect(window.text.length).toBeLessThanOrEqual(4_000);
    expect(text.slice(window.start, window.start + window.text.length)).toBe(
      window.text,
    );
  }
});
