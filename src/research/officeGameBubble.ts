import { Container, Graphics, Text } from "pixi.js";

export type ProgressBubble = {
  readonly container: Container;
  readonly surface: Graphics;
  readonly text: Text;
  readonly tail: Graphics;
};

export function bubbleDimensions(message: string): {
  readonly width: number;
  readonly height: number;
} {
  const glyphUnits = [...message].reduce(
    (total, glyph) =>
      total + ((glyph.codePointAt(0) ?? 0) > 0xff ? 1.15 : 0.72),
    0,
  );
  const width = Math.round(Math.min(212, Math.max(104, 34 + glyphUnits * 7)));
  const lineCapacity = Math.max(1, Math.floor((width - 22) / 7));
  const lines = Math.max(1, Math.ceil(glyphUnits / lineCapacity));
  return Object.freeze({
    width,
    height: Math.min(82, Math.max(48, 30 + lines * 14)),
  });
}

export function updateProgressBubble(
  bubble: ProgressBubble,
  message: string,
): void {
  const { width, height } = bubbleDimensions(message);
  bubble.surface
    .clear()
    .roundRect(-width / 2, -height - 8, width, height, 10)
    .fill({ color: 0xffffff, alpha: 0.97 })
    .stroke({ color: 0xcbd1d6, alpha: 1, width: 1 });
  bubble.text.style.wordWrapWidth = width - 22;
  bubble.text.position.set(0, -height / 2 - 8);
  bubble.text.text = message;
}

export function createProgressBubble(): ProgressBubble {
  const container = new Container();
  const surface = new Graphics();
  const tail = new Graphics()
    .poly([-7, -8, 7, -8, 0, 0])
    .fill({ color: 0xffffff, alpha: 0.97 })
    .stroke({ color: 0xcbd1d6, alpha: 1, width: 1 });
  const text = new Text({
    text: "",
    style: {
      align: "center",
      fill: 0x20272e,
      fontFamily: "Pretendard, sans-serif",
      fontSize: 10.5,
      fontWeight: "600",
      leading: 1,
      wordWrap: true,
      wordWrapWidth: 190,
    },
  });
  text.anchor.set(0.5, 0.5);
  container.addChild(surface, tail, text);
  container.visible = false;
  const bubble = { container, surface, text, tail };
  updateProgressBubble(bubble, "");
  return bubble;
}
