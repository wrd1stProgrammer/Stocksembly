import {
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
} from "pixi.js";
import type { Locale } from "../lib/i18n";
import {
  localizedRoomPlaque,
  OFFICE_ROOM_PLAQUE_ASSET,
  OFFICE_ROOM_PLAQUES,
} from "./officeRoomPlaques";

const PLAQUE_WORLD_DEPTH = 1_000;

function createPlaque(
  texture: Texture,
  spec: (typeof OFFICE_ROOM_PLAQUES)[number],
  locale: Locale,
): Container {
  const root = new Container();
  root.label = `room-plaque-${spec.id}`;
  root.position.set(spec.position.x, spec.position.y);
  root.zIndex = PLAQUE_WORLD_DEPTH;

  const frame = new Sprite(texture);
  frame.width = spec.size.width;
  frame.height = spec.size.height;

  const accent = new Graphics()
    .roundRect(17, 13, 5, spec.size.height - 26, 2.5)
    .fill({ color: spec.accent });
  const copy = localizedRoomPlaque(spec, locale);
  const name = new Text({
    text: copy.name,
    style: {
      fill: 0x20282d,
      fontFamily: "Pretendard, sans-serif",
      fontSize: locale === "ko" ? 14 : 13,
      fontWeight: "800",
      letterSpacing: locale === "ko" ? 0 : 1.1,
    },
  });
  name.position.set(32, 13);
  const scope = new Text({
    text: copy.scope,
    style: {
      fill: 0x667179,
      fontFamily: "Pretendard, sans-serif",
      fontSize: locale === "ko" ? 10.5 : 10,
      fontWeight: "600",
    },
  });
  scope.position.set(32, 34);
  root.addChild(frame, accent, name, scope);
  return root;
}

export async function createOfficeRoomPlaques(
  world: Container,
  locale: Locale,
): Promise<readonly Container[]> {
  const texture = await Assets.load<Texture>(OFFICE_ROOM_PLAQUE_ASSET);
  texture.source.scaleMode = "linear";
  const plaques = OFFICE_ROOM_PLAQUES.map((spec) =>
    createPlaque(texture, spec, locale),
  );
  world.addChild(...plaques);
  return Object.freeze(plaques);
}
