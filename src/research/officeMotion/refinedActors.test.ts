import { expect, it, vi } from "vitest";
import { refinedAtlas } from "./refinedActors";

it.each([
  [0, 0],
  [640, 0],
  [0, 640],
])(
  "skips an unavailable image of size %s x %s before reading canvas pixels",
  (width, height) => {
    const image = new Image();
    Object.defineProperties(image, {
      naturalWidth: { value: width },
      naturalHeight: { value: height },
    });
    const create = vi.spyOn(document, "createElement");
    try {
      expect(refinedAtlas(image)).toBeUndefined();
      expect(create).not.toHaveBeenCalled();
    } finally {
      create.mockRestore();
    }
  },
);
