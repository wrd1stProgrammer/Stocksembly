import { describe, expect, it } from "vitest";
import { collectQuestionWebEvidence } from "./questionWebEvidence";

describe("question web evidence", () => {
  it("captures a cited public page into bounded evidence", async () => {
    const evidence = await collectQuestionWebEvidence(
      "https://example.com/news",
      {
        createId: () => "00000000-0000-4000-8000-000000000088",
        now: () => "2026-07-27T00:00:00.000Z",
        resolveAddresses: () => Promise.resolve(["93.184.216.34"]),
        fetch: () =>
          Promise.resolve(
            new Response(
              "<html><title>Official update</title><body>Material company update.</body></html>",
              { status: 200 },
            ),
          ),
      },
    );

    expect(evidence).toMatchObject({
      url: "https://example.com/news",
      title: "Official update",
      publisher: "example.com",
      excerpt: "Official update Material company update.",
    });
  });
});
