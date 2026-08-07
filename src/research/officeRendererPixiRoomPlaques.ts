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

function plaqueIcon(
  id: (typeof OFFICE_ROOM_PLAQUES)[number]["id"],
  accent: number,
): Container {
  const root = new Container();
  const badge = new Graphics()
    .roundRect(13, 10, 38, 46, 9)
    .fill({ color: 0x17232b, alpha: 0.96 })
    .stroke({ color: accent, width: 2, alpha: 0.96 });
  const icon = new Graphics();
  if (id === "market") {
    icon
      .moveTo(20, 42)
      .lineTo(27, 34)
      .lineTo(33, 37)
      .lineTo(43, 24)
      .stroke({ color: accent, width: 2.5 });
  } else if (id === "chair") {
    icon
      .moveTo(32, 20)
      .lineTo(43, 33)
      .lineTo(32, 46)
      .lineTo(21, 33)
      .closePath()
      .stroke({ color: accent, width: 2.2 })
      .circle(32, 33, 3)
      .fill({ color: accent });
  } else if (id === "company") {
    icon
      .moveTo(32, 20)
      .lineTo(43, 25)
      .lineTo(40, 39)
      .lineTo(32, 47)
      .lineTo(24, 39)
      .lineTo(21, 25)
      .closePath()
      .stroke({ color: accent, width: 2.2 });
  } else if (id === "financial") {
    icon
      .rect(21, 35, 5, 10)
      .rect(29, 28, 5, 17)
      .rect(37, 22, 5, 23)
      .fill({ color: accent });
  } else {
    icon
      .moveTo(32, 20)
      .lineTo(44, 44)
      .lineTo(20, 44)
      .closePath()
      .stroke({ color: accent, width: 2.2 })
      .moveTo(32, 27)
      .lineTo(32, 36)
      .moveTo(32, 40)
      .lineTo(32, 41)
      .stroke({ color: accent, width: 2.5 });
  }
  root.addChild(badge, icon);
  return root;
}

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

  const topRail = new Graphics()
    .roundRect(54, 10, spec.size.width - 68, 3, 1.5)
    .fill({ color: spec.accent, alpha: 0.88 });
  const icon = plaqueIcon(spec.id, spec.accent);
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
  name.position.set(62, 17);
  const scope = new Text({
    text: copy.scope,
    style: {
      fill: 0x667179,
      fontFamily: "Pretendard, sans-serif",
      fontSize: locale === "ko" ? 10.5 : 10,
      fontWeight: "600",
    },
  });
  scope.position.set(62, 37);
  root.addChild(frame, topRail, icon, name, scope);
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
