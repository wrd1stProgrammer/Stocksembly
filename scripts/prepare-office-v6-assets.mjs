import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const root = process.cwd();
const officeDir = path.join(root, "public/research/office-v6");
const sourceDir = path.join(root, "assets/research/office-v6-sources");
const agentDir = path.join(officeDir, "agents");
const portraitDir = path.join(officeDir, "portraits");
const furnitureDir = path.join(officeDir, "furniture");
const agents = ["market", "company", "financial", "valuation", "risk", "chair"];
const directions = ["down", "left", "right", "up"];
const cell = { width: 160, height: 192 };
const footBaseline = 178;

function prepareBase() {
  const source = readPng(
    path.join(sourceDir, "modern-office-south-facing.png"),
  );
  writePng(path.join(officeDir, "base.png"), source);
}

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function writePng(file, image) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(image));
}

function isVisible(image, x, y) {
  return (image.data[(y * image.width + x) * 4 + 3] ?? 0) >= 8;
}

function connectedComponents(image, region) {
  const visited = new Uint8Array(region.width * region.height);
  const components = [];
  for (let startY = 0; startY < region.height; startY += 1) {
    for (let startX = 0; startX < region.width; startX += 1) {
      const startIndex = startY * region.width + startX;
      if (
        visited[startIndex] ||
        !isVisible(image, region.x + startX, region.y + startY)
      )
        continue;
      const queue = [[startX, startY]];
      visited[startIndex] = 1;
      let head = 0;
      let left = startX;
      let right = startX;
      let top = startY;
      let bottom = startY;
      let area = 0;
      while (head < queue.length) {
        const point = queue[head];
        if (!point) break;
        const [x, y] = point;
        head += 1;
        area += 1;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        for (const [nextX, nextY] of [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ]) {
          if (
            nextX < 0 ||
            nextX >= region.width ||
            nextY < 0 ||
            nextY >= region.height
          )
            continue;
          const index = nextY * region.width + nextX;
          if (
            visited[index] ||
            !isVisible(image, region.x + nextX, region.y + nextY)
          )
            continue;
          visited[index] = 1;
          queue.push([nextX, nextY]);
        }
      }
      components.push({ area, left, right, top, bottom });
    }
  }
  return components;
}

function spriteGridBounds(image, rows, columns) {
  const region = { x: 0, y: 0, width: image.width, height: image.height };
  const components = connectedComponents(image, region);
  const primarySpritesByRow = [...components]
    .sort((a, b) => b.area - a.area)
    .slice(0, rows * columns)
    .sort((a, b) => (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
  if (primarySpritesByRow.length !== rows * columns) {
    throw new Error(`Expected ${rows * columns} sprites`);
  }
  const primarySprites = [];
  for (let row = 0; row < rows; row += 1) {
    primarySprites.push(
      ...primarySpritesByRow
        .slice(row * columns, (row + 1) * columns)
        .sort((a, b) => (a.left + a.right) / 2 - (b.left + b.right) / 2),
    );
  }
  return primarySprites.map((primary) => {
    return {
      x: region.x + primary.left,
      y: region.y + primary.top,
      width: primary.right - primary.left + 1,
      height: primary.bottom - primary.top + 1,
    };
  });
}

function blitNearest(source, sourceRect, target, targetRect) {
  for (let y = 0; y < targetRect.height; y += 1) {
    const sourceY =
      sourceRect.y +
      Math.min(
        sourceRect.height - 1,
        Math.floor((y * sourceRect.height) / targetRect.height),
      );
    for (let x = 0; x < targetRect.width; x += 1) {
      const sourceX =
        sourceRect.x +
        Math.min(
          sourceRect.width - 1,
          Math.floor((x * sourceRect.width) / targetRect.width),
        );
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const targetIndex =
        ((targetRect.y + y) * target.width + targetRect.x + x) * 4;
      source.data.copy(target.data, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
}

function paddedCrop(source, bounds, padding) {
  const target = new PNG({
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  });
  PNG.bitblt(
    source,
    target,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    padding,
    padding,
  );
  return target;
}

function prepareAgent(agent) {
  const source = readPng(path.join(sourceDir, `${agent}-alpha.png`));
  const boundsGrid = spriteGridBounds(source, 4, 4);
  const frames = [];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const bounds = boundsGrid[row * 4 + column];
      if (!bounds) throw new Error(`Missing ${agent} frame ${row}:${column}`);
      frames.push({
        row,
        column,
        bounds,
      });
    }
  }
  const standingHeights = frames
    .filter((frame) => frame.column < 3)
    .map((frame) => frame.bounds.height)
    .sort((a, b) => a - b);
  const medianHeight =
    standingHeights[Math.floor(standingHeights.length / 2)] ?? 1;
  const maxWidth = Math.max(...frames.map((frame) => frame.bounds.width));
  const maxHeight = Math.max(...frames.map((frame) => frame.bounds.height));
  const scale = Math.min(134 / medianHeight, 138 / maxWidth, 150 / maxHeight);
  const atlas = new PNG({ width: cell.width * 4, height: cell.height * 4 });
  for (const frame of frames) {
    const width = Math.max(1, Math.round(frame.bounds.width * scale));
    const height = Math.max(1, Math.round(frame.bounds.height * scale));
    blitNearest(source, frame.bounds, atlas, {
      x: frame.column * cell.width + Math.floor((cell.width - width) / 2),
      y: frame.row * cell.height + footBaseline - height,
      width,
      height,
    });
  }
  writePng(path.join(agentDir, `${agent}.png`), atlas);
  const portrait = frames.find(
    (frame) => frame.row === 0 && frame.column === 0,
  );
  if (!portrait) throw new Error(`Missing portrait frame for ${agent}`);
  writePng(
    path.join(portraitDir, `${agent}.png`),
    paddedCrop(source, portrait.bounds, 12),
  );
}

function prepareChairs() {
  const source = readPng(path.join(sourceDir, "chairs-alpha.png"));
  const boundsByColumn = spriteGridBounds(source, 1, 4);
  for (let column = 0; column < 4; column += 1) {
    const bounds = boundsByColumn[column];
    if (!bounds) throw new Error(`Missing chair frame ${column}`);
    const scale = Math.min(100 / bounds.height, 104 / bounds.width);
    const width = Math.round(bounds.width * scale);
    const height = Math.round(bounds.height * scale);
    const target = new PNG({ width: 128, height: 128 });
    blitNearest(source, bounds, target, {
      x: Math.floor((128 - width) / 2),
      y: 116 - height,
      width,
      height,
    });
    writePng(
      path.join(furnitureDir, `chair-${directions[column]}.png`),
      target,
    );
  }
}

prepareBase();
for (const agent of agents) prepareAgent(agent);
prepareChairs();
