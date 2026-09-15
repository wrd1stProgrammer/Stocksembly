import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createResearchTestDatabase } from "../../../test/researchPostgres";
import {
  readInsightSentryCache,
  writeInsightSentryCache,
} from "./insightsentry/insightSentryCache";
import { readSecCache, writeSecCache } from "./sec/secClientCache";
import { withSharedSourceCache } from "./sharedSourceCache";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
it("reuses source bytes across worker disks while preserving expiry and SEC provenance", async () => {
  const fixture = await createResearchTestDatabase();
  const first = await mkdtemp(join(tmpdir(), "prefetch-first-"));
  roots.push(first);
  const second = await mkdtemp(join(tmpdir(), "prefetch-second-"));
  roots.push(second);
  const bytes = Buffer.from("source evidence");
  const now = new Date().toISOString();
  try {
    await withSharedSourceCache(fixture.pool, async () => {
      await writeInsightSentryCache({
        dataRoot: first,
        cacheKey: "quote",
        bytes,
        retrievedAt: now,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      await writeSecCache({
        dataRoot: first,
        sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/report.htm",
        bytes,
        contentType: "text/html",
        contentHash: createHash("sha256").update(bytes).digest("hex"),
        storedAt: now,
      });
    });
    await withSharedSourceCache(fixture.pool, async () => {
      expect(
        (await readInsightSentryCache(second, "quote", Date.now()))
          ?.retrievedAt,
      ).toBe(now);
      expect(
        await readInsightSentryCache(second, "quote", Date.now() + 120_000),
      ).toBeUndefined();
      const sec = await readSecCache(
        second,
        "https://www.sec.gov/Archives/edgar/data/1/report.htm",
      );
      expect(Buffer.from(sec!.bytes).toString()).toBe("source evidence");
      expect(sec!.storedAt).toBe(now);
    });
  } finally {
    await fixture.close();
  }
});
