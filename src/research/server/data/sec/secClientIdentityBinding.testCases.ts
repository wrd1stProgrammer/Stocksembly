import { access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSecClient, type SecWireAdapter } from "./secClient";
import { jsonResponse, temporaryDataRoot } from "./secClient.testSupport";

describe("SEC response issuer binding", () => {
  it.each([
    [
      "numeric submissions CIK",
      {
        kind: "submissions",
        cik: "0000320193",
      },
      JSON.stringify({
        cik: 789_019,
        name: "Wrong Synthetic Issuer",
        filings: {
          recent: {
            accessionNumber: [],
            form: [],
            filingDate: [],
            primaryDocument: [],
          },
          files: [],
        },
      }),
    ],
    [
      "zero-padded company-facts CIK",
      {
        kind: "company_facts",
        cik: "0000320193",
      },
      JSON.stringify({
        cik: "0000789019",
        entityName: "Wrong Synthetic Issuer",
        facts: { "us-gaap": { Assets: {} } },
      }),
    ],
  ])(
    "rejects a schema-valid wrong issuer from %s before cache or provenance",
    async (_label, request, body) => {
      // Given
      const dataRoot = await temporaryDataRoot();
      let calls = 0;
      const adapter: SecWireAdapter = async () => {
        calls += 1;
        return jsonResponse(body);
      };

      // When / Then
      await expect(
        createSecClient({ dataRoot, adapter }).fetch(request),
      ).rejects.toMatchObject({
        name: "SecClientError",
        code: "SEC_SCHEMA_INVALID",
      });
      await expect(
        access(join(dataRoot, "cache", "sec")),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(calls).toBe(1);
    },
  );
});
