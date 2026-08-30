import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    noExternal: [
      /^@aws-sdk\//u,
      /^@whop\//u,
      /^@smithy\//u,
      "cheerio",
      "fast-xml-parser",
      "pg",
      "strnum",
      "tslib",
    ],
  },
});
