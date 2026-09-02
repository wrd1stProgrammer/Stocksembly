import {
  AnimatedSprite,
  Application,
  Container,
  Graphics,
  Text,
  type Texture,
} from "pixi.js";
import { ACTOR_ATLAS, actorDisplayScale, actorFrame } from "./officeActorAtlas";
import {
  createAgentRuntime,
  type MutableAgentDisplayRuntime,
} from "./officeGameAgent";
import type { AnimationKey } from "./officeGameAnimations";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeFacing,
  type OfficeManifestAgentId,
} from "./officeSceneManifest";

const FACINGS: readonly OfficeFacing[] = ["down", "left", "right", "up"];
const CLOCKWISE: readonly OfficeFacing[] = ["right", "down", "left", "up"];
// Mirrors WALK_ANIMATION_SPEED in officeGameAgent.ts.
const DEFAULT_WALK_ANIMATION_SPEED = 0.15;
// The simulation crosses one 32px cell in two 50ms ticks.
const PX_PER_MS = OFFICE_SCENE_MANIFEST.world.cellSize / 100;
const LABEL_COLUMN = 176;
const GROUP_GAP = 26;
const HEADER_HEIGHT = 40;
const ROW_PADDING = 18;
const STRIP_SCALE = 0.5;
const MAX_CYCLE_FRAMES = 4;

export type WalkCycleMode = "stride" | "legacy";

export type OfficeMotionCatalogOptions = {
  readonly host: HTMLElement;
  readonly locale: "en" | "ko";
  readonly signal?: AbortSignal;
  // Height of any sticky chrome above the host so the canvas can stick
  // right below it while the page scrolls.
  readonly stickyTop?: () => number;
};

export type OfficeMotionCatalogController = {
  readonly ids: readonly OfficeManifestAgentId[];
  signal(id?: OfficeManifestAgentId): void;
  stop(): void;
  setScale(multiplier: number): void;
  setWalkCycle(mode: WalkCycleMode): void;
  setAnimationSpeed(speed: number): void;
  setMoveSpeed(multiplier: number): void;
  destroy(): void;
};

type RosterMember = (typeof OFFICE_SCENE_MANIFEST.roster)[number];

type CycleFrame = {
  readonly texture: Texture;
  readonly column: number;
};

type Walker = {
  readonly facing: OfficeFacing;
  readonly sprite: AnimatedSprite;
  readonly strip: readonly AnimatedSprite[];
  readonly stripLabels: readonly Text[];
  frameCount: number;
};

type Track = {
  phase: number;
  progress: number;
  active: boolean;
  facing: OfficeFacing;
};

type Row = {
  readonly member: RosterMember;
  readonly runtime: MutableAgentDisplayRuntime;
  readonly container: Container;
  readonly frames: Graphics;
  readonly label: Text;
  readonly walkCaption: Text;
  readonly idles: readonly AnimatedSprite[];
  readonly seats: readonly AnimatedSprite[];
  readonly walkers: readonly Walker[];
  readonly track: Track;
};

function pixelSprite(textures: readonly Texture[]): AnimatedSprite {
  const sprite = new AnimatedSprite([...textures]);
  sprite.anchor.set(
    ACTOR_ATLAS.footPivot.x / ACTOR_ATLAS.frame.width,
    ACTOR_ATLAS.footPivot.y / ACTOR_ATLAS.frame.height,
  );
  sprite.roundPixels = true;
  sprite.gotoAndStop(0);
  return sprite;
}

function cycleFrames(
  clips: MutableAgentDisplayRuntime["clips"],
  facing: OfficeFacing,
  mode: WalkCycleMode,
): CycleFrame[] {
  const walk = clips[`walk_${facing}` satisfies AnimationKey];
  // The shipped runtime clip, in atlas order (currently idle, A, B, A).
  const runtimeFrames = walk.map((texture, index) => ({
    texture,
    column: actorFrame("walk", facing, index).column,
  }));
  if (mode === "legacy") return runtimeFrames;
  // Proposal: alternate only the two authored strides (atlas columns 1 and 2).
  const strides = runtimeFrames.filter(
    (frame, index) =>
      runtimeFrames.findIndex((other) => other.column === frame.column) ===
        index && frame.column !== 0,
  );
  return strides.length >= 2 ? strides : runtimeFrames;
}

