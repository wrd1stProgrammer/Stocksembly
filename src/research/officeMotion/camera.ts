import type { OfficeCameraControlMode } from "../officeGame";
import type {
  OfficeCameraTransform,
  OfficeRendererViewport,
} from "../officeRenderer";
import { WORLD } from "./layout";

const MAX_FREE_CAMERA_SCALE = 2.4;
type ScreenPoint = { readonly x: number; readonly y: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function constrainFreeCamera(
  camera: OfficeCameraTransform,
  viewport: { readonly width: number; readonly height: number },
): OfficeCameraTransform {
  const world = WORLD;
  const minimumScale = Math.min(
    viewport.width / world.width,
    viewport.height / world.height,
  );
  const scale = clamp(camera.scale, minimumScale, MAX_FREE_CAMERA_SCALE);
  const scaledWidth = world.width * scale;
  const scaledHeight = world.height * scale;
  const x =
    scaledWidth <= viewport.width
      ? (viewport.width - scaledWidth) / 2
      : clamp(camera.x, viewport.width - scaledWidth, 0);
  const y =
    scaledHeight <= viewport.height
      ? (viewport.height - scaledHeight) / 2
      : clamp(camera.y, viewport.height - scaledHeight, 0);
  return Object.freeze({
    ...camera,
    mode: "focus",
    x,
    y,
    scale,
    visibleWorldBounds: Object.freeze({
      left: clamp(-x / scale, 0, world.width),
      top: clamp(-y / scale, 0, world.height),
      right: clamp((viewport.width - x) / scale, 0, world.width),
      bottom: clamp((viewport.height - y) / scale, 0, world.height),
    }),
  });
}

export function zoomFreeCameraAt(
  camera: OfficeCameraTransform,
  viewport: { readonly width: number; readonly height: number },
  anchor: ScreenPoint,
  scaleFactor: number,
): OfficeCameraTransform {
  const nextScale = camera.scale * scaleFactor;
  const worldX = (anchor.x - camera.x) / camera.scale;
  const worldY = (anchor.y - camera.y) / camera.scale;
  return constrainFreeCamera(
    {
      ...camera,
      x: anchor.x - worldX * nextScale,
      y: anchor.y - worldY * nextScale,
      scale: nextScale,
    },
    viewport,
  );
}

export function officeRendererResolution(devicePixelRatio: number): number {
  return Math.min(Math.max(devicePixelRatio, 1), 2);
}

export class MotionCamera {
  private mode: OfficeCameraControlMode = "automatic";
  private current: OfficeCameraTransform | undefined;
  private readonly pointers = new Map<number, ScreenPoint>();
  private gesture: { center: ScreenPoint; distance: number } | undefined;
  private pressed: ScreenPoint | undefined;
  private moved = false;
  private readonly events = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly viewport: () => OfficeRendererViewport,
    private readonly redraw: () => void,
    private readonly select: (point: ScreenPoint) => void,
  ) {
    const options = { signal: this.events.signal };
    canvas.addEventListener("pointerdown", this.down, options);
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerup", this.up, options);
    canvas.addEventListener("pointercancel", this.cancel, options);
    canvas.addEventListener("wheel", this.wheel, {
      ...options,
      passive: false,
    });
  }

  setMode(mode: OfficeCameraControlMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.pointers.clear();
    this.gesture = undefined;
    this.canvas.style.touchAction = mode === "free" ? "none" : "pan-y";
  }

  update(
    target: OfficeCameraTransform,
    delta: number,
    instant: boolean,
  ): OfficeCameraTransform {
    if (this.mode === "free" && this.current) {
      this.current = constrainFreeCamera(this.current, this.viewport());
    } else if (!this.current || instant || target.mode === "overview") {
      this.current = target;
    } else {
      const blend =
        1 - Math.exp(-delta * (this.viewport().width <= 767 ? 7 : 4));
      this.current = {
        ...target,
        x: this.current.x + (target.x - this.current.x) * blend,
        y: this.current.y + (target.y - this.current.y) * blend,
        scale: this.current.scale + (target.scale - this.current.scale) * blend,
      };
    }
    return this.current;
  }

  private point(event: PointerEvent | WheelEvent): ScreenPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private measurement() {
    const [first, second] = [...this.pointers.values()];
    if (!first) return undefined;
    return second
      ? {
          center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
          distance: Math.hypot(first.x - second.x, first.y - second.y),
        }
      : { center: first, distance: 0 };
  }

  private down = (event: PointerEvent): void => {
    this.pressed = this.point(event);
    this.moved = false;
    if (this.mode !== "free") return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, this.pressed);
    this.gesture = this.measurement();
  };

  private move = (event: PointerEvent): void => {
    const point = this.point(event);
    if (
      this.pressed &&
      Math.hypot(point.x - this.pressed.x, point.y - this.pressed.y) > 4
    )
      this.moved = true;
    if (
      this.mode !== "free" ||
      !this.pointers.has(event.pointerId) ||
      !this.current
    )
      return;
    event.preventDefault();
    this.pointers.set(event.pointerId, point);
    const previous = this.gesture;
    this.gesture = this.measurement();
    if (!previous || !this.gesture) return;
    let camera = {
      ...this.current,
      x: this.current.x + this.gesture.center.x - previous.center.x,
      y: this.current.y + this.gesture.center.y - previous.center.y,
    };
    if (previous.distance > 0 && this.gesture.distance > 0) {
      this.moved = true;
      camera = zoomFreeCameraAt(
        camera,
        this.viewport(),
        this.gesture.center,
        this.gesture.distance / previous.distance,
      );
    }
    this.current = constrainFreeCamera(camera, this.viewport());
    this.redraw();
  };

  private release(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    this.gesture = this.measurement();
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId);
  }

  private up = (event: PointerEvent): void => {
    if (this.pressed && !this.moved && this.pointers.size < 2)
      this.select(this.point(event));
    this.pressed = undefined;
    this.release(event);
  };

  private cancel = (event: PointerEvent): void => {
    this.pressed = undefined;
    this.moved = true;
    this.release(event);
  };

  private wheel = (event: WheelEvent): void => {
    if (this.mode !== "free" || !this.current) return;
    event.preventDefault();
    this.current = zoomFreeCameraAt(
      this.current,
      this.viewport(),
      this.point(event),
      Math.exp(-event.deltaY * 0.002),
    );
    this.redraw();
  };

  destroy(): void {
    this.events.abort();
  }
}
