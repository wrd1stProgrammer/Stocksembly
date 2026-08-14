import type { AdminTrendPoint } from "../../admin/analyticsContracts";

type Props = {
  readonly points: readonly AdminTrendPoint[];
};

const WIDTH = 920;
const HEIGHT = 240;
const PAD_X = 24;
const PAD_Y = 24;

function linePath(
  points: readonly AdminTrendPoint[],
  key: "signups" | "activeUsers" | "payments",
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

export function AdminTrendChart({ points }: Props) {
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => [
      point.signups,
      point.activeUsers,
      point.payments,
    ]),
  );
  return (
    <div className="admin-chart">
      <div className="admin-chart__legend" aria-hidden="true">
        <span className="is-signups">가입</span>
        <span className="is-active">활성 사용자</span>
        <span className="is-payments">결제</span>
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
            <title id="admin-trend-title">가입·활성·결제 추이</title>
            <desc id="admin-trend-description">
              선택 기간의 일별 가입자, 활성 사용자, 결제 건수 변화
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
            <path
              className="admin-chart__line is-signups"
              d={linePath(points, "signups", maximum)}
            />
            <path
              className="admin-chart__line is-active"
              d={linePath(points, "activeUsers", maximum)}
            />
            <path
              className="admin-chart__line is-payments"
              d={linePath(points, "payments", maximum)}
            />
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