function caption(text: string, size = 12): Text {
  return new Text({
    text,
    style: {
      fill: 0x9aa3ad,
      fontFamily: "Pretendard, sans-serif",
      fontSize: size,
      fontWeight: "600",
    },
  });
}

export async function createOfficeMotionCatalog(
  options: OfficeMotionCatalogOptions,
): Promise<OfficeMotionCatalogController> {
  const app = new Application();
  await app.init({
    width: 1200,
    height: 400,
    background: 0x2b3038,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    roundPixels: true,
  });
  if (options.signal?.aborted) {
    app.destroy({ removeView: true }, { children: true });
    throw new DOMException("Motion catalog aborted", "AbortError");
  }
  // The catalog is far taller than any viewport, and a single WebGL canvas
  // that tall exceeds GPU texture limits on retina displays.  Keep the canvas
  // viewport-sized and sticky, and translate the stage with the page scroll.
  options.host.style.position = "relative";
  app.canvas.style.display = "block";
  app.canvas.style.position = "sticky";
  options.host.append(app.canvas);

  let scaleMultiplier: number = ACTOR_ATLAS.displayScale;
  let walkCycle: WalkCycleMode = "stride";
  let animationSpeed = DEFAULT_WALK_ANIMATION_SPEED;
  let moveMultiplier = 1;

  const headers = {
    idle: caption("서 있기 (idle) ↓ ← → ↑"),
    sit: caption("앉기 (sit) ↓ ← → ↑"),
    track: caption("신호 → 시계방향 걷기 (→ ↓ ← ↑)"),
  };
  app.stage.addChild(headers.idle, headers.sit, headers.track);

  const rows: Row[] = [];
  for (const member of OFFICE_SCENE_MANIFEST.roster) {
    const runtime = await createAgentRuntime(member, options.locale);
    if (options.signal?.aborted) break;
    const container = new Container();
    const frames = new Graphics();
    container.addChild(frames);
    const label = new Text({
      text: `${member.name.ko}\n${member.name.en} · ${member.id}`,
      style: {
        fill: 0xf2f3f5,
        fontFamily: "Pretendard, sans-serif",
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 18,
      },
    });
    const walkCaption = caption(
      "걷기 (walk) ↓ ← → ↑ — 위: 애니메이션 · 아래: 사이클 프레임 순서 (아틀라스 열 번호)",
    );
    container.addChild(label, walkCaption);
    const idles = FACINGS.map((facing) =>
      pixelSprite(runtime.clips[`idle_${facing}`]),
    );
    const seats = FACINGS.map((facing) =>
      pixelSprite(runtime.clips[`sit_${facing}`]),
    );
    const walkers: Walker[] = FACINGS.map((facing) => {
      const sequence = cycleFrames(runtime.clips, facing, walkCycle);
      const sprite = pixelSprite(sequence.map((frame) => frame.texture));
      sprite.animationSpeed = animationSpeed;
      sprite.play();
      const fallback = sequence[0]?.texture;
      if (fallback === undefined) {
        throw new RangeError(`No walk frames for ${member.id} ${facing}`);
      }
      const strip = Array.from({ length: MAX_CYCLE_FRAMES }, (_, index) =>
        pixelSprite([sequence[index]?.texture ?? fallback]),
      );
      const stripLabels = Array.from({ length: MAX_CYCLE_FRAMES }, () =>
        caption("", 11),
      );
      return {
        facing,
        sprite,
        strip,
        stripLabels,
        frameCount: sequence.length,
      };
    });
    for (const sprite of [...idles, ...seats]) container.addChild(sprite);
    for (const walker of walkers) {
      container.addChild(walker.sprite, ...walker.strip, ...walker.stripLabels);
    }
    container.addChild(runtime.body);
    runtime.sprite.textures = [...runtime.clips.idle_down];
    runtime.sprite.gotoAndStop(0);
    app.stage.addChild(container);
    rows.push({
      member,
      runtime,
      container,
      frames,
      label,
      walkCaption,
      idles,
      seats,
      walkers,
      track: { phase: 0, progress: 0, active: false, facing: "down" },
    });
  }

  const metrics = () => {
    const frameWidth = ACTOR_ATLAS.frame.width * scaleMultiplier;
    const standingHeight = ACTOR_ATLAS.frame.height * scaleMultiplier;
    const seatedHeight = standingHeight * ACTOR_ATLAS.seatedScaleMultiplier;
    const stripWidth = Math.ceil(frameWidth * STRIP_SCALE);
    const stripHeight = standingHeight * STRIP_SCALE;
    const cellWidth = Math.ceil(frameWidth) + 14;
    const walkCellWidth = Math.max(
      cellWidth,
      MAX_CYCLE_FRAMES * (stripWidth + 6) + 12,
    );
    const lineOneFeet = ROW_PADDING + seatedHeight;
    const lineOneHeight = lineOneFeet + ROW_PADDING;
    const walkFeet = lineOneHeight + 22 + standingHeight;
    const stripFeet = walkFeet + 10 + stripHeight;
    const rowHeight = stripFeet + 22 + ROW_PADDING;
    const staticGroupsWidth = cellWidth * 8 + GROUP_GAP;
    const walkGroupWidth = walkCellWidth * 4;
    const trackX =
      LABEL_COLUMN + Math.max(staticGroupsWidth, walkGroupWidth) + GROUP_GAP;
    const trackSide = Math.max(
      120,
      Math.min(rowHeight - standingHeight - ROW_PADDING * 2, 240),
    );
    const width = trackX + trackSide + Math.ceil(frameWidth) + 40;
    const height = HEADER_HEIGHT + rowHeight * rows.length + 12;
    return {
      frameWidth,
      standingHeight,
      seatedHeight,
      stripWidth,
      stripHeight,
      cellWidth,
      walkCellWidth,
      lineOneFeet,
      lineOneHeight,
      walkFeet,
      stripFeet,
      rowHeight,
      trackX,
      trackSide,
      width,
      height,
    };
  };

  const trackPosition = (row: Row, m: ReturnType<typeof metrics>) => {
    const originX = m.trackX + m.frameWidth / 2;
    const originY = ROW_PADDING + m.standingHeight;
    const corners = [
      { x: 0, y: 0 },
      { x: m.trackSide, y: 0 },
      { x: m.trackSide, y: m.trackSide },
      { x: 0, y: m.trackSide },
    ] as const;
    const directions = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
    ] as const;
    const phase = Math.min(row.track.phase, 3);
    const corner = corners[phase] ?? corners[0];
    const direction = directions[phase] ?? directions[0];
    return {
      x: originX + corner.x + direction.x * row.track.progress,
      y: originY + corner.y + direction.y * row.track.progress,
    };
  };

  const applyScale = (
    sprite: AnimatedSprite,
    mode: "idle" | "sit" | "walk",
    factor = 1,
  ) => {
    sprite.scale.set(
      actorDisplayScale(mode) *
        (scaleMultiplier / ACTOR_ATLAS.displayScale) *
        factor,
    );
  };

  const applyCycle = (row: Row, walker: Walker) => {
    const sequence = cycleFrames(row.runtime.clips, walker.facing, walkCycle);
    walker.sprite.textures = sequence.map((frame) => frame.texture);
    walker.sprite.animationSpeed = animationSpeed;
    walker.sprite.play();
    walker.frameCount = sequence.length;
    walker.strip.forEach((sprite, index) => {
      const frame = sequence[index];
      const label = walker.stripLabels[index];
      if (frame === undefined) {
        sprite.visible = false;
        if (label) label.visible = false;
        return;
      }
      sprite.visible = true;
      sprite.textures = [frame.texture];
      sprite.gotoAndStop(0);
      if (label) {
        label.visible = true;
        label.text = `열 ${frame.column}`;
      }
    });
  };

  let contentWidth = 0;
  let contentHeight = 0;
  const syncScroll = () => {
    const stickyTop = options.stickyTop?.() ?? 0;
    const viewportHeight = Math.max(240, window.innerHeight - stickyTop);
    const canvasHeight = Math.min(contentHeight, viewportHeight);
    if (
      app.renderer.width !== contentWidth ||
      app.renderer.height !== canvasHeight
    ) {
      app.renderer.resize(contentWidth, canvasHeight);
    }
    app.canvas.style.top = `${stickyTop}px`;
    options.host.style.height = `${contentHeight}px`;
    options.host.style.width = `${contentWidth}px`;
    const hostTop = options.host.getBoundingClientRect().top + window.scrollY;
    const offset = Math.min(
      Math.max(window.scrollY + stickyTop - hostTop, 0),
      Math.max(contentHeight - canvasHeight, 0),
    );
    app.stage.position.y = -Math.round(offset);
  };
  window.addEventListener("scroll", syncScroll, { passive: true });
  window.addEventListener("resize", syncScroll);

  const layout = () => {
    const m = metrics();
    contentWidth = m.width;
    contentHeight = m.height;
    syncScroll();
    headers.idle.position.set(LABEL_COLUMN, 12);
    headers.sit.position.set(LABEL_COLUMN + m.cellWidth * 4 + GROUP_GAP, 12);
    headers.track.position.set(m.trackX, 12);
    rows.forEach((row, index) => {
      row.container.position.set(0, HEADER_HEIGHT + index * m.rowHeight);
      row.label.position.set(14, Math.round(m.rowHeight / 2) - 18);
      row.frames.clear();
      row.frames
        .rect(0, 0, m.width, m.rowHeight)
        .fill({ color: index % 2 === 0 ? 0x2b3038 : 0x30363f });
      // Line one: idle and seated frames.
      const lineOne: readonly {
        sprites: readonly AnimatedSprite[];
        mode: "idle" | "sit";
        x: number;
      }[] = [
        { sprites: row.idles, mode: "idle", x: LABEL_COLUMN },
        {
          sprites: row.seats,
          mode: "sit",
          x: LABEL_COLUMN + m.cellWidth * 4 + GROUP_GAP,
        },
      ];
      for (const group of lineOne) {
        group.sprites.forEach((sprite, cell) => {
          applyScale(sprite, group.mode);
          sprite.position.set(
            Math.round(group.x + cell * m.cellWidth + m.frameWidth / 2),
            Math.round(m.lineOneFeet),
          );
          row.frames
            .rect(
              group.x + cell * m.cellWidth,
              ROW_PADDING - 8,
              m.cellWidth - 6,
              m.lineOneHeight - ROW_PADDING + 2,
            )
            .stroke({ color: 0x3f4753, width: 1 });
        });
      }
      // Line two: walk animation with its frame sequence underneath.
      row.walkCaption.position.set(LABEL_COLUMN, m.lineOneHeight + 4);
      row.walkers.forEach((walker, cell) => {
        const x = LABEL_COLUMN + cell * m.walkCellWidth;
        applyScale(walker.sprite, "walk");
        walker.sprite.position.set(
          Math.round(x + m.walkCellWidth / 2),
          Math.round(m.walkFeet),
        );
        const stripTotal = walker.frameCount * (m.stripWidth + 6);
        const stripStart = x + (m.walkCellWidth - 6 - stripTotal) / 2;
        walker.strip.forEach((sprite, frameIndex) => {
          applyScale(sprite, "walk", STRIP_SCALE);
          const cx =
            stripStart + frameIndex * (m.stripWidth + 6) + m.stripWidth / 2;
          sprite.position.set(Math.round(cx), Math.round(m.stripFeet));
          const label = walker.stripLabels[frameIndex];
          if (label) {
            label.anchor.set(0.5, 0);
            label.position.set(Math.round(cx), Math.round(m.stripFeet + 4));
          }
        });
        row.frames
          .rect(
            x,
            m.lineOneHeight + 20,
            m.walkCellWidth - 6,
            m.rowHeight - m.lineOneHeight - 20 - ROW_PADDING + 6,
          )
          .stroke({ color: 0x3f4753, width: 1 });
      });
      // Track outline (feet path).
      row.frames
        .rect(
          m.trackX + m.frameWidth / 2,
          ROW_PADDING + m.standingHeight,
          m.trackSide,
          m.trackSide,
        )
        .stroke({ color: 0x5a6675, width: 1, alpha: 0.9 });
      applyScale(row.runtime.sprite, row.track.active ? "walk" : "idle");
      const position = trackPosition(row, m);
      row.runtime.body.position.set(
        Math.round(position.x),
        Math.round(position.y),
      );
    });
  };

  const setTrackFacing = (row: Row, facing: OfficeFacing, walking: boolean) => {
    row.track.facing = facing;
    row.runtime.sprite.textures = walking
      ? cycleFrames(row.runtime.clips, facing, walkCycle).map(
          (frame) => frame.texture,
        )
      : [...row.runtime.clips[`idle_${facing}`]];
    applyScale(row.runtime.sprite, walking ? "walk" : "idle");
    if (walking) {
      row.runtime.sprite.animationSpeed = animationSpeed;
      row.runtime.sprite.gotoAndPlay(0);
    } else {
      row.runtime.sprite.gotoAndStop(0);
    }
  };

  const startTrack = (row: Row) => {
    row.track.phase = 0;
    row.track.progress = 0;
    row.track.active = true;
    setTrackFacing(row, CLOCKWISE[0] ?? "right", true);
  };

  const stopTrack = (row: Row) => {
    row.track.phase = 0;
    row.track.progress = 0;
    row.track.active = false;
    setTrackFacing(row, "down", false);
  };

  const tick = (ticker: { readonly deltaMS: number }) => {
    const m = metrics();
    for (const row of rows) {
      if (!row.track.active) continue;
      row.track.progress += ticker.deltaMS * PX_PER_MS * moveMultiplier;
      while (row.track.progress >= m.trackSide && row.track.active) {
        row.track.progress -= m.trackSide;
        row.track.phase += 1;
        if (row.track.phase >= CLOCKWISE.length) {
          stopTrack(row);
        } else {
          setTrackFacing(row, CLOCKWISE[row.track.phase] ?? "down", true);
        }
      }
      const position = trackPosition(row, m);
      row.runtime.body.position.set(
        Math.round(position.x),
        Math.round(position.y),
      );
    }
  };
  app.ticker.add(tick);
  for (const row of rows)
    for (const walker of row.walkers) applyCycle(row, walker);
  layout();

  return {
    ids: rows.map((row) => row.member.id),
    signal(id) {
      for (const row of rows) {
        if (id === undefined || row.member.id === id) startTrack(row);
      }
    },
    stop() {
      for (const row of rows) stopTrack(row);
    },
    setScale(multiplier) {
      scaleMultiplier = multiplier;
      layout();
    },
    setWalkCycle(mode) {
      walkCycle = mode;
      for (const row of rows) {
        for (const walker of row.walkers) applyCycle(row, walker);
        if (row.track.active) setTrackFacing(row, row.track.facing, true);
      }
      layout();
    },
    setAnimationSpeed(speed) {
      animationSpeed = speed;
      for (const row of rows) {
        for (const walker of row.walkers) walker.sprite.animationSpeed = speed;
        row.runtime.sprite.animationSpeed = speed;
      }
    },
    setMoveSpeed(multiplier) {
      moveMultiplier = multiplier;
    },
    destroy() {
      window.removeEventListener("scroll", syncScroll);
      window.removeEventListener("resize", syncScroll);
      app.ticker.remove(tick);
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
