import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { officeAgentAssetPath } from "./officeAgentAssets";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

function frameBounds(image: PNG, row: number, column: number) {
  let left = 160;
  let right = -1;
  let top = 192;
  let bottom = -1;
  for (let y = 0; y < 192; y += 1) {
    for (let x = 0; x < 160; x += 1) {
      const alpha =
        image.data[
          ((row * 192 + y) * image.width + column * 160 + x) * 4 + 3
        ] ?? 0;
      if (alpha < 64) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return {
    centerX: (left + right) / 2,
    height: bottom - top + 1,
    top,
    bottom,
  };
}

describe("office v9 generated actor assets", () => {
  it("ships one normalized atlas for every manifest actor", () => {
    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      const publicPath = officeAgentAssetPath(member.id);
      expect(publicPath).toBe(`/research/office-v9/agents/${member.id}.png`);
      const image = PNG.sync.read(
        readFileSync(resolve(process.cwd(), "public", publicPath.slice(1))),
      );
      expect({ width: image.width, height: image.height }).toEqual({
        width: 640,
        height: 768,
      });
      expect(
        image.data.some((channel, index) => index % 4 === 3 && channel > 0),
      ).toBe(true);
    }
  });

  it("ships normalized chair directions and the walkable evidence forum", () => {
    const entities = [
      ["analyst-chair-down.png", 128, 128],
      ["analyst-chair-up.png", 128, 128],
      ["evidence-forum.png", 252, 174],
    ] as const;
    for (const [fileName, width, height] of entities) {
      const image = PNG.sync.read(
        readFileSync(
          resolve(
            process.cwd(),
            "public/research/office-v9/entities",
            fileName,
          ),
        ),
      );
      expect({ width: image.width, height: image.height }).toEqual({
        width,
        height,
      });
    }
  });

  it("ships one transparent table-only asset for every personal desk", () => {
    const image = PNG.sync.read(
      readFileSync(
        resolve(
          process.cwd(),
          "public/research/office-v9/entities/workstation-single-table.png",
        ),
      ),
    );
    const cornerAlpha = [
      image.data[3],
      image.data[(image.width - 1) * 4 + 3],
      image.data[(image.height - 1) * image.width * 4 + 3],
      image.data[(image.width * image.height - 1) * 4 + 3],
    ];
    expect(image.width).toBe(192);
    expect(image.height).toBe(112);
    expect(cornerAlpha.every((alpha) => alpha === 0)).toBe(true);
    expect(
      image.data.some((channel, index) => index % 4 === 3 && channel >= 220),
    ).toBe(true);
  });

  it("keeps walking frames uncropped and seated poses centered", () => {
    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      const image = PNG.sync.read(
        readFileSync(
          resolve(
            process.cwd(),
            "public/research/office-v9/agents",
            `${member.id}.png`,
          ),
        ),
      );
      for (let row = 0; row < 4; row += 1) {
        const standing = [0, 1, 2].map((column) =>
          frameBounds(image, row, column),
        );
        expect(standing.every(({ top }) => top >= 20)).toBe(true);
        expect(
          standing.every(({ bottom }) => bottom >= 174 && bottom <= 175),
        ).toBe(true);
        expect(
          Math.max(...standing.map(({ height }) => height)) -
            Math.min(...standing.map(({ height }) => height)),
        ).toBeLessThanOrEqual(10);
      }
      const frontSeat = frameBounds(image, 0, 3);
      const backSeat = frameBounds(image, 3, 3);
      expect(Math.abs(frontSeat.centerX - 79.5)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(backSeat.centerX - 79.5)).toBeLessThanOrEqual(0.5);
      expect(backSeat.height).toBeLessThan(frontSeat.height);
      expect(backSeat.bottom).toBeLessThan(160);
    }
  });
});
