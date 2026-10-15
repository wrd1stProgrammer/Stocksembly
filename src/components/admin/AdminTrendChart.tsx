import type { AdminTrendPoint } from "../../admin/analyticsContracts";

type Props = {
  readonly points: readonly AdminTrendPoint[];
  readonly series?: readonly TrendSeries[];
  readonly title?: string;
};

export type TrendSeries = {
  readonly key: "signups" | "activeUsers" | "actions" | "payments";
  readonly label: string;
  readonly className: "is-signups" | "is-active" | "is-actions" | "is-payments";
};

const DEFAULT_SERIES: readonly TrendSeries[] = [
  { key: "signups", label: "가입", className: "is-signups" },
  { key: "activeUsers", label: "활성 사용자", className: "is-active" },
  { key: "payments", label: "결제", className: "is-payments" },
];

const WIDTH = 920;
const HEIGHT = 240;
const PAD_X = 24;
const PAD_Y = 24;

function linePath(
  points: readonly AdminTrendPoint[],
  key: TrendSeries["key"],
  maximum: number,
): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) => {
      const x =
        PAD_X + (index / Math.max(1, points.length - 1)) * (WIDTH - PAD_X * 2);
      const y =
        HEIGHT -
        PAD_Y -
        (point[key] / Math.max(1, maximum)) * (HEIGHT - PAD_Y * 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function AdminTrendChart({
  points,
  series = DEFAULT_SERIES,
  title = "가입·활성·결제 추이",
}: Props) {
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => series.map(({ key }) => point[key])),
  );
  return (
    <div className="admin-chart">
      <div className="admin-chart__legend" aria-hidden="true">
        {series.map(({ key, label, className }) => (
          <span key={key} className={className}>
            {label}
          </span>
        ))}
      </div>
      {points.length === 0 ? (
        <div className="admin-empty">선택 기간에 표시할 추이가 없습니다.</div>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-labelledby="admin-trend-title admin-trend-description"
          >
            <title id="admin-trend-title">{title}</title>
            <desc id="admin-trend-description">
              선택 기간의 일별 {series.map(({ label }) => label).join(", ")}{" "}
              변화
            </desc>
            {[0, 1, 2, 3, 4].map((line) => (
              <line
                key={line}
                className="admin-chart__grid"
                x1={PAD_X}
                x2={WIDTH - PAD_X}
                y1={PAD_Y + (line * (HEIGHT - PAD_Y * 2)) / 4}
                y2={PAD_Y + (line * (HEIGHT - PAD_Y * 2)) / 4}
              />
            ))}
            {series.map(({ key, className }) => (
              <path
                key={key}
                className={`admin-chart__line ${className}`}
                d={linePath(points, key, maximum)}
              />
            ))}
          </svg>
          <details className="admin-chart__table">
            <summary>일별 수치 보기</summary>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">날짜</th>
                    <th scope="col">가입</th>
                    <th scope="col">활성</th>
                    <th scope="col">액션</th>
                    <th scope="col">결제</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.date}>
                      <th scope="row">{point.date}</th>
                      <td>{point.signups.toLocaleString()}</td>
                      <td>{point.activeUsers.toLocaleString()}</td>
                      <td>{point.actions.toLocaleString()}</td>
                      <td>{point.payments.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
