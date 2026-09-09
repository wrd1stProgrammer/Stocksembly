import type {
  IPrimitivePaneRenderer,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { TechnicalChartFrame } from "../../../../research/domain/technicalChart";
import {
  chartPrice,
  drawingSegments,
  futureBarCount,
} from "../../../../research/technical/chartPresentation";

export type ChartPalette = {
  paper: string;
  ink: string;
  muted: string;
  rule: string;
  up: string;
  down: string;
};
export class TechnicalChartPrimitive implements ISeriesPrimitive<Time> {
  private attachedTo: SeriesAttachedParameter<Time> | undefined;
  private selectedId: string | undefined;
  private visible = true;
  constructor(
    private frame: TechnicalChartFrame,
    private palette: ChartPalette,
  ) {}
  attached(parameter: SeriesAttachedParameter<Time>) {
    this.attachedTo = parameter;
  }
  detached() {
    this.attachedTo = undefined;
  }
  update(
    palette: ChartPalette,
    selectedId: string | undefined,
    visible: boolean,
  ) {
    this.palette = palette;
    this.selectedId = selectedId;
    this.visible = visible;
    this.attachedTo?.requestUpdate();
  }
  paneViews() {
    return [
      {
        zOrder: () => "normal" as const,
        renderer: () =>
          ({
            draw: (target) => this.draw(target),
          }) satisfies IPrimitivePaneRenderer,
      },
    ];
  }
  private draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]) {
    const attached = this.attachedTo;
    if (!attached) return;
    const drawInMediaSpace = target.useMediaCoordinateSpace.bind(target);
    drawInMediaSpace(({ context, mediaSize }) => {
      const x = (index: number) =>
        attached.chart.timeScale().logicalToCoordinate(index as Logical);
      const y = (price: number) => attached.series.priceToCoordinate(price);
      const lastIndex = this.frame.bars.length - 1;
      const last = this.frame.bars.at(-1);
      if (!last) return;
      const futureX = x(lastIndex + 0.5);
      const drawingEnd = Math.max(
        lastIndex + futureBarCount(this.frame.timeframe),
        Math.ceil(
          attached.chart.timeScale().getVisibleLogicalRange()?.to ?? lastIndex,
        ),
      );
      context.save();
      context.beginPath();
      context.rect(0, 0, mediaSize.width, mediaSize.height);
      context.clip();
      if (futureX !== null) {
        context.fillStyle = this.palette.muted;
        context.globalAlpha = 0.045;
        context.fillRect(
          futureX,
          0,
          mediaSize.width - futureX,
          mediaSize.height,
        );
        context.globalAlpha = 1;
      }
      if (this.visible) {
        const occupiedLabels: number[] = [];
        for (const drawing of this.frame.drawings) {
          const color =
            drawing.side === "demand" ? this.palette.up : this.palette.down;
          const selected = this.selectedId === drawing.id;
          const segments = drawingSegments(drawing, drawingEnd);
          const first = segments[0];
          if (!first) continue;
          context.strokeStyle = color;
          context.fillStyle = color;
          context.lineWidth = selected ? 2.4 : 1;
          context.globalAlpha = this.selectedId && !selected ? 0.36 : 0.85;
          if (drawing.kind !== "trend" && drawing.kind !== "channel") {
            const left = x(first.from);
            const right = x(first.to);
            const top = y(drawing.high);
            const bottom = y(drawing.low);
            if (
              left !== null &&
              right !== null &&
              top !== null &&
              bottom !== null
            ) {
              context.save();
              context.globalAlpha = selected ? 0.17 : 0.065;
              context.fillRect(
                left,
                top,
                right - left,
                Math.max(2, bottom - top),
              );
              context.restore();
            }
          }
          context.setLineDash(
            drawing.kind === "support" || drawing.kind === "resistance"
              ? []
              : drawing.kind === "order_block"
                ? [2, 3]
                : drawing.strength === "tentative"
                  ? [5, 3]
                  : [],
          );
          for (const segment of segments) {
            const left = x(segment.from);
            const right = x(segment.to);
            const top = y(segment.startPrice);
            const bottom = y(segment.endPrice);
            if (
              left === null ||
              right === null ||
              top === null ||
              bottom === null
            )
              continue;
            context.beginPath();
            context.moveTo(left, top);
            context.lineTo(right, bottom);
            context.stroke();
          }
          if (selected)
            for (const anchor of drawing.anchors) {
              const px = x(anchor.index);
              const py = y(anchor.price);
              if (px === null || py === null) continue;
              context.setLineDash([]);
              context.beginPath();
              context.arc(px, py, 3, 0, Math.PI * 2);
              context.fill();
            }
          if (drawing.kind === "support" || drawing.kind === "resistance") {
            const py = y(
              drawing.side === "demand" ? drawing.high : drawing.low,
            );
            if (
              py !== null &&
              py > 18 &&
              py < mediaSize.height - 25 &&
              !occupiedLabels.some((value) => Math.abs(value - py) < 17)
            ) {
              occupiedLabels.push(py);
              context.font = "10px ui-monospace, monospace";
              context.setLineDash([]);
              context.fillText(
                `${drawing.kind === "support" ? "S" : "R"} ${chartPrice(drawing.side === "demand" ? drawing.high : drawing.low)}`,
                6,
                py - 4,
              );
            }
          }
        }
        context.globalAlpha = 0.85;
        context.setLineDash([3, 4]);
        context.lineWidth = 1.3;
        for (const scenario of this.frame.scenarios) {
          const x1 = x(lastIndex + 1);
          const x2 = x(lastIndex + 6);
          const y1 = y(last.close);
          const y2 = y(scenario.boundary);
          if (x1 === null || x2 === null || y1 === null || y2 === null)
            continue;
          context.strokeStyle =
            scenario.direction === "up" ? this.palette.up : this.palette.down;
          context.beginPath();
          context.moveTo(x1, y1);
          context.lineTo(x2, y2);
          context.stroke();
          context.setLineDash([]);
          context.beginPath();
          context.moveTo(x2 - 4, y2 - 3);
          context.lineTo(x2, y2);
          context.lineTo(x2 - 4, y2 + 3);
          context.stroke();
          context.setLineDash([3, 4]);
        }
      }
      context.restore();
    });
  }
}
