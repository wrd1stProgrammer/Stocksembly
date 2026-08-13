import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/better-sqlite3/**/*",
      "./node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3/**/*",
      "./node_modules/.pnpm/bindings@*/node_modules/bindings/**/*",
      "./node_modules/.pnpm/file-uri-to-path@*/node_modules/file-uri-to-path/**/*",
      "./node_modules/zod/**/*",
      "./node_modules/.pnpm/zod@*/node_modules/zod/**/*",
      "./node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**/*",
      "./node_modules/.pnpm/styled-jsx@*/node_modules/styled-jsx/**/*",
      "./node_modules/.pnpm/postcss@*/node_modules/postcss/**/*",
      "./node_modules/@kfonts/nanum-gothic/**/*",
      "./node_modules/pdfmake/**/*",
      "./node_modules/.pnpm/@foliojs-fork+fontkit@*/node_modules/@foliojs-fork/fontkit/**/*",
      "./node_modules/.pnpm/pdfmake@*/node_modules/pdfmake/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/*": ["./tmp/**/*"],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3", "pdfmake"],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.stocksembly.com" }],
        destination: "https://stocksembly.com/:path*",
        statusCode: 301,
      },
    ];
  },
  async rewrites() {
    if (process.env.RESEARCH_MODE !== "fixture") return [];
    return [
      {
        source: "/research/:symbol",
        destination: "/research-fixture/:symbol",
      },
    ];
  },
};

export default nextConfig;
