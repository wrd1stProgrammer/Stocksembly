import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import ts from "typescript";

// allow: SIZE_OK — the assigned standalone file owns the complete deterministic v7 asset build.
const root = process.cwd();
const sourceRoot = path.join(root, "assets/research/office-v7-sources");
const publicRoot = path.join(root, "public/research/office-v7");
const frame = { width: 160, height: 192 };
const atlasGrid = { rows: 4, columns: 4 };
const furnitureGrid = { rows: 3, columns: 4 };
const sourceDirections = ["down", "left", "right", "up"];
const furnitureKinds = ["chair", "desk", "monitor"];
const footBaseline = 176;
const seatedFrameTreatment = {
  down: { lowerBodyCrop: 0, verticalOffset: 0 },
  left: { lowerBodyCrop: 46, verticalOffset: 24 },
  right: { lowerBodyCrop: 46, verticalOffset: 24 },
  up: { lowerBodyCrop: 46, verticalOffset: 24 },
};
const actorsOnly = process.argv.includes("--actors-only");

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, image) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(image));
}

function alphaAt(image, x, y) {
  return image.data[(y * image.width + x) * 4 + 3] ?? 0;
}

function connectedComponents(image, threshold = 8) {
  const visited = new Uint8Array(image.width * image.height);
  const components = [];
  for (let startY = 0; startY < image.height; startY += 1) {
    for (let startX = 0; startX < image.width; startX += 1) {
      const startIndex = startY * image.width + startX;
      if (visited[startIndex] || alphaAt(image, startX, startY) < threshold)
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
            nextY < 0 ||
            nextX >= image.width ||
            nextY >= image.height
          )
            continue;
          const index = nextY * image.width + nextX;
          if (visited[index] || alphaAt(image, nextX, nextY) < threshold)
            continue;
          visited[index] = 1;
          queue.push([nextX, nextY]);
        }
      }
      components.push({
        area,
        x: left,
        y: top,
        width: right - left + 1,
        height: bottom - top + 1,
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2,
      });
    }
  }
  return components;
}

