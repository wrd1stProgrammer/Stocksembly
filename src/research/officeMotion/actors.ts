import type { Arm, SheetPose } from "./actorParts";
import {
  ACTOR_SCALE,
  drawArm,
  drawHand,
  drawPaper,
  drawShadow,
  ROW,
  spriteParts,
} from "./actorParts";
import { surface } from "./actorTextures";
import type {
  Action,
  ActorDefinition,
  ActorFrame,
  Assets,
  Facing,
} from "./types";

type Gesture = {
  readonly left: readonly [number, number];
  readonly right: readonly [number, number];
  readonly lean: number;
  readonly nod: number;
  readonly paper: boolean;
};
const TAU = Math.PI * 2;
const CONTACTS = [0, 1, 0, 2] as const;
const BASELINE_WALK = [0, 1, 2, 1] as const;
const SIDE: Readonly<Record<Facing, number>> = {
  down: 0,
  up: 0,
  left: -1,
  right: 1,
};
const gaitColumn = (gait: number): number =>
  CONTACTS[Math.floor(((((gait / TAU) % 1) + 1) % 1) * 4)] ?? 0;
const smooth = (value: number): number => {
  const p = Math.min(1, Math.max(0, value));
  return p * p * (3 - 2 * p);
};
function seatedAmount(actor: ActorFrame): number {
  if (actor.action === "sit") return smooth(actor.progress);
  if (actor.action === "stand") return 1 - smooth(actor.progress);
  return actor.seated ? 1 : 0;
}
function gesture(actor: ActorFrame, time: number, neck: number): Gesture {
  const pulse = Math.sin(time * 8);
  const slow = Math.sin(time * 2.4);
  const rest: Gesture = {
    left: [-23, neck + 42],
    right: [23, neck + 42],
    lean: 0,
    nod: 0,
    paper: false,
  };
  switch (actor.action) {
    case "typing":
      return {
        left: [-10, -43 + pulse * 1.5],
        right: [10, -43 - pulse * 1.5],
        lean: 0,
        nod: 0.025,
        paper: false,
      };
    case "read":
      return {
        left: [-14, -42],
        right: [14, -42],
        lean: slow * 0.5,
        nod: 0.07 + slow * 0.012,
        paper: true,
      };
    case "write":
      return {
        left: [-14, -42],
        right: [5 + Math.sin(time * 9) * 2, -47 + Math.cos(time * 6)],
        lean: 1,
        nod: 0.07,
        paper: true,
      };
    case "discover":
      return {
        left: [-14, -42],
        right: [20, -53 - smooth(actor.progress) * 6],
        lean: Math.sin(actor.progress * Math.PI) * 5,
        nod: -0.045,
        paper: true,
      };
    case "carry":
      return {
        left: [-14, neck + 39],
        right: [14, neck + 39],
        lean: 0,
        nod: -0.018,
        paper: true,
      };
    case "present":
      return {
        left: [-14, neck + 39],
        right: [
          34 + slow * 4,
          neck + 20 - Math.sin(actor.progress * Math.PI) * 7,
        ],
        lean: 1.5,
        nod: -0.025,
        paper: actor.evidence,
      };
    case "challenge":
      return {
        left: [-18, neck + 38],
        right: [31, neck + 9 + slow * 2],
        lean: 2,
        nod: -0.05,
        paper: false,
      };
    case "agree":
      return {
        ...rest,
        left: [-13, neck + 35],
        right: [13, neck + 35],
        nod: Math.sin(actor.progress * Math.PI * 4) * 0.065,
      };
    case "listen":
      return {
        ...rest,
        left: [-13, neck + 35],
        right: [13, neck + 35],
        nod: slow * 0.015,
      };
    case "sit":
      return {
        ...rest,
        left: [-22, neck + 31],
        right: [22, neck + 31],
        lean: Math.sin(actor.progress * Math.PI) * 3,
        nod: 0.035,
      };
    case "stand":
      return {
        ...rest,
        left: [-22, neck + 31],
        right: [22, neck + 31],
        lean: Math.sin(actor.progress * Math.PI) * 4,
        nod: 0.045,
      };
    case "idle":
    case "walk":
    case "turn":
      return rest;
    default:
      return actor.action satisfies never;
  }
}
function sheetPose(
  actor: ActorFrame,
  pose: Gesture,
  neck: number,
): SheetPose | null {
  if (!pose.paper) return null;
  const side = SIDE[actor.facing];
  return {
    x: side * 25,
    y:
      actor.action === "carry" || actor.action === "present"
        ? neck + (side ? 24 : 32)
        : -49,
    width: side ? 15 : 28,
    height: 25,
    angle: actor.action === "write" ? -0.08 : side * 0.08,
  };
}
function head(
  context: CanvasRenderingContext2D,
  parts: ReturnType<typeof spriteParts>,
  actor: ActorFrame,
  pose: Gesture,
  neck: number,
): void {
  const image = parts.heads.get(actor.headFacing);
  if (!image) return;
  context.save();
  context.translate(pose.lean, neck + Math.abs(pose.nod) * 4);
  context.rotate(pose.nod);
  context.drawImage(image, -80, -96);
  context.restore();
}
function arm(
  pose: Gesture,
  actor: ActorFrame,
  neck: number,
  right: boolean,
  sheet: SheetPose | null,
): Arm {
  const side = SIDE[actor.facing];
  const sign = right ? 1 : -1;
  const width = side ? 0.55 : 1;
  const target = right ? pose.right : pose.left;
  let hand: readonly [number, number] = [
    target[0] * (side ? 0.6 : 1) + side * 16,
    target[1],
  ];
  const grips =
    sheet !== null &&
    (!right ||
      (actor.action !== "write" &&
        actor.action !== "present" &&
        actor.action !== "discover"));
  const gripEdge = side ? -sign : sign;
  if (sheet && grips) {
    const x = (gripEdge * sheet.width) / 2;
    const y = 7;
    hand = [
      sheet.x + x * Math.cos(sheet.angle) - y * Math.sin(sheet.angle),
      sheet.y + x * Math.sin(sheet.angle) + y * Math.cos(sheet.angle),
    ];
  } else if (sheet && right && actor.action === "write") {
    hand = [sheet.x + target[0] * (side ? 0.4 : 1), sheet.y + target[1] + 49];
  }
  if (side) {
    const near = side > 0 === right;
    const expressive =
      actor.action === "present" ||
      actor.action === "challenge" ||
      actor.action === "discover";
    if (!sheet && !expressive) {
      hand = [
        side * (actor.action === "typing" ? (near ? 18 : 24) : near ? 3 : 7) +
          pose.lean,
        Math.min(target[1], neck + 38),
      ];
    }
    const shoulder: readonly [number, number] = [
      side * (near ? 0 : 4) + pose.lean,
      neck + 8,
    ];
    let elbow: readonly [number, number] = [
      side * (near ? -2 : 4) + pose.lean,
      Math.min(neck + 27, hand[1] + 4),
    ];
    if (expressive && !grips)
      hand = [side * (14 + Math.abs(target[0]) * 0.55) + pose.lean, target[1]];
    if (grips || expressive) {
      const dx = hand[0] - shoulder[0],
        dy = hand[1] - shoulder[1];
      const distance = Math.max(1, Math.hypot(dx, dy));
      const reach = Math.min(distance, 38);
      const ux = dx / distance,
        uy = dy / distance;
      if (expressive && !grips)
        hand = [shoulder[0] + ux * reach, shoulder[1] + uy * reach];
      const along = (19 * 19 - 20 * 20 + reach * reach) / (2 * reach);
      const bend = Math.sqrt(Math.max(0, 19 * 19 - along * along));
      elbow = [
        shoulder[0] + ux * along - side * uy * bend,
        shoulder[1] + uy * along + side * ux * bend,
      ];
    }
    return {
      shoulder,
      elbow,
      hand,
      grip: grips ? gripEdge : 0,
      articulated: true,
    };
  }
  return {
    shoulder: [sign * 15 * width + pose.lean, neck],
    elbow: [
      sign * 22 * width + side * 7 + pose.lean * 0.5,
      Math.min(neck + 29, hand[1] + 9),
    ],
    hand,
    grip: grips ? gripEdge : 0,
    articulated: false,
  };
}
function lowerBody(
  context: CanvasRenderingContext2D,
  parts: ReturnType<typeof spriteParts>,
  facing: Facing,
  seat: number,
): void {
  const hip = -37 + seat * 12;
  if (seat < 1) {
    context.save();
    context.globalAlpha *= 1 - seat;
    const legs = parts.legs.get(facing)?.[0];
    if (legs) context.drawImage(legs, -80, hip, 160, 39 - seat * 12);
    context.restore();
  }
  if (seat > 0) {
    context.save();
    context.globalAlpha *= seat;
    const legs = parts.seatedLegs.get(facing);
    if (legs) context.drawImage(legs, -80, hip - 3, 160, 30 + (1 - seat) * 12);
    context.restore();
  }
}
function pen(
  context: CanvasRenderingContext2D,
  hand: Arm,
  action: Action,
): void {
  if (action !== "write") return;
  context.beginPath();
  context.moveTo(hand.hand[0] - 2, hand.hand[1] + 4);
  context.lineTo(hand.hand[0] + 5, hand.hand[1] - 8);
  context.strokeStyle = "#283b48";
  context.lineWidth = 1.7;
  context.stroke();
  context.fillStyle = "#d4bc84";
  context.fillRect(hand.hand[0] - 2.5, hand.hand[1] + 3, 1.5, 2);
}
function walking(
  context: CanvasRenderingContext2D,
  parts: ReturnType<typeof spriteParts>,
  actor: ActorFrame,
  pose: Gesture,
): void {
  const phase = (((actor.gait / TAU) % 1) + 1) % 1;
  const lift = Math.sin(phase * TAU * 2) ** 2 * 1.3;
  context.save();
  context.translate(0, -lift);
  context.drawImage(
    parts.sheet,
    gaitColumn(actor.gait) * 160,
    ROW[actor.facing] * 192 + 96,
    160,
    80,
    -80,
    -78,
    160,
    80,
  );
  head(context, parts, actor, pose, -78);
  context.restore();
}
function composeActor(
  context: CanvasRenderingContext2D,
  actor: ActorFrame,
  definition: ActorDefinition,
  assets: Assets,
  time: number,
  improved: boolean,
): void {
  const image = assets.get(actor.id);
  if (!image) return;
  context.save();

  const seat = seatedAmount(actor);

  if (!improved) {
    const column =
      actor.action === "walk"
        ? (BASELINE_WALK[Math.floor(time * 7) % 4] ?? 0)
        : actor.seated
          ? 3
          : 0;
    context.drawImage(
      image,
      column * 160,
      ROW[actor.facing] * 192,
      160,
      192,
      -80,
      -174,
      160,
      192,
    );
    context.restore();
    return;
  }
  const parts = spriteParts(image);
  const neck = -78 + seat * 12;
  const activeActor: ActorFrame =
    actor.action === "walk" && actor.evidence
      ? { ...actor, action: "carry" }
      : actor;
  const pose = gesture(activeActor, time + definition.id.length * 0.37, neck);
  if (actor.action === "walk" && !actor.evidence) {
    walking(context, parts, actor, pose);
    context.restore();
    return;
  }
  if (actor.action === "walk") {
    const legs = parts.legs.get(actor.facing)?.[gaitColumn(actor.gait)];
    if (legs) context.drawImage(legs, -80, -37);
  } else lowerBody(context, parts, actor.facing, seat);
  const sheet = sheetPose(activeActor, pose, neck);
  const left = arm(pose, activeActor, neck, false, sheet);
  const right = arm(pose, activeActor, neck, true, sheet);
  const side = SIDE[actor.facing];
  const front = side < 0 ? left : right;
  const rear = side < 0 ? right : left;
  drawArm(context, parts, rear);
  drawHand(context, parts, rear);
  if (!side) drawArm(context, parts, front);
  if (actor.facing === "up") {
    drawHand(context, parts, front);
    pen(context, right, actor.action);
  }
  const torso = parts.torso.get(actor.facing);
  if (torso) context.drawImage(torso, -80 + pose.lean, neck - 2);
  if (actor.facing !== "up") {
    drawPaper(context, sheet, definition.color, actor.evidence);
    if (side) {
      if (rear.grip) drawHand(context, parts, rear);
      drawArm(context, parts, front);
    } else drawHand(context, parts, rear);
    drawHand(context, parts, front);
    pen(context, right, actor.action);
  }
  head(context, parts, actor, pose, neck);
  context.restore();
}

const actorSurfaces = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
export function drawActor(
  context: CanvasRenderingContext2D,
  actor: ActorFrame,
  definition: ActorDefinition,
  assets: Assets,
  time: number,
  improved: boolean,
): void {
  const image = assets.get(actor.id);
  if (!image) return;
  let raster = actorSurfaces.get(image);
  if (!raster) {
    raster = surface(160, 192);
    actorSurfaces.set(image, raster);
  }
  const local = raster.getContext("2d");
  if (!local) return;
  local.setTransform(1, 0, 0, 1, 0, 0);
  local.clearRect(0, 0, 160, 192);
  local.translate(80, 174);
  composeActor(local, actor, definition, assets, time, improved);
  context.save();
  context.translate(actor.position.x, actor.position.y);
  context.scale(ACTOR_SCALE, ACTOR_SCALE);
  drawShadow(context, seatedAmount(actor));
  context.drawImage(raster, -80, -174);
  context.restore();
}
