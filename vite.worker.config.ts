import { defineConfig } from "vite";

export default defineConfig({
  ssr: {
    noExternal: [
      /^@aws-sdk\//u,
      /^@smithy\//u,
      "fast-xml-parser",
      "strnum",
      "tslib",
    ],
  },
});
