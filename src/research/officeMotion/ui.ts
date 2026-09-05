import { typewriterCharacterCount } from "../officeGameBubble";
import type {
  OfficeRendererViewport,
  OfficeRenderSnapshot,
} from "../officeRenderer";
import {
  layoutOfficeUi,
  type OfficeActorUiLayout,
} from "../officeRendererUiLayout";
import type { AgentId } from "../types";
import { panel } from "./canvasPrimitives";

function wrap(
  ctx: CanvasRenderingContext2D,
  message: string,
  width: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of message.split(
    /(?<=\s)|(?=[\u3000-\u9fff\uac00-\ud7af])/u,
  )) {
    if (line && ctx.measureText(line + word).width > width) {
      lines.push(line.trim());
      line = word;
    } else line += word;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export class MotionUi {
  private readonly buttons = new Map<AgentId, HTMLButtonElement>();
  private readonly layer: HTMLDivElement;
  private visibleCharacters = Number.MAX_SAFE_INTEGER;

  constructor(
    private readonly host: HTMLDivElement,
    private readonly select: ((id: AgentId) => void) | undefined,
  ) {
    this.layer = document.createElement("div");
    this.layer.className = "office-motion__actors";
    host.appendChild(this.layer);
  }

  setBubbleTypingElapsed(elapsedMs: number, reducedMotion: boolean): void {
    this.visibleCharacters = typewriterCharacterCount(elapsedMs, reducedMotion);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    projection: OfficeRenderSnapshot,
    viewport: OfficeRendererViewport,
    showUi: boolean,
    showBubbles: boolean,
  ): readonly OfficeActorUiLayout[] {
    const layouts = layoutOfficeUi({
      projection,
      viewport,
      actorDisplayScale: 0.6,
    });
    const byId = new Map(projection.actors.map((actor) => [actor.id, actor]));
    for (const [id, button] of this.buttons) {
      if (byId.has(id)) continue;
      button.remove();
      this.buttons.delete(id);
    }
    for (const layout of layouts) {
      const actor = byId.get(layout.actorId);
      if (!actor) continue;
      if (this.select) {
        let button = this.buttons.get(actor.id);
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "office-motion__actor";
          button.addEventListener("click", () => this.select?.(actor.id));
          this.buttons.set(actor.id, button);
          this.layer.appendChild(button);
        }
        button.setAttribute("aria-label", actor.label);
        button.hidden = !layout.uiVisible;
        const { left, top, right, bottom } = layout.bodyBounds;
        Object.assign(button.style, {
          left: `${left}px`,
          top: `${Math.max(0, top)}px`,
          width: `${right - left}px`,
          height: `${bottom - Math.max(0, top)}px`,
        });
      }
      if (!showUi) continue;
      if (layout.label.visible) {
        const b = layout.label.bounds;
        ctx.font = "600 12px Pretendard, sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fff8e6d9";
        ctx.strokeText(actor.label, (b.left + b.right) / 2, b.top + 13);
        ctx.fillStyle = "#25373c";
        ctx.fillText(actor.label, (b.left + b.right) / 2, b.top + 13);
      }
      if (showBubbles && layout.bubble.visible && actor.bubble.visible) {
        const b = layout.bubble.bounds;
        panel(
          ctx,
          b.left,
          b.top,
          b.right - b.left,
          b.bottom - b.top,
          7,
          "#fffdf4",
          "#c0c8bd",
        );
        ctx.fillStyle = "#fffdf4";
        ctx.beginPath();
        ctx.moveTo(layout.screenPosition.x - 4, b.bottom - 1);
        ctx.lineTo(layout.screenPosition.x, b.bottom + 4);
        ctx.lineTo(layout.screenPosition.x + 4, b.bottom - 1);
        ctx.fill();
        const size = layout.bubble.screenFontSize;
        ctx.font = `600 ${size}px Pretendard, sans-serif`;
        ctx.textAlign = "center";
        const lines = wrap(ctx, actor.bubble.message, b.right - b.left - 20);
        const capacity = Math.max(
          1,
          Math.floor((b.bottom - b.top - 12) / (size + 3)),
        );
        const visible = lines.slice(0, capacity);
        if (lines.length > capacity)
          visible[capacity - 1] =
            `${(visible[capacity - 1] ?? "").slice(0, -2)}…`;
        ctx.fillStyle = "#334247";
        ctx.textAlign = "left";
        let remaining = this.visibleCharacters;
        visible.forEach((line, index) => {
          const glyphs = [...line];
          const text = glyphs.slice(0, Math.max(0, remaining)).join("");
          remaining -= glyphs.length + 1;
          ctx.fillText(
            text,
            (b.left + b.right - ctx.measureText(line).width) / 2,
            b.top + size + 8 + index * (size + 3),
          );
        });
      }
    }
    ctx.textAlign = "start";
    this.host.setAttribute("data-office-ui-layout", JSON.stringify(layouts));
    return layouts;
  }
  destroy(): void {
    this.layer.remove();
  }
}
