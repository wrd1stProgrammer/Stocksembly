import { defineConfig, devices } from "@playwright/test";

const researchMode =
  process.env.RESEARCH_MODE === "official" ? "official" : "fixture";
const serverCommand =
  process.env.PLAYWRIGHT_SERVER_COMMAND ??
  `RESEARCH_MODE=${researchMode} OFFICE_CALIBRATION=1 pnpm build && RESEARCH_MODE=${researchMode} OFFICE_CALIBRATION=1 PORT=4174 HOSTNAME=127.0.0.1 pnpm start`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
  },
  webServer: {
    command: serverCommand,
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "fixture",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      testMatch: /research-composition-fixture\.spec\.ts/,
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
  ],
});
