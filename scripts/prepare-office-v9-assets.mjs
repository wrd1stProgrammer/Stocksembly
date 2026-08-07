import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const root = process.cwd();
const sourceRoot = path.join(root, "assets/research/office-v9-sources");
const entitySourceRoot = path.join(
  root,
  "assets/research/office-v8-pilot-sources/entities",
);
const publicRoot = path.join(root, "public/research/office-v9");
const actorFrame = Object.freeze({ width: 160, height: 192 });
const actorGrid = Object.freeze({ columns: 4, rows: 4 });
const footBaseline = 176;
const standingHeight = 144;
const seatedHeight = 112;
const maximumStandingHeight = 152;
const maximumArtworkWidth = 136;
const alphaThreshold = 64;

// Image generation can return the two profile rows in either order even with
// a strict prompt. Normalize every public atlas to row 1 = right and row 2 =
// left so runtime facing never depends on a model's row-order choice.
const swappedProfileAgentIds = new Set([
  "benchmark",
  "financial",
  "valuation",
  "risk_policy",
  "chair",
]);

const agentIds = Object.freeze([
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
]);

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, image) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(image));
}

function alphaBounds(image, region) {
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

function occupiedRuns(flags, minimumLength) {
  const runs = [];
  let start = -1;
  for (let index = 0; index <= flags.length; index += 1) {
    if (index < flags.length && flags[index]) {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0 && index - start >= minimumLength) {
      runs.push({ start, end: index - 1 });
    }
    start = -1;
  }
  return runs;
}

function discoverActorRegions(source) {
  const occupiedRows = new Array(source.height).fill(false);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if ((source.data[(y * source.width + x) * 4 + 3] ?? 0) < alphaThreshold)
        continue;
      occupiedRows[y] = true;
      break;
    }
  }
  const rowRuns = occupiedRuns(occupiedRows, 30);
  if (rowRuns.length !== actorGrid.rows) {
    throw new RangeError(`Expected 4 artwork rows, found ${rowRuns.length}`);
  }
  return rowRuns.map((rowRun) => {
    const occupiedColumns = new Array(source.width).fill(false);
    for (let x = 0; x < source.width; x += 1) {
      for (let y = rowRun.start; y <= rowRun.end; y += 1) {
        if ((source.data[(y * source.width + x) * 4 + 3] ?? 0) < alphaThreshold)
          continue;
        occupiedColumns[x] = true;
        break;
      }
    }
    const columnRuns = occupiedRuns(occupiedColumns, 20);
    if (columnRuns.length !== actorGrid.columns) {
      throw new RangeError(
        `Expected 4 artwork columns, found ${columnRuns.length}`,
      );
    }
    return columnRuns.map((columnRun) => ({
      x: columnRun.start,
      y: rowRun.start,
      width: columnRun.end - columnRun.start + 1,
      height: rowRun.end - rowRun.start + 1,
    }));
  });
}

function discoverHorizontalRegions(source, expectedCount, minimumLength) {
  const occupiedColumns = new Array(source.width).fill(false);
  for (let x = 0; x < source.width; x += 1) {
    for (let y = 0; y < source.height; y += 1) {
      if ((source.data[(y * source.width + x) * 4 + 3] ?? 0) < alphaThreshold)
        continue;
      occupiedColumns[x] = true;
      break;
    }
  }
  const columnRuns = occupiedRuns(occupiedColumns, minimumLength);
  if (columnRuns.length !== expectedCount) {
    throw new RangeError(
      `Expected ${expectedCount} horizontal poses, found ${columnRuns.length}`,
    );
  }
  return columnRuns.map((columnRun) =>
    alphaBounds(source, {
      x: columnRun.start,
      y: 0,
      width: columnRun.end - columnRun.start + 1,
      height: source.height,
    }),
  );
}

function discoverSeatedRegions(source) {
  return discoverHorizontalRegions(source, 2, 40);
}

function normalizedSize(bounds, targetHeight) {
  const width = Math.round((bounds.width / bounds.height) * targetHeight);
  if (width > maximumArtworkWidth) {
    throw new RangeError(
      `Artwork is too wide (${width}px at ${targetHeight}px high); remove props or stray pixels`,
    );
  }
  return { width: Math.max(1, width), height: targetHeight };
}

function standingScale(bounds) {
  const idleScale = standingHeight / bounds[0].height;
  const heightScale =
    maximumStandingHeight / Math.max(...bounds.map((item) => item.height));
  const widthScale =
    maximumArtworkWidth / Math.max(...bounds.map((item) => item.width));
  return Math.min(idleScale, heightScale, widthScale);
}

function sizeAtScale(bounds, scale) {
  return {
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
  };
}

function verticalWalkScale(bounds) {
  const orderedHeights = bounds
    .map((item) => item.height)
    .sort((left, right) => left - right);
  const medianHeight = (orderedHeights[1] + orderedHeights[2]) / 2;
  return Math.min(
    standingHeight / medianHeight,
    maximumStandingHeight / Math.max(...bounds.map((item) => item.height)),
    maximumArtworkWidth / Math.max(...bounds.map((item) => item.width)),
  );
}

