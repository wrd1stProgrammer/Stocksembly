import {
  Activity,
  ArrowRight,
  BadgeDollarSign,
  CircleAlert,
  CreditCard,
  LayoutDashboard,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type {
  AdminAnalyticsOverview,
  AdminBreakdown,
  AdminFunnel,
  AdminUserRow,
} from "../../admin/analyticsContracts";
import { adminMetricDefinitions } from "../../admin/metricDefinitions";
import { AdminFilters } from "./AdminFilters";
import { AdminTrendChart } from "./AdminTrendChart";

type Props = { readonly data: AdminAnalyticsOverview };

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("ko-KR")}%`;
}

function queryString(data: AdminAnalyticsOverview, page?: number): string {
  const params = new URLSearchParams({
    range: data.query.range,
    fromDate: data.query.fromDate,
    throughDate: data.query.throughDate,
    channel: data.query.channel,
  });
  if (data.query.locale) params.set("locale", data.query.locale);
  if (data.query.plan) params.set("plan", data.query.plan);
  if (data.query.status) params.set("status", data.query.status);
  if (data.query.search) params.set("q", data.query.search);
  if (page !== undefined) params.set("page", String(page));
  return params.toString();
}

function StatusBadge({ data }: { readonly data: AdminAnalyticsOverview }) {
  return (
    <div className="admin-data-status" role="status">
      <CircleAlert size={16} aria-hidden="true" />
      <span>{data.status.caveat}</span>
      <small>
        {data.status.accuracy === "exact" ? "정확" : "추정"} ·{" "}
        {data.status.completeness === "complete" ? "완전" : "부분 집계"}
      </small>
    </div>
  );
}

function Funnel({
  title,
  funnel,
  activation,
}: {
  readonly title: string;
  readonly funnel: AdminFunnel;
  readonly activation?: boolean;
}) {
  const maximum = Math.max(1, funnel.denominator);
  return (
    <section className="admin-panel admin-funnel">
      <header className="admin-panel__header">
        <div>
          <p>전환 퍼널</p>
          <h2>{title}</h2>
        </div>
        <span className="admin-status-chip">
          {funnel.status.availability === "available" ? "집계 중" : "수집 전"}
        </span>
      </header>
      <div className="admin-funnel__steps">
        <div>
          <span>대상</span>
          <strong>{funnel.denominator.toLocaleString()}</strong>
          <i style={{ width: "100%" }} />
        </div>
        {activation ? (
          <div>
            <span>7일 내 리서치 완료</span>
            <strong>{(funnel.activated ?? 0).toLocaleString()}</strong>
            <small>{percent(funnel.activationRate ?? null)}</small>
            <i
              style={{
                width: `${((funnel.activated ?? 0) / maximum) * 100}%`,
              }}
            />
          </div>
        ) : null}
        <div>
          <span>7일/30일 내 결제</span>
          <strong>{funnel.paid.toLocaleString()}</strong>
          <small>{percent(funnel.paidRate)}</small>
          <i style={{ width: `${(funnel.paid / maximum) * 100}%` }} />
        </div>
      </div>
      <p className="admin-panel__note">{funnel.status.caveat}</p>
    </section>
  );
}

function Breakdown({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: readonly AdminBreakdown[];
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="admin-panel admin-breakdown">
      <header className="admin-panel__header">
        <h2>{title}</h2>
      </header>
      {rows.length === 0 ? (
        <div className="admin-empty">표시할 데이터가 없습니다.</div>
      ) : (
        <ol>
          {rows.map((row) => (
            <li key={row.key}>
              <div>
                <span>{row.label}</span>
                <strong>{row.count.toLocaleString()}</strong>
                <small>{percent(row.rate)}</small>
              </div>
              <i style={{ width: `${(row.count / maximum) * 100}%` }} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function UserTable({
  data,
  users,
}: {
  readonly data: AdminAnalyticsOverview;
  readonly users: readonly AdminUserRow[];
}) {
  return (
    <section className="admin-panel admin-users" id="users">
      <header className="admin-panel__header admin-users__header">
        <div>
          <p>사용자</p>
          <h2>가입자 목록</h2>
        </div>
        <form action="/admin" method="get" className="admin-user-search">
          <input type="hidden" name="range" value={data.query.range} />
          <input type="hidden" name="fromDate" value={data.query.fromDate} />
          <input
            type="hidden"
            name="throughDate"
            value={data.query.throughDate}
          />
          <input type="hidden" name="channel" value={data.query.channel} />
          <Search size={16} aria-hidden="true" />
          <input
            name="q"
            type="search"
            defaultValue={data.query.search ?? ""}
            placeholder="이메일 또는 이름"
            aria-label="사용자 검색"
          />
          <button type="submit">검색</button>
        </form>
      </header>
      <div className="admin-table-wrap">
        <table>
          <caption className="sr-only">가입자별 현재 상태와 활동</caption>
          <thead>
            <tr>
              <th scope="col">사용자</th>
              <th scope="col">첫 인증</th>
              <th scope="col">유입</th>
              <th scope="col">플랜</th>
              <th scope="col">상태</th>
              <th scope="col">액션</th>
              <th scope="col">최근 활동</th>
              <th scope="col">
                <span className="sr-only">상세</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.principalId}>
                <td>
                  <strong>
                    {user.displayName || user.email || "이름 없음"}
                  </strong>
                  <small>
                    {user.email ?? `${user.principalId.slice(0, 10)}…`}
                  </small>
                </td>
                <td>{new Date(user.createdAt).toLocaleDateString("ko-KR")}</td>
                <td>{user.acquisitionChannel}</td>
                <td>
                  <span className={`admin-plan is-${user.plan}`}>
                    {user.plan}
                  </span>
                </td>
                <td>{user.status}</td>
                <td>{user.actionCount.toLocaleString()}</td>
                <td>
                  {user.lastMeaningfulAt
                    ? new Date(user.lastMeaningfulAt).toLocaleString("ko-KR")
                    : "—"}
                </td>
                <td>
                  <Link
                    className="admin-row-link"
                    href={`/admin/users/${user.principalId}?${queryString(data)}`}
                    aria-label={`${user.displayName || user.email || "사용자"} 상세 보기`}
                  >
                    <ArrowRight size={17} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 ? (
        <div className="admin-empty">조건에 맞는 사용자가 없습니다.</div>
      ) : null}
      <footer className="admin-pagination">
        <span>
          총 {data.users.total.toLocaleString()}명 · {data.users.page}/
          {data.users.pageCount} 페이지
        </span>
        <div>
          {data.users.page > 1 ? (
            <Link
              href={`/admin?${queryString(data, data.users.page - 1)}#users`}
            >
              이전
            </Link>
          ) : null}
          {data.users.page < data.users.pageCount ? (
            <Link
              href={`/admin?${queryString(data, data.users.page + 1)}#users`}
            >
              다음
            </Link>
          ) : null}
        </div>
      </footer>
    </section>
  );
}

