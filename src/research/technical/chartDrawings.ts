import type {
  ChartBar,
  ChartDrawing,
  TechnicalTimeframe,
} from "../domain/technicalChart";

export type Pivot = {
  index: number;
  price: number;
  side: "demand" | "supply";
  confirmedIndex: number;
};
export function averageTrueRange(
  bars: readonly ChartBar[],
  period = 14,
): number | undefined {
  if (bars.length < period + 1) return undefined;
  const ranges = bars.slice(1).map((bar, index) => {
    const previous = bars[index];
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - (previous?.close ?? bar.open)),
      Math.abs(bar.low - (previous?.close ?? bar.open)),
    );
  });
  let atr =
    ranges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const range of ranges.slice(period))
    atr = (atr * (period - 1) + range) / period;
  return atr;
}
export function confirmedPivots(bars: readonly ChartBar[]): readonly Pivot[] {
  const pivots: Pivot[] = [];
  for (let index = 2; index < bars.length - 2; index++) {
    const bar = bars[index];
    if (!bar) continue;
    const neighbors = bars
      .slice(index - 2, index + 3)
      .filter((_, offset) => offset !== 2);
    for (const side of ["demand", "supply"] as const) {
      const isPivot =
        side === "demand"
          ? neighbors.every((other) => other.low > bar.low)
          : neighbors.every((other) => other.high < bar.high);
      const previous = [...pivots]
        .reverse()
        .find((pivot) => pivot.side === side);
      const price = side === "demand" ? bar.low : bar.high;
      const localRange =
        bars
          .slice(index - 2, index + 3)
          .reduce((sum, item) => sum + item.high - item.low, 0) / 5;
      if (
        isPivot &&
        (!previous ||
          (index - previous.index >= 3 &&
            (Math.abs(price - previous.price) >= localRange * 0.15 ||
              index - previous.index >= 8)))
      ) {
        pivots.push({ index, price, side, confirmedIndex: index + 2 });
      }
    }
  }
  return pivots;
}
function anchor(pivot: Pivot, bars: readonly ChartBar[]) {
  const bar = bars[pivot.index];
  if (!bar) throw new RangeError("missing drawing anchor");
  return { index: pivot.index, timestamp: bar.timestamp, price: pivot.price };
}
function confirmation(pivot: Pivot, bars: readonly ChartBar[]) {
  const bar = bars[pivot.confirmedIndex];
  if (!bar) throw new RangeError("unconfirmed drawing anchor");
  return { confirmedAt: bar.closedAt, confirmedIndex: pivot.confirmedIndex };
}
export function linePrice(drawing: ChartDrawing, index: number): number {
  const first = drawing.anchors[0];
  const second = drawing.anchors[1];
  if (!first || !second || first.index === second.index) return drawing.low;
  return (
    first.price +
    ((second.price - first.price) * (index - first.index)) /
      (second.index - first.index)
  );
}
function levels(
  bars: readonly ChartBar[],
  pivots: readonly Pivot[],
  timeframe: TechnicalTimeframe,
  atr: number,
): ChartDrawing[] {
  const last = bars.at(-1);
  if (!last) return [];
  const tolerance = Math.max(last.close < 1 ? 0.0002 : 0.02, atr * 0.25);
  const groups: Pivot[][] = [];
  for (const pivot of pivots.filter(
    (item) => item.index >= bars.length - (timeframe === "1w" ? 156 : 180),
  )) {
    const group = groups.find(
      (items) =>
        Math.abs(
          items.reduce((sum, item) => sum + item.price, 0) / items.length -
            pivot.price,
        ) <= tolerance,
    );
    if (group) {
      if (Math.abs((group.at(-1)?.index ?? 0) - pivot.index) >= 3)
        group.push(pivot);
    } else groups.push([pivot]);
  }
  const ranked = groups
    .map((group) => {
      const latest = group.at(-1);
      if (!latest) throw new RangeError("empty pivot cluster");
      const low = Math.min(...group.map((pivot) => pivot.price));
      const high = Math.max(...group.map((pivot) => pivot.price));
      const side = (low + high) / 2 <= last.close ? "demand" : "supply";
      const reaction =
        group.reduce((sum, pivot) => {
          const follow = bars.slice(pivot.index + 1, pivot.confirmedIndex + 1);
          return (
            sum +
            Math.max(
              0,
              ...follow.map((bar) =>
                pivot.side === "demand"
                  ? bar.high - pivot.price
                  : pivot.price - bar.low,
              ),
            )
          );
        }, 0) /
        Math.max(atr, 0.01) /
        group.length;
      const distance =
        Math.abs((low + high) / 2 - last.close) / Math.max(atr, 0.01);
      const score =
        Math.min(4, Math.log2(group.length + 1) * 1.5) +
        Math.min(2, reaction) +
        (4 * latest.index) / bars.length -
        distance * 2;
      const drawing: ChartDrawing = {
        id: `${timeframe}:level:${bars[group[0]?.index ?? 0]?.timestamp}:${side}`,
        kind: side === "demand" ? "support" : "resistance",
        side,
        low,
        high,
        anchors: group.slice(-8).map((pivot) => anchor(pivot, bars)),
        ...confirmation(latest, bars),
        strength: group.length >= 3 ? "established" : "tentative",
        touches: group.length,
        state: "active",
        reason: {
          en: `${group.length} separated swing reactions define this ${side === "demand" ? "support" : "resistance"} area. A close beyond the area changes its role.`,
          ko: `떨어진 스윙 ${group.length}곳의 반응을 묶은 ${side === "demand" ? "지지" : "저항"} 구간입니다. 종가가 구간을 넘으면 역할을 다시 판단합니다.`,
        },
      };
      return { drawing, score, distance };
    })
    .filter((item) => item.distance <= 8)
    .sort((left, right) => right.score - left.score);
  return ["demand", "supply"].flatMap((side) =>
    ranked
      .filter((item) => item.drawing.side === side)
      .slice(0, 2)
      .map((item) => item.drawing),
  );
}
function trendChannel(
  bars: readonly ChartBar[],
  pivots: readonly Pivot[],
  timeframe: TechnicalTimeframe,
  atr: number,
): ChartDrawing[] {
  const tolerance = Math.max(0.02, atr * 0.25);
  const candidates: ChartDrawing[] = [];
  for (const side of ["demand", "supply"] as const) {
    const same = pivots
      .filter(
        (pivot) => pivot.side === side && pivot.index >= bars.length - 100,
      )
      .slice(-6);
    for (let index = same.length - 1; index > 0; index--) {
      const second = same[index];
      if (!second) continue;
      for (const first of same.slice(0, index).reverse()) {
        if (
          second.index - first.index < 6 ||
          (side === "demand"
            ? second.price <= first.price
            : second.price >= first.price)
        )
          continue;
        const slope =
          (second.price - first.price) / (second.index - first.index);
        const at = (barIndex: number) =>
          first.price + slope * (barIndex - first.index);
        const bodyCrosses = bars
          .slice(first.index, -1)
          .filter((bar, offset) =>
            side === "demand"
              ? Math.min(bar.open, bar.close) <
                at(first.index + offset) - tolerance
              : Math.max(bar.open, bar.close) >
                at(first.index + offset) + tolerance,
          ).length;
        const last = bars.at(-1);
        if (
          !last ||
          bodyCrosses > 1 ||
          (side === "demand"
            ? last.close < at(bars.length - 1) - tolerance
            : last.close > at(bars.length - 1) + tolerance)
        )
          continue;
        const touches = same.filter(
          (pivot) =>
            pivot.index >= first.index &&
            Math.abs(pivot.price - at(pivot.index)) <= tolerance,
        );
        const latest = touches.at(-1) ?? second;
        const opposite = pivots.filter(
          (pivot) =>
            pivot.side !== side &&
            pivot.index > first.index &&
            pivot.index < second.index,
        );
        const offsetAnchor = opposite.sort(
          (left, right) =>
            Math.abs(right.price - at(right.index)) -
            Math.abs(left.price - at(left.index)),
        )[0];
        const offset = offsetAnchor
          ? offsetAnchor.price - at(offsetAnchor.index)
          : undefined;
        const channelValid =
          offset !== undefined &&
          Math.abs(offset) >= atr &&
          bars
            .slice(first.index)
            .filter((bar, i) =>
              side === "demand"
                ? Math.max(bar.open, bar.close) >
                  at(first.index + i) + offset + tolerance
                : Math.min(bar.open, bar.close) <
                  at(first.index + i) + offset - tolerance,
            ).length <= 1;
        const drawing: ChartDrawing = {
          id: `${timeframe}:trend:${bars[first.index]?.timestamp}:${bars[second.index]?.timestamp}`,
          kind: channelValid ? "channel" : "trend",
          side,
          low: Math.min(first.price, second.price),
          high: Math.max(first.price, second.price),
          anchors: [
            anchor(first, bars),
            anchor(second, bars),
            ...(channelValid && offsetAnchor
              ? [anchor(offsetAnchor, bars)]
              : []),
          ],
          ...confirmation(latest, bars),
          touches: touches.length,
          strength: touches.length >= 3 ? "established" : "tentative",
          state: "active",
          ...(channelValid && offset !== undefined
            ? { parallelOffset: offset }
            : {}),
          reason: {
            en: `${touches.length} confirmed swing touches; ${touches.length < 3 ? "two anchors make this a tentative" : "repeated reactions support this"} ${channelValid ? "parallel channel" : "trend line"}. A closing break ends the current structure.`,
            ko: `확인된 스윙 ${touches.length}곳을 이은 ${channelValid ? "평행 채널" : "추세선"}입니다. ${touches.length < 3 ? "두 접점이므로 잠정 구조입니다. " : "반복 반응으로 구조를 확인했습니다. "}종가 이탈 시 현재 구조는 무효입니다.`,
          },
        };
        candidates.push(drawing);
        break;
      }
    }
  }
  return candidates
    .sort(
      (left, right) =>
        right.touches - left.touches ||
        right.confirmedIndex - left.confirmedIndex,
    )
    .slice(0, 1);
}
function orderBlocks(
  bars: readonly ChartBar[],
  pivots: readonly Pivot[],
  timeframe: TechnicalTimeframe,
): ChartDrawing[] {
  const candidates: ChartDrawing[] = [];
  for (
    let index = Math.max(16, bars.length - 100);
    index < bars.length;
    index++
  ) {
    const breakout = bars[index];
    const previous = bars[index - 1];
    if (!breakout || !previous) continue;
    const atr = averageTrueRange(bars.slice(0, index));
    if (!atr || atr <= 0) continue;
    for (const side of ["demand", "supply"] as const) {
      const broken = [...pivots]
        .reverse()
        .find((pivot) => pivot.side !== side && pivot.confirmedIndex < index);
      if (
        !broken ||
        (side === "demand"
          ? breakout.close <= broken.price || previous.close > broken.price
          : breakout.close >= broken.price || previous.close < broken.price)
      )
        continue;
      let origin = index - 1;
      while (origin >= index - 3) {
        const bar = bars[origin];
        if (
          bar &&
          (side === "demand" ? bar.close < bar.open : bar.close > bar.open)
        )
          break;
        origin--;
      }
      const source = bars[origin];
      if (
        !source ||
        origin < index - 3 ||
        Math.abs(breakout.close - source.close) < 1.5 * atr
      )
        continue;
      const after = bars.slice(index + 1);
      if (
        after.some((bar) =>
          side === "demand" ? bar.close < source.low : bar.close > source.high,
        )
      )
        continue;
      const revisits = after.filter(
        (bar, offset) =>
          bar.low <= source.high &&
          bar.high >= source.low &&
          (offset === 0 ||
            (after[offset - 1]?.low ?? 0) > source.high ||
            (after[offset - 1]?.high ?? Infinity) < source.low),
      );
      if (revisits.length > 1) continue;
      const sourcePivot: Pivot = {
        index: origin,
        confirmedIndex: index,
        price: side === "demand" ? source.low : source.high,
        side,
      };
      candidates.push({
        id: `${timeframe}:ob:${source.timestamp}:${side}`,
        kind: "order_block",
        side,
        low: source.low,
        high: source.high,
        anchors: [
          anchor(sourcePivot, bars),
          anchor(
            { index, price: breakout.close, side, confirmedIndex: index },
            bars,
          ),
        ],
        ...confirmation(sourcePivot, bars),
        strength: "tentative",
        touches: 1 + revisits.length,
        state: revisits.length ? "retested" : "active",
        reason: {
          en: "The last opposite candle before an ATR-sized displacement closed through a confirmed swing. This is an OHLCV order-block candidate, not verified institutional orders.",
          ko: "확인된 스윙을 종가로 돌파한 강한 움직임 직전의 반대색 봉입니다. 가격·거래량 기반 오더블록 후보이며 실제 기관 주문을 확인한 것은 아닙니다.",
        },
      });
    }
  }
  const selected: ChartDrawing[] = [];
  for (const candidate of candidates.reverse()) {
    if (
      !selected.some(
        (item) => candidate.low <= item.high && candidate.high >= item.low,
      )
    )
      selected.push(candidate);
    if (selected.length === 2) break;
  }
  return selected;
}
export function deriveChartDrawings(
  bars: readonly ChartBar[],
  timeframe: TechnicalTimeframe,
): readonly ChartDrawing[] {
  const atr = averageTrueRange(bars);
  if (atr === undefined || bars.length < 20) return [];
  const pivots = confirmedPivots(bars);
  const structural = levels(bars, pivots, timeframe, atr);
  const blocks = orderBlocks(bars, pivots, timeframe).filter(
    (block) =>
      !structural.some(
        (level) => block.low <= level.high && block.high >= level.low,
      ),
  );
  return [
    ...structural,
    ...trendChannel(bars, pivots, timeframe, atr),
    ...blocks,
  ];
}
