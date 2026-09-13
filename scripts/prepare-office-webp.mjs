import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const publicRoot = resolve(process.argv[2] ?? "public");
const manifest = await readFile(
  new URL("../src/research/officeMotion/canvasPrimitives.ts", import.meta.url),
  "utf8",
);
const paths = [
  ...manifest.matchAll(/"(\/research\/office-v\d+\/[^"\n]+\.webp)"/g),
].map((match) => match[1]);
if (paths.length !== 16 || new Set(paths).size !== paths.length)
  throw new Error("Unexpected office asset manifest");
let before = 0;
let after = 0;
for (const path of paths) {
  const output = resolve(publicRoot, `.${path}`);
  const input = output.replace(/\.webp$/, ".png");
  const source = await stat(input);
  const result = await sharp(input)
    .webp({ quality: 85, alphaQuality: 100, effort: 6 })
    .toFile(output);
  before += source.size;
  after += result.size;
}
console.log(
  JSON.stringify({
    assets: paths.length,
    originalBytes: before,
    webpBytes: after,
  }),
);
