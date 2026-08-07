import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const root = process.cwd();
const sourceRoot = path.join(root, "assets/research/office-v8-pilot-sources");
const publicRoot = path.join(root, "public/research/office-v8");
const actorFrame = Object.freeze({ width: 160, height: 192 });
const actorGrid = Object.freeze({ columns: 4, rows: 4 });
const footBaseline = 176;

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, image) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(image));
}

function alphaBounds(
  image,
  region = { x: 0, y: 0, width: image.width, height: image.height },
) {
  let left = region.x + region.width;
  let right = -1;
  let top = region.y + region.height;
  let bottom = -1;
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) < 12) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) {
    throw new RangeError(`No opaque artwork in ${JSON.stringify(region)}`);
  }
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function resizeNearest(source, bounds, size) {
  const target = new PNG({ width: size.width, height: size.height });
  for (let y = 0; y < size.height; y += 1) {
    const sourceY =
      bounds.y +
      Math.min(
        bounds.height - 1,
        Math.floor((y * bounds.height) / size.height),
      );
    for (let x = 0; x < size.width; x += 1) {
      const sourceX =
        bounds.x +
        Math.min(bounds.width - 1, Math.floor((x * bounds.width) / size.width));
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const targetIndex = (y * target.width + x) * 4;
      source.data.copy(target.data, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
  return target;
}

function fittedSize(bounds, maxSize) {
  const scale = Math.min(
    maxSize.width / bounds.width,
    maxSize.height / bounds.height,
  );
  return {
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
  };
}

function isolatedAsset(source, bounds, outputSize, artworkMaxSize) {
  const size = fittedSize(bounds, artworkMaxSize);
  const sprite = resizeNearest(source, bounds, size);
  const output = new PNG(outputSize);
  PNG.bitblt(
    sprite,
    output,
    0,
    0,
    size.width,
    size.height,
    Math.floor((outputSize.width - size.width) / 2),
    Math.floor((outputSize.height - size.height) / 2),
  );
  return output;
}

function actorRegion(source, row, column) {
  const x = Math.floor((column * source.width) / actorGrid.columns);
  const y = Math.floor((row * source.height) / actorGrid.rows);
  return {
    x,
    y,
    width: Math.floor(((column + 1) * source.width) / actorGrid.columns) - x,
    height: Math.floor(((row + 1) * source.height) / actorGrid.rows) - y,
  };
}

function prepareActor(agentId) {
  const source = readPng(
    path.join(sourceRoot, "actors", `${agentId}-alpha.png`),
  );
  const atlas = new PNG({
    width: actorFrame.width * actorGrid.columns,
    height: actorFrame.height * actorGrid.rows,
  });
  for (let row = 0; row < actorGrid.rows; row += 1) {
    for (let column = 0; column < actorGrid.columns; column += 1) {
      const bounds = alphaBounds(source, actorRegion(source, row, column));
      const size = fittedSize(bounds, { width: 128, height: 144 });
      const sprite = resizeNearest(source, bounds, size);
      PNG.bitblt(
        sprite,
        atlas,
        0,
        0,
        size.width,
        size.height,
        column * actorFrame.width +
          Math.floor((actorFrame.width - size.width) / 2),
        row * actorFrame.height + footBaseline - size.height,
      );
    }
  }
  writePng(path.join(publicRoot, "agents", `${agentId}.png`), atlas);

  const portraitBounds = alphaBounds(source, actorRegion(source, 0, 0));
  writePng(
    path.join(publicRoot, "agents", `${agentId}-portrait.png`),
    isolatedAsset(
      source,
      portraitBounds,
      { width: 192, height: 192 },
      { width: 154, height: 166 },
    ),
  );
}

function prepareChairAssets() {
  const source = readPng(
    path.join(sourceRoot, "entities", "analyst-chair-alpha.png"),
  );
  const split = Math.floor(source.width / 2);
  const halves = [
    ["analyst-chair-down", { x: 0, y: 0, width: split, height: source.height }],
    [
      "analyst-chair-up",
      { x: split, y: 0, width: source.width - split, height: source.height },
    ],
  ];
  for (const [assetId, region] of halves) {
    writePng(
      path.join(publicRoot, "entities", `${assetId}.png`),
      isolatedAsset(
        source,
        alphaBounds(source, region),
        { width: 128, height: 128 },
        { width: 116, height: 116 },
      ),
    );
  }
}

function prepareEvidenceForum() {
  const source = readPng(
    path.join(sourceRoot, "entities", "evidence-forum-alpha.png"),
  );
  writePng(
    path.join(publicRoot, "entities", "evidence-forum.png"),
    isolatedAsset(
      source,
      alphaBounds(source),
      { width: 252, height: 174 },
      { width: 248, height: 168 },
    ),
  );
}

for (const agentId of [
  "market",
  "market_news",
  "benchmark",
  "company",
  "company_product",
  "company_competition",
  "financial",
  "valuation",
  "financial_quality",
  "risk",
  "risk_policy",
  "chair",
]) {
  prepareActor(agentId);
}
prepareChairAssets();
prepareEvidenceForum();

console.log(`Prepared office v8 assets in ${path.relative(root, publicRoot)}`);