function prepareActor(agentId) {
  const sourcePath = path.join(sourceRoot, "actors", `${agentId}-alpha.png`);
  const source = readPng(sourcePath);
  const discoveredRegions = discoverActorRegions(source);
  const seatedSourcePath = path.join(
    sourceRoot,
    "seated",
    `${agentId}-alpha.png`,
  );
  const seatedSource = fs.existsSync(seatedSourcePath)
    ? readPng(seatedSourcePath)
    : null;
  const seatedBounds = seatedSource
    ? discoverSeatedRegions(seatedSource)
    : null;
  const seatedScale = seatedBounds
    ? seatedHeight / seatedBounds[0].height
    : null;
  const verticalWalkSourcePath = path.join(
    sourceRoot,
    "vertical-walk",
    `${agentId}-alpha.png`,
  );
  const verticalWalkSource = fs.existsSync(verticalWalkSourcePath)
    ? readPng(verticalWalkSourcePath)
    : null;
  const verticalWalkBounds = verticalWalkSource
    ? discoverHorizontalRegions(verticalWalkSource, 4, 40)
    : null;
  const dedicatedVerticalWalkScale = verticalWalkBounds
    ? verticalWalkScale(verticalWalkBounds)
    : null;
  const atlas = new PNG({
    width: actorFrame.width * actorGrid.columns,
    height: actorFrame.height * actorGrid.rows,
  });
  for (let row = 0; row < actorGrid.rows; row += 1) {
    const sourceRow =
      swappedProfileAgentIds.has(agentId) && (row === 1 || row === 2)
        ? 3 - row
        : row;
    const rowBounds = discoveredRegions[sourceRow].map((region) =>
      alphaBounds(source, region),
    );
    const scale = standingScale(rowBounds.slice(0, 3));
    for (let column = 0; column < actorGrid.columns; column += 1) {
      const bounds = rowBounds[column];
      const dedicatedWalkIndex =
        (row === 0 || row === 3) && (column === 1 || column === 2)
          ? (row === 0 ? 0 : 2) + column - 1
          : null;
      if (
        dedicatedWalkIndex !== null &&
        verticalWalkSource &&
        verticalWalkBounds &&
        dedicatedVerticalWalkScale !== null
      ) {
        const dedicatedBounds = verticalWalkBounds[dedicatedWalkIndex];
        const size = sizeAtScale(dedicatedBounds, dedicatedVerticalWalkScale);
        const sprite = resizeNearest(verticalWalkSource, dedicatedBounds, size);
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
        continue;
      }
      const dedicatedSeatedIndex = row === 0 ? 0 : row === 3 ? 1 : null;
      if (
        column === 3 &&
        dedicatedSeatedIndex !== null &&
        seatedSource &&
        seatedBounds &&
        seatedScale !== null
      ) {
        const dedicatedBounds = seatedBounds[dedicatedSeatedIndex];
        const size = sizeAtScale(dedicatedBounds, seatedScale);
        const sprite = resizeNearest(seatedSource, dedicatedBounds, size);
        const targetTop =
          dedicatedSeatedIndex === 0
            ? footBaseline - size.height
            : footBaseline - seatedHeight;
        PNG.bitblt(
          sprite,
          atlas,
          0,
          0,
          size.width,
          size.height,
          column * actorFrame.width +
            Math.floor((actorFrame.width - size.width) / 2),
          row * actorFrame.height + targetTop,
        );
        continue;
      }
      const size =
        column === 3
          ? normalizedSize(bounds, seatedHeight)
          : sizeAtScale(bounds, scale);
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
}

function prepareChairEntities() {
  const source = readPng(
    path.join(entitySourceRoot, "analyst-chair-alpha.png"),
  );
  const chairBounds = discoverHorizontalRegions(source, 2, 100);
  for (const [index, assetId] of [
    "analyst-chair-down",
    "analyst-chair-up",
  ].entries()) {
    writePng(
      path.join(publicRoot, "entities", `${assetId}.png`),
      isolatedAsset(
        source,
        chairBounds[index],
        { width: 128, height: 128 },
        { width: 116, height: 116 },
      ),
    );
  }

  const evidenceSource = readPng(
    path.join(entitySourceRoot, "evidence-forum-alpha.png"),
  );
  writePng(
    path.join(publicRoot, "entities", "evidence-forum.png"),
    isolatedAsset(
      evidenceSource,
      alphaBounds(evidenceSource, {
        x: 0,
        y: 0,
        width: evidenceSource.width,
        height: evidenceSource.height,
      }),
      { width: 252, height: 174 },
      { width: 248, height: 168 },
    ),
  );
}

const requestedIds = process.argv.slice(2);
const selectedIds = requestedIds.length === 0 ? agentIds : requestedIds;
for (const agentId of selectedIds) {
  if (!agentIds.includes(agentId)) {
    throw new RangeError(`Unknown office agent: ${agentId}`);
  }
  prepareActor(agentId);
}
prepareChairEntities();

console.log(`Prepared office v9 assets in ${path.relative(root, publicRoot)}`);
