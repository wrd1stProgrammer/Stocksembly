import type { Cell, OfficeFacing } from "./officeSceneManifest";

export function facingToward(from: Cell, to: Cell): OfficeFacing {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX < 0 ? "left" : "right";
  }
  return deltaY < 0 ? "up" : "down";
}
