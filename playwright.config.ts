import { defineConfig, devices } from "@playwright/test";

const researchMode =
  process.env.RESEARCH_MODE === "official" ? "official" : "fixture";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4174";
const serverCommand =
  process.env.PLAYWRIGHT_SERVER_COMMAND ??
  `RESEARCH_MODE=${researchMode} OFFICE_CALIBRATION=1 pnpm build && RESEARCH_MODE=${researchMode} OFFICE_CALIBRATION=1 PORT=4174 HOSTNAME=127.0.0.1 pnpm start`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: serverCommand,
    url: baseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
  },
  projects: [
    {
      name: "fixture",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      testMatch: /(research-composition-fixture|home|smoke-[a-z-]+)\.spec\.ts/,
      ...(researchMode === "fixture" ? {} : { testIgnore: /./ }),
    },
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      ...(researchMode === "fixture" ? {} : { testIgnore: /./ }),
    },
    {
      name: "official",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      ...(researchMode === "official" ? {} : { testIgnore: /./ }),
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testMatch: /research-official-five-report\.spec\.ts/,
      ...(researchMode === "official" ? {} : { testIgnore: /./ }),
    },
  ],
});
