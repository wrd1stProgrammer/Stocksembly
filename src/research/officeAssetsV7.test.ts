import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

const publicRoot = path.join(process.cwd(), "public/research/office-v7");
const sourceRoot = path.join(
  process.cwd(),
  "assets/research/office-v7-sources",
);
const furnitureKinds = ["chair", "desk", "monitor"] as const;
const v7SeatFacings = {
  market: "up",
  market_news: "up",
  benchmark: "up",
  company: "up",
  company_product: "up",
  company_competition: "right",
  financial: "down",
  valuation: "down",
  financial_quality: "left",
  risk: "down",
  risk_policy: "down",
  chair: "up",
} as const;

function readPng(root: string, relativePath: string): PNG {
  return PNG.sync.read(fs.readFileSync(path.join(root, relativePath)));
}

function alphaAt(image: PNG, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3] ?? 0;
}

function isWhiteAt(image: PNG, x: number, y: number): boolean {
  const index = (y * image.width + x) * 4;
  return (
    (image.data[index] ?? 0) >= 245 &&
    (image.data[index + 1] ?? 0) >= 245 &&
    (image.data[index + 2] ?? 0) >= 245
  );
}

function alphaChannel(image: PNG): Uint8Array {
  const alpha = new Uint8Array(image.width * image.height);
  for (let source = 3, target = 0; source < image.data.length; source += 4) {
    alpha[target] = image.data[source] ?? 0;
    target += 1;
  }
  return alpha;
}

function edgePixels(image: PNG): readonly (readonly [number, number])[] {
  const points: Array<readonly [number, number]> = [];
  for (let x = 0; x < image.width; x += 1) {
    points.push([x, 0], [x, image.height - 1]);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    points.push([0, y], [image.width - 1, y]);
  }
  return points;
}

function expectV7BaseDimensions(image: PNG): void {
  expect({ width: image.width, height: image.height }).toEqual({
    width: 1920,
    height: 1080,
  });
}

describe("office v7 raster assets", () => {
  it("matches the manifest world with a full-bleed architecture base", () => {
    // Given
    const base = readPng(publicRoot, "base.png");

    // When
    const edge = edgePixels(base);

    // Then
    expectV7BaseDimensions(base);
    expect(edge.every(([x, y]) => alphaAt(base, x, y) === 255)).toBe(true);
    expect(edge.some(([x, y]) => isWhiteAt(base, x, y))).toBe(false);
  });

  it("decodes every manifest-derived actor, portrait, and furniture path", () => {
    // Given
    const manifestFacings = new Set(["down", "left", "right", "up"] as const);

    // When
    const decoded = [
      ...OFFICE_SCENE_MANIFEST.roster.flatMap((member) => [
        readPng(publicRoot, `agents/${member.id}.png`),
        readPng(publicRoot, `portraits/${member.id}.png`),
      ]),
      ...[...manifestFacings].flatMap((facing) =>
        furnitureKinds.map((kind) =>
          readPng(publicRoot, `furniture/${kind}-${facing}.png`),
        ),
      ),
      ...OFFICE_SCENE_MANIFEST.roster.flatMap((member) =>
        furnitureKinds.map((kind) =>
          readPng(publicRoot, `furniture/seats/${member.id}-${kind}.png`),
        ),
      ),
      ...Object.keys(OFFICE_SCENE_MANIFEST.departments).map((departmentId) =>
        readPng(publicRoot, `furniture/marker-${departmentId}.png`),
      ),
      readPng(publicRoot, "furniture/marker-chair.png"),
      readPng(publicRoot, "furniture/forum-marker.png"),
    ];

    // Then
    expect(decoded).toHaveLength(
      OFFICE_SCENE_MANIFEST.roster.length * 2 +
        manifestFacings.size * furnitureKinds.length +
        OFFICE_SCENE_MANIFEST.roster.length * furnitureKinds.length +
        Object.keys(OFFICE_SCENE_MANIFEST.departments).length +
        2,
    );
    expect(decoded.every((image) => image.width > 0 && image.height > 0)).toBe(
      true,
    );
  });

  it("keeps all generated furniture transparent and clear of file edges", () => {
    // Given
    const manifestFacings = new Set(["down", "left", "right", "up"] as const);
    const furniture = [...manifestFacings].flatMap((facing) =>
      furnitureKinds.map((kind) =>
        readPng(publicRoot, `furniture/${kind}-${facing}.png`),
      ),
    );

    // When
    const edgeAlpha = furniture.map((image) =>
      edgePixels(image).map(([x, y]) => alphaAt(image, x, y)),
    );

    // Then
    expect(furniture.every((image) => image.width === 128)).toBe(true);
    expect(furniture.every((image) => image.height === 128)).toBe(true);
    expect(edgeAlpha.every((values) => Math.max(...values) === 0)).toBe(true);
  });

  it("derives every tinted seat object from its manifest facing", () => {
    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      for (const kind of furnitureKinds) {
        // Given
        const directional = readPng(
          publicRoot,
          `furniture/${kind}-${v7SeatFacings[member.id]}.png`,
        );
        const seat = readPng(
          publicRoot,
          `furniture/seats/${member.id}-${kind}.png`,
        );

        // When / Then
        expect(alphaChannel(seat)).toEqual(alphaChannel(directional));
      }
    }
  });

  it("retains one selected source set for every manifest actor", () => {
    // Given
    const expected = OFFICE_SCENE_MANIFEST.roster.flatMap((member) => {
      const sourceId =
        "assetSourceId" in member ? member.assetSourceId : member.id;
      return [
        `actors/${sourceId}-chroma.png`,
        `actors/${sourceId}-alpha.png`,
      ];
    });

    // When
    const sourceImages = [
      readPng(sourceRoot, "base-architecture.png"),
      readPng(sourceRoot, "furniture-chroma.png"),
      readPng(sourceRoot, "furniture-alpha.png"),
      ...expected.map((relativePath) => readPng(sourceRoot, relativePath)),
    ];

    // Then
    expect(sourceImages).toHaveLength(
      OFFICE_SCENE_MANIFEST.roster.length * 2 + 3,
    );
  });

  it("gives the benchmark analyst a distinct source character", () => {
    // Given
    const benchmark = OFFICE_SCENE_MANIFEST.roster.find(
      (member) => member.id === "benchmark",
    );

    // When
    const sourceId =
      benchmark && "assetSourceId" in benchmark
        ? benchmark.assetSourceId
        : benchmark?.id;

    // Then
    expect(sourceId).toBe("benchmark");
  });

  it("gives the research chair a distinct source character", () => {
    // Given
    const chair = OFFICE_SCENE_MANIFEST.roster.find(
      (member) => member.id === "chair",
    );

    // When
    const sourceId =
      chair && "assetSourceId" in chair ? chair.assetSourceId : chair?.id;

    // Then
    expect(sourceId).toBe("chair");
  });

  it("rejects the v6 base when evaluated against the v7 world", () => {
    // Given
    const legacy = readPng(
      path.join(process.cwd(), "public/research/office-v6"),
      "base.png",
    );

    // When / Then
    expect(() => expectV7BaseDimensions(legacy)).toThrow();
  });
});
