import { describe, expect, it } from "vitest";
import { createSecClient, type SecWireAdapter } from "./secClient";
import {
  fakeClock,
  jsonResponse,
  temporaryDataRoot,
} from "./secClient.testSupport";

const COMPANY_FACTS = JSON.stringify({
  cik: 320193,
  entityName: "Synthetic Issuer",
  facts: { "us-gaap": { Assets: {} } },
});
const HISTORICAL_SUBMISSIONS = JSON.stringify({
  accessionNumber: [],
  form: [],
  filingDate: [],
  primaryDocument: [],
});
const COMPANY_TICKERS_EXCHANGE = JSON.stringify({
  fields: ["cik", "name", "ticker", "exchange"],
  data: [[320193, "Synthetic Issuer", "SYN", "Nasdaq"]],
});

describe("SEC request templates and endpoint semantics", () => {
  it("builds only fixed data and Archives templates with endpoint-specific validation", async () => {
    // Given
    const dataRoot = await temporaryDataRoot();
    const targets: string[] = [];
    const adapter: SecWireAdapter = async (request) => {
      targets.push(request.url.href);
      if (request.url.pathname.includes("company_tickers_exchange"))
        return jsonResponse(COMPANY_TICKERS_EXCHANGE);
      if (request.url.pathname.includes("companyfacts"))
        return jsonResponse(COMPANY_FACTS);
      if (request.url.pathname.includes("submissions-001"))
        return jsonResponse(HISTORICAL_SUBMISSIONS);
      if (request.url.pathname.endsWith(".xml"))
        return {
          status: 200,
          headers: { "content-type": "application/xml" },
          body: (async function* () {
            yield Buffer.from("<ownershipDocument />");
          })(),
          abort: () => undefined,
        };
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: (async function* () {
          yield Buffer.from("<html><body>Synthetic filing</body></html>");
        })(),
        abort: () => undefined,
      };
    };
    const client = createSecClient({ dataRoot, adapter, clock: fakeClock() });

    // When
    const tickers = await client.fetch({ kind: "company_tickers_exchange" });
    const facts = await client.fetch({
      kind: "company_facts",
      cik: "0000320193",
    });
    const history = await client.fetch({
      kind: "submissions_file",
      filename: "CIK0000320193-submissions-001.json",
    });
    const filing = await client.fetch({
      kind: "filing_document",
      cik: "0000320193",
      accessionNumber: "0000320193-26-000001",
      primaryDocument: "synthetic-10k.htm",
    });
    const ownershipFiling = await client.fetch({
      kind: "filing_document",
      cik: "0000320193",
      accessionNumber: "0000320193-26-000002",
      primaryDocument: "xslF345X06/wk-form4_1783371701.xml",
    });

    // Then
    expect(
      [tickers, facts, history, filing, ownershipFiling].every(
        (result) => result.bytes.byteLength > 0,
      ),
    ).toBe(true);
    expect(targets).toEqual([
      "https://www.sec.gov/files/company_tickers_exchange.json",
      "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
      "https://data.sec.gov/submissions/CIK0000320193-submissions-001.json",
      "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/synthetic-10k.htm",
      "https://www.sec.gov/Archives/edgar/data/320193/000032019326000002/xslF345X06/wk-form4_1783371701.xml",
    ]);
    expect(targets.every((target) => target.startsWith("https://"))).toBe(true);
    await expect(
      client.fetch({
        kind: "company_tickers_exchange",
        url: "https://outside.invalid/tickers.json",
      }),
    ).rejects.toMatchObject({ code: "SEC_REQUEST_INVALID" });
    await expect(
      client.fetch({
        kind: "filing_document",
        cik: "0000320193",
        accessionNumber: "0000320193-26-000003",
        primaryDocument: "../outside.xml",
      }),
    ).rejects.toMatchObject({ code: "SEC_REQUEST_INVALID" });
  });
});
