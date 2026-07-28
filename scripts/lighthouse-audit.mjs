import { mkdir, writeFile } from "node:fs/promises";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const url = process.env.AUDIT_URL ?? "http://127.0.0.1:4175/";
const evidenceDirectory = ".omo/evidence/stocksembly-home/lighthouse";
const categoryNames = ["performance", "accessibility", "best-practices", "seo"];

await mkdir(evidenceDirectory, { recursive: true });

const chrome = await chromeLauncher.launch({
  chromeFlags: [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
  ],
});

const results = {};

try {
  for (const profile of ["mobile", "desktop"]) {
    const runs = [];

    for (let run = 1; run <= 3; run += 1) {
      const result = await lighthouse(
        url,
        {
          port: chrome.port,
          logLevel: "error",
          output: "json",
          onlyCategories: categoryNames,
        },
        profile === "desktop" ? desktopConfig : undefined,
      );

      if (!result) throw new Error(`Lighthouse returned no ${profile} result.`);

      await writeFile(
        `${evidenceDirectory}/${profile}-${run}.json`,
        result.report,
      );

      runs.push(
        Object.fromEntries(
          categoryNames.map((category) => [
            category,
            Math.round((result.lhr.categories[category]?.score ?? 0) * 100),
          ]),
        ),
      );
    }

    const median = Object.fromEntries(
      categoryNames.map((category) => {
        const scores = runs.map((run) => run[category]).sort((a, b) => a - b);
        return [category, scores[1]];
      }),
    );

    results[profile] = { runs, median };
  }
} finally {
  await chrome.kill();
}

await writeFile(
  `${evidenceDirectory}/summary.json`,
  JSON.stringify(
    { url, generatedAt: new Date().toISOString(), ...results },
    null,
    2,
  ),
);

console.log(JSON.stringify(results, null, 2));
