import { defineConfig } from "vite";

export default defineConfig({
  build: { sourcemap: process.env.SENTRY_UPLOAD_SOURCE_MAPS === "true" },
  ssr: {
    noExternal: [
      /^@aws-sdk\//u,
      /^@whop\//u,
      /^@smithy\//u,
      "cheerio",
      "fast-xml-parser",
      "strnum",
      "tslib",
    ],
  },
});