function spriteGridBounds(image, grid) {
  const expected = grid.rows * grid.columns;
  const primary = connectedComponents(image)
    .filter((component) => component.area >= 500)
    .sort((left, right) => right.area - left.area)
    .slice(0, expected)
    .sort((left, right) => left.centerY - right.centerY);
  if (primary.length !== expected) {
    throw new RangeError(
      `Expected ${expected} sprites, received ${primary.length}`,
    );
  }
  const ordered = [];
  for (let row = 0; row < grid.rows; row += 1) {
    ordered.push(
      ...primary
        .slice(row * grid.columns, (row + 1) * grid.columns)
        .sort((left, right) => left.centerX - right.centerX),
    );
  }
  return ordered;
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

function artworkBounds(image) {
  let left = image.width;
  let right = -1;
  let top = image.height;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4;
      const brightest = Math.max(
        image.data[index] ?? 0,
        image.data[index + 1] ?? 0,
        image.data[index + 2] ?? 0,
      );
      if (brightest < 18) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function prepareBase(manifest) {
  const source = readPng(path.join(sourceRoot, "base-architecture.png"));
  const base = resizeNearest(source, artworkBounds(source), {
    width: manifest.world.width,
    height: manifest.world.height,
  });
  writePng(path.join(publicRoot, "base.png"), base);
}

function tintActor(source, tint = [0, 0, 0]) {
  for (let index = 0; index < source.data.length; index += 4) {
    if ((source.data[index + 3] ?? 0) < 16) continue;
    source.data[index] = Math.max(
      0,
      Math.min(255, (source.data[index] ?? 0) + tint[0]),
    );
    source.data[index + 1] = Math.max(
      0,
      Math.min(255, (source.data[index + 1] ?? 0) + tint[1]),
    );
    source.data[index + 2] = Math.max(
      0,
      Math.min(255, (source.data[index + 2] ?? 0) + tint[2]),
    );
  }
  return source;
}

function prepareActor(member) {
  const agentId = member.id;
  const source = tintActor(
    readPng(
      path.join(
        sourceRoot,
        "actors",
        `${member.assetSourceId ?? agentId}-alpha.png`,
      ),
    ),
    member.assetTint,
  );
  const bounds = spriteGridBounds(source, atlasGrid);
  const atlas = new PNG({
    width: frame.width * atlasGrid.columns,
    height: frame.height * atlasGrid.rows,
  });
  bounds.forEach((item, index) => {
    const column = index % atlasGrid.columns;
    const scaledHeight = 144;
    const width = Math.min(
      128,
      Math.round((item.width * scaledHeight) / item.height),
    );
    const height = scaledHeight;
    const sprite = resizeNearest(source, item, { width, height });
    const row = Math.floor(index / atlasGrid.columns);
    const seated = column === 3;
    const direction = sourceDirections[row];
    if (!direction)
      throw new RangeError(`Missing actor direction for row ${row}`);
    const seatedTreatment = seatedFrameTreatment[direction];
    const copyHeight = seated ? height - seatedTreatment.lowerBodyCrop : height;
    if (seated) {
      sprite.data.fill(0, copyHeight * width * 4);
    }
    PNG.bitblt(
      sprite,
      atlas,
      0,
      0,
      width,
      copyHeight,
      column * frame.width + Math.floor((frame.width - width) / 2),
      row * frame.height +
        footBaseline -
        height +
        (seated ? seatedTreatment.verticalOffset : 0),
    );
  });
  writePng(path.join(publicRoot, "agents", `${agentId}.png`), atlas);
  const portraitBounds = bounds[0];
  if (!portraitBounds)
    throw new RangeError(`Missing portrait frame for ${agentId}`);
  const portraitHeight = 144;
  const portraitWidth = Math.min(
    176,
    Math.round((portraitBounds.width * portraitHeight) / portraitBounds.height),
  );
  const portraitSprite = resizeNearest(source, portraitBounds, {
    width: portraitWidth,
    height: portraitHeight,
  });
  const portrait = new PNG({ width: 192, height: 192 });
  PNG.bitblt(
    portraitSprite,
    portrait,
    0,
    0,
    portraitWidth,
    portraitHeight,
    Math.floor((portrait.width - portraitWidth) / 2),
    Math.floor((portrait.height - portraitHeight) / 2),
  );
  writePng(path.join(publicRoot, "portraits", `${agentId}.png`), portrait);
}

function prepareFurniture(manifest) {
  const source = readPng(path.join(sourceRoot, "furniture-alpha.png"));
  const bounds = spriteGridBounds(source, furnitureGrid);
  const manifestFacings = new Set(
    manifest.roster.map((member) => member.seat.facing),
  );
  const directionalAssets = new Map();
  bounds.forEach((item, index) => {
    const row = Math.floor(index / furnitureGrid.columns);
    const column = index % furnitureGrid.columns;
    const direction = sourceDirections[column];
    const kind = furnitureKinds[row];
    if (!direction || !kind || !manifestFacings.has(direction)) return;
    const scale = Math.min(104 / item.width, 104 / item.height);
    const width = Math.round(item.width * scale);
    const height = Math.round(item.height * scale);
    const sprite = resizeNearest(source, item, { width, height });
    const asset = new PNG({ width: 128, height: 128 });
    PNG.bitblt(
      sprite,
      asset,
      0,
      0,
      width,
      height,
      Math.floor((128 - width) / 2),
      Math.floor((128 - height) / 2),
    );
    writePng(
      path.join(publicRoot, "furniture", `${kind}-${direction}.png`),
      asset,
    );
    directionalAssets.set(`${kind}:${direction}`, asset);
  });
  const colors = areaColors(manifest);
  for (const member of manifest.roster) {
    const color = colors.get(member.departmentId);
    if (!color) throw new RangeError(`Missing furniture color ${member.id}`);
    for (const kind of furnitureKinds) {
      const asset = directionalAssets.get(`${kind}:${member.seat.facing}`);
      if (!asset)
        throw new RangeError(`Missing ${kind} facing ${member.seat.facing}`);
      writePng(
        path.join(publicRoot, "furniture", "seats", `${member.id}-${kind}.png`),
        tintFurniture(asset, color),
      );
    }
  }
}

function tintFurniture(source, color) {
  const target = new PNG({ width: source.width, height: source.height });
  source.data.copy(target.data);
  for (let index = 0; index < target.data.length; index += 4) {
    if ((target.data[index + 3] ?? 0) < 32) continue;
    target.data[index] = Math.round(
      (target.data[index] ?? 0) * 0.78 + color[0] * 0.22,
    );
    target.data[index + 1] = Math.round(
      (target.data[index + 1] ?? 0) * 0.78 + color[1] * 0.22,
    );
    target.data[index + 2] = Math.round(
      (target.data[index + 2] ?? 0) * 0.78 + color[2] * 0.22,
    );
  }
  return target;
}

function areaColors(manifest) {
  const palette = [
    [48, 190, 167],
    [86, 139, 235],
    [218, 149, 57],
    [211, 102, 122],
    [139, 111, 216],
  ];
  const areaIds = [...Object.keys(manifest.departments), "chair"];
  if (areaIds.length !== palette.length)
    throw new RangeError("Unexpected office area count");
  return new Map(areaIds.map((areaId, index) => [areaId, palette[index]]));
}

function makeMarker(color) {
  const marker = new PNG({ width: 96, height: 48 });
  for (let y = 8; y < 40; y += 1) {
    for (let x = 8; x < 88; x += 1) {
      const index = (y * marker.width + x) * 4;
      const border = x < 12 || x >= 84 || y < 12 || y >= 36;
      marker.data[index] = border ? 226 : color[0];
      marker.data[index + 1] = border ? 230 : color[1];
      marker.data[index + 2] = border ? 238 : color[2];
      marker.data[index + 3] = border ? 220 : 184;
    }
  }
  return marker;
}

function makeForumMarker() {
  const marker = new PNG({ width: 160, height: 160 });
  for (let y = 0; y < marker.height; y += 1) {
    for (let x = 0; x < marker.width; x += 1) {
      const distance = Math.hypot(x - 79.5, y - 79.5);
      if (distance < 48 || distance > 64) continue;
      const index = (y * marker.width + x) * 4;
      marker.data[index] = 127;
      marker.data[index + 1] = 146;
      marker.data[index + 2] = 184;
      marker.data[index + 3] = distance < 52 || distance > 60 ? 172 : 88;
    }
  }
  return marker;
}

function prepareMarkers(manifest) {
  areaColors(manifest).forEach((color, areaId) => {
    writePng(
      path.join(publicRoot, "furniture", `marker-${areaId}.png`),
      makeMarker(color),
    );
  });
  writePng(
    path.join(publicRoot, "furniture", "forum-marker.png"),
    makeForumMarker(),
  );
}

async function loadManifest() {
  const filePath = path.join(root, "src/research/officeSceneManifest.ts");
  const source = fs.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
  const manifestModule = await import(moduleUrl);
  const manifest = manifestModule.OFFICE_SCENE_MANIFEST;
  if (manifest?.version !== 8)
    throw new TypeError("Expected office scene manifest v8");
  return manifest;
}

const manifest = await loadManifest();
if (!actorsOnly) prepareBase(manifest);
for (const member of manifest.roster) prepareActor(member);
if (!actorsOnly) {
  prepareFurniture(manifest);
  prepareMarkers(manifest);
}
console.log(
  JSON.stringify({
    mode: actorsOnly ? "actors-only" : "all",
    manifestVersion: manifest.version,
    world: manifest.world,
    actors: manifest.roster.map((member) => member.id),
    departments: Object.keys(manifest.departments),
    publicRoot,
  }),
);
