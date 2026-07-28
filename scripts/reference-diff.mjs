import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const referencePath = "docs/lovable-scale-reference.png";
const actualPath = ".omo/evidence/stocksembly-home/home-reference-size.png";
const reportPath = ".omo/evidence/stocksembly-home/reference-diff.json";
const [reference, actual] = await Promise.all(
  [referencePath, actualPath].map(async (path) =>
    PNG.sync.read(await readFile(path)),
  ),
);

const referenceScale = 1;
const dimensionsMatch =
  reference.width === actual.width * referenceScale &&
  reference.height === actual.height * referenceScale;
if (!dimensionsMatch) throw new Error("Reference scale does not match actual.");

const gridSize = 8;
const totalPixels = actual.width * actual.height;
let diffPixels = 0;
let alphaChannelIntact = true;
const hotspots = [];

for (let gridY = 0; gridY < gridSize; gridY += 1) {
  const y = Math.floor((gridY * actual.height) / gridSize);
  const endY = Math.floor(((gridY + 1) * actual.height) / gridSize);

  for (let gridX = 0; gridX < gridSize; gridX += 1) {
    const x = Math.floor((gridX * actual.width) / gridSize);
    const endX = Math.floor(((gridX + 1) * actual.width) / gridSize);
    let cellDiffPixels = 0;

    for (let pixelY = y; pixelY < endY; pixelY += 1) {
      for (let pixelX = x; pixelX < endX; pixelX += 1) {
        const index = (pixelY * actual.width + pixelX) * 4;
        const referenceIndex =
          (pixelY * referenceScale * reference.width +
            pixelX * referenceScale) *
          4;
        const differs = [0, 1, 2, 3].some(
          (offset) =>
            reference.data[referenceIndex + offset] !==
            actual.data[index + offset],
        );
        if (differs) {
          diffPixels += 1;
          cellDiffPixels += 1;
        }
        if (actual.data[index + 3] !== 255) alphaChannelIntact = false;
      }
    }

    const cellPixels = (endX - x) * (endY - y);
    hotspots.push({
      gridX,
      gridY,
      x,
      y,
      width: endX - x,
      height: endY - y,
      diffRatio: Number((cellDiffPixels / cellPixels).toFixed(4)),
    });
  }
}

const diffRatio = diffPixels / totalPixels;
const report = {
  command: "exact-rgba-image-diff",
  dimensionsMatch,
  reference: {
    width: reference.width,
    height: reference.height,
    scale: referenceScale,
  },
  actual: { width: actual.width, height: actual.height },
  totalPixels,
  diffPixels,
  diffRatio: Number(diffRatio.toFixed(4)),
  similarityScore: Number((1 - diffRatio).toFixed(4)),
  alphaChannelIntact,
  hotspots: hotspots.sort((a, b) => b.diffRatio - a.diffRatio),
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