export function AdminDashboard({ data }: Props) {
  const kpis = [
    {
      definition: adminMetricDefinitions.signups,
      value: data.kpis.newUsers,
      icon: UserRound,
    },
    {
      definition: adminMetricDefinitions.dau,
      value: data.kpis.dau,
      icon: Activity,
    },
    {
      definition: adminMetricDefinitions.wau,
      value: data.kpis.wau,
      icon: UsersRound,
    },
    {
      definition: adminMetricDefinitions.mau,
      value: data.kpis.mau,
      icon: UsersRound,
    },
    {
      definition: adminMetricDefinitions.signupToPaid,
      value: data.kpis.signupToPaidRate,
      icon: BadgeDollarSign,
      rate: true,
    },
    {
      definition: adminMetricDefinitions.activePaid,
      value: data.kpis.activePaid,
      icon: CreditCard,
    },
  ] as const;
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin">
          <span>S</span>
          <strong>Stocksembly</strong>
        </Link>
        <nav aria-label="관리자 메뉴">
          <a className="is-active" href="#overview">
            <LayoutDashboard size={18} /> 대시보드
          </a>
          <a href="#users">
            <UserRound size={18} /> 사용자
          </a>
          <a href="#payments">
            <CreditCard size={18} /> 결제
          </a>
        </nav>
        <div className="admin-sidebar__guard">
          <ShieldCheck size={18} />
          <span>관리자 전용</span>
        </div>
        <Link className="admin-back-link" href="/">
          서비스로 돌아가기
        </Link>
      </aside>
      <main className="admin-main" id="overview">
        <header className="admin-heading">
          <div>
            <p>ADMIN ANALYTICS</p>
            <h1>서비스 현황</h1>
            <span>
              생성 {new Date(data.generatedAt).toLocaleString("ko-KR")} · KST
              기준
            </span>
          </div>
          <AdminFilters query={data.query} />
        </header>
        <StatusBadge data={data} />
        <section className="admin-kpis" aria-label="핵심 지표">
          {kpis.map(({ definition, value, icon: Icon, ...item }) => (
            <article key={definition.label}>
              <div>
                <span>{definition.label}</span>
                <Icon size={18} />
              </div>
              <strong>
                {"rate" in item && item.rate
                  ? percent(value as number | null)
                  : (value ?? 0).toLocaleString("ko-KR")}
              </strong>
              <p>{definition.description}</p>
            </article>
          ))}
        </section>
        <section className="admin-panel admin-trends">
          <header className="admin-panel__header">
            <div>
              <p>일별 흐름</p>
              <h2>가입·활성·결제 추이</h2>
            </div>
          </header>
          <AdminTrendChart points={data.trends} />
        </section>
        <div className="admin-two-column">
          <Funnel
            title="가입 → 활성화 → 결제"
            funnel={data.signupFunnel}
            activation
          />
          <Funnel
            title="결제 이동 준비 완료 → 결제"
            funnel={data.checkoutFunnel}
          />
        </div>
        <div className="admin-three-column">
          <Breakdown title="유입 채널" rows={data.acquisition} />
          <Breakdown title="현재 플랜" rows={data.plans} />
          <Breakdown title="현재 상태" rows={data.statuses} />
        </div>
        <div className="admin-two-column">
          <section className="admin-panel">
            <header className="admin-panel__header">
              <div>
                <p>코호트</p>
                <h2>리텐션</h2>
              </div>
            </header>
            <div className="admin-retention">
              {data.retention.map((row) => (
                <article key={row.horizon}>
                  <span>{row.horizon}</span>
                  <strong>{percent(row.rate)}</strong>
                  <small>
                    {row.retained.toLocaleString()} /{" "}
                    {row.eligible.toLocaleString()}명
                  </small>
                </article>
              ))}
            </div>
          </section>
          <section className="admin-panel" id="payments">
            <header className="admin-panel__header">
              <div>
                <p>결제 진단</p>
                <h2>결제·구독 상태</h2>
              </div>
            </header>
            <dl className="admin-diagnostics">
              <div>
                <dt>결제 성공</dt>
                <dd>{data.payments.succeeded.toLocaleString()}</dd>
              </div>
              <div>
                <dt>결제 실패율</dt>
                <dd>{percent(data.payments.failureRate)}</dd>
              </div>
              <div>
                <dt>멤버십 종료</dt>
                <dd>{data.payments.deactivated.toLocaleString()}</dd>
              </div>
              <div>
                <dt>해지 예약</dt>
                <dd>{data.payments.cancelScheduled.toLocaleString()}</dd>
              </div>
              <div>
                <dt>결제 지연</dt>
                <dd>{data.payments.pastDue.toLocaleString()}</dd>
              </div>
            </dl>
          </section>
        </div>
        <section className="admin-panel">
          <header className="admin-panel__header">
            <div>
              <p>제품 사용</p>
              <h2>핵심 액션</h2>
            </div>
          </header>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">액션</th>
                  <th scope="col">이벤트</th>
                  <th scope="col">사용자</th>
                </tr>
              </thead>
              <tbody>
                {data.usage.map((row) => (
                  <tr key={row.event}>
                    <th scope="row">{row.label}</th>
                    <td>{row.events.toLocaleString()}</td>
                    <td>{row.users.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.usage.length === 0 ? (
            <div className="admin-empty">선택 기간의 핵심 액션이 없습니다.</div>
          ) : null}
        </section>
        <UserTable data={data} users={data.users.items} />
      </main>
    </div>
  );
}
