import { describe, expect, it } from "vitest";
import {
  appendVaryAccept,
  preferredRepresentation,
} from "./contentNegotiation";

describe("HTTP Accept negotiation", () => {
  it.each([
    [null, "text/html"],
    ["", "text/html"],
    ["*/*", "text/html"],
    ["text/markdown", "text/markdown"],
    ["text/markdown, text/html;q=0.8", "text/markdown"],
    ["text/html;q=1, text/markdown;q=0.5", "text/html"],
    ["text/html;q=0, */*;q=1", "text/markdown"],
    ["application/pdf", null],
  ] as const)("selects %s as %s", (accept, expected) => {
    expect(preferredRepresentation(accept)).toBe(expected);
  });

  it("adds Accept to an existing Vary header exactly once", () => {
    const headers = new Headers({ Vary: "Accept-Encoding" });

    appendVaryAccept(headers);
    appendVaryAccept(headers);

    expect(headers.get("Vary")).toBe("Accept-Encoding, Accept");
  });
});
