import { describe, expect, it } from "vitest";
import {
  constrainFreeCamera,
  officeRendererResolution,
  zoomFreeCameraAt,
} from "./officeGame";

describe("office renderer density", () => {
  it("uses device density while capping the production bitmap at two times", () => {
    expect(officeRendererResolution(1)).toBe(1);
    expect(officeRendererResolution(1.5)).toBe(1.5);
    expect(officeRendererResolution(3)).toBe(2);
  });

  it("keeps free pan and zoom inside the office world", () => {
    const viewport = { width: 390, height: 320 };
    const camera = constrainFreeCamera(
      {
        mode: "focus",
        x: 500,
        y: 500,
        scale: 1.2,
        activeBounds: { left: 0, top: 0, right: 100, bottom: 100 },
        visibleWorldBounds: { left: 0, top: 0, right: 100, bottom: 100 },
      },
      viewport,
    );
    const zoomed = zoomFreeCameraAt(camera, viewport, { x: 195, y: 160 }, 10);

    expect(camera.x).toBeLessThanOrEqual(0);
    expect(camera.y).toBeLessThanOrEqual(0);
    expect(zoomed.scale).toBe(2.4);
    expect(zoomed.visibleWorldBounds.left).toBeGreaterThanOrEqual(0);
    expect(zoomed.visibleWorldBounds.top).toBeGreaterThanOrEqual(0);
  });
});
