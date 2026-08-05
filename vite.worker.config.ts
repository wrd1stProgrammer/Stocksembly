import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    noExternal: [
      /^@aws-sdk\//u,
      /^@whop\//u,
      /^@smithy\//u,
      "fast-xml-parser",
      "strnum",
      "tslib",
    ],
  },
});
