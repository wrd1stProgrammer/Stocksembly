import { Container, Graphics, Text } from "pixi.js";

const TYPEWRITER_CHARACTER_MS = 12;
const WORD_LINE_HEIGHT = 14;
const WORD_SPACE_WIDTH = 4;

type BubbleWord = {
  readonly display: Text;
  readonly restingY: number;
  readonly glyphs: readonly string[];
  readonly startIndex: number;
};

export type ProgressBubble = {
  readonly container: Container;
  readonly surface: Graphics;
  readonly wordLayer: Container;
  readonly tail: Graphics;
  words: BubbleWord[];
  message: string;
};

export function typewriterCharacterCount(
  elapsedMs: number,
  reducedMotion = false,
): number {
  if (reducedMotion) return Number.MAX_SAFE_INTEGER;
  return Math.floor(Math.max(0, elapsedMs) / TYPEWRITER_CHARACTER_MS);
}

function bubbleWordTokens(message: string): readonly string[] {
  return Object.freeze(
    message
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .flatMap((word) => {
        const glyphs = [...word];
        const containsWideGlyph = glyphs.some(
          (glyph) => (glyph.codePointAt(0) ?? 0) > 0xff,
        );
        const limit = containsWideGlyph ? 16 : 26;
        const chunks: string[] = [];
        for (let index = 0; index < glyphs.length; index += limit)
          chunks.push(glyphs.slice(index, index + limit).join(""));
        return chunks;
      }),
  );
}

function createBubbleWord(value: string): Text {
  const word = new Text({
    text: value,
    style: {
      align: "center",
      fill: 0x20272e,
      fontFamily: "Pretendard, sans-serif",
      fontSize: 10.5,
      fontWeight: "600",
      leading: 1,
    },
  });
  word.anchor.set(0, 0.5);
  return word;
}

function replaceBubbleWords(
  bubble: ProgressBubble,
  message: string,
  width: number,
  height: number,
): void {
  for (const child of bubble.wordLayer.removeChildren()) child.destroy();
  const lines: {
    display: Text;
    glyphs: readonly string[];
    startIndex: number;
    width: number;
  }[][] = [[]];
  const lineWidths: number[] = [0];
  let characterIndex = 0;
  for (const token of bubbleWordTokens(message)) {
    const display = createBubbleWord(token);
    const glyphs = Object.freeze([...token]);
    const entry = {
      display,
      glyphs,
      startIndex: characterIndex,
      width: display.width,
    };
    characterIndex += glyphs.length + 1;
    const currentLineIndex = lines.length - 1;
    const currentLine = lines[currentLineIndex];
    if (currentLine === undefined) continue;
    const currentWidth = lineWidths[currentLineIndex] ?? 0;
    const gap = currentLine.length === 0 ? 0 : WORD_SPACE_WIDTH;
    if (
      currentLine.length > 0 &&
      currentWidth + gap + display.width > width - 22
    ) {
      lines.push([entry]);
      lineWidths.push(display.width);
    } else {
      currentLine.push(entry);
      lineWidths[currentLineIndex] = currentWidth + gap + display.width;
    }
  }
  const contentHeight = lines.length * WORD_LINE_HEIGHT;
  const centerY = -height / 2 - 8;
  const words: BubbleWord[] = [];
  for (const [lineIndex, line] of lines.entries()) {
    const lineWidth = lineWidths[lineIndex] ?? 0;
    let cursorX = -lineWidth / 2;
    const restingY =
      centerY - contentHeight / 2 + WORD_LINE_HEIGHT * (lineIndex + 0.5);
    for (const entry of line) {
      entry.display.position.set(cursorX, restingY);
      entry.display.text = "";
      bubble.wordLayer.addChild(entry.display);
      words.push({
        display: entry.display,
        restingY,
        glyphs: entry.glyphs,
        startIndex: entry.startIndex,
      });
      cursorX += entry.width + WORD_SPACE_WIDTH;
    }
  }
  bubble.words = words;
}

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
  const lines = Math.min(
    5,
    Math.max(1, Math.ceil(glyphUnits / (lineCapacity * 0.82))),
  );
  return Object.freeze({
    width,
    height: Math.min(100, Math.max(48, 30 + lines * 14)),
  });
}

export function updateProgressBubble(
  bubble: ProgressBubble,
  message: string,
): void {
  if (bubble.message === message) return;
  const { width, height } = bubbleDimensions(message);
  bubble.surface
    .clear()
    .roundRect(-width / 2 + 3, -height - 4, width, height, 10)
    .fill({ color: 0x0b151d, alpha: 0.22 })
    .roundRect(-width / 2, -height - 8, width, height, 10)
    .fill({ color: 0xffffff, alpha: 0.97 })
    .stroke({ color: 0xaebdc4, alpha: 1, width: 1 });
  bubble.message = message;
  replaceBubbleWords(bubble, message, width, height);
}

export function renderProgressBubbleTyping(
  bubble: ProgressBubble,
  elapsedMs: number,
  reducedMotion = false,
): void {
  const visibleCharacters = typewriterCharacterCount(elapsedMs, reducedMotion);
  for (const word of bubble.words) {
    const visibleWordCharacters = Math.min(
      word.glyphs.length,
      Math.max(0, visibleCharacters - word.startIndex),
    );
    word.display.text = word.glyphs.slice(0, visibleWordCharacters).join("");
    word.display.position.y = word.restingY;
  }
}

export function createProgressBubble(): ProgressBubble {
  const container = new Container();
  const surface = new Graphics();
  const wordLayer = new Container();
  const tail = new Graphics()
    .poly([-7, -8, 7, -8, 0, 0])
    .fill({ color: 0xffffff, alpha: 0.97 })
    .stroke({ color: 0xcbd1d6, alpha: 1, width: 1 });
  container.addChild(surface, tail, wordLayer);
  container.visible = false;
  const bubble: ProgressBubble = {
    container,
    surface,
    wordLayer,
    tail,
    words: [],
    message: "\u0000",
  };
  updateProgressBubble(bubble, "");
  return bubble;
}
