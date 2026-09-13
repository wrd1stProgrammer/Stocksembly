import { afterEach } from "vitest";
import { createResearchTestDatabase } from "../../test/researchPostgres";

const fixtures: Awaited<ReturnType<typeof createResearchTestDatabase>>[] = [];

afterEach(async () => {
  while (fixtures.length > 0) await fixtures.pop()?.close();
});

export async function workflowTestDatabase() {
  const fixture = await createResearchTestDatabase();
  fixtures.push(fixture);
  return fixture.pool;
}
