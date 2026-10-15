import {
  Activity,
  ArrowRight,
  BadgeDollarSign,
  CircleAlert,
  CreditCard,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { ONBOARDING_DISCOVERY_SOURCE_LABELS_KO } from "../../accounts/onboarding";
import type {
  AdminAnalyticsOverview,
  AdminAnalyticsQuery,
  AdminBreakdown,
  AdminFunnel as AdminFunnelData,
  AdminRetention,
  AdminUsage,
  AdminUserList,
  DataStatus,
} from "../../admin/analyticsContracts";
import { adminMetricDefinitions } from "../../admin/metricDefinitions";

export function adminQueryString(
  query: AdminAnalyticsQuery,
  page?: number,
  includePageSize = false,
): string {
  const params = new URLSearchParams({
    range: query.range,
    fromDate: query.fromDate,
    throughDate: query.throughDate,
    channel: query.channel,
  });
  if (query.locale) params.set("locale", query.locale);
  if (query.plan) params.set("plan", query.plan);
  if (query.status) params.set("status", query.status);
  if (query.source) params.set("source", query.source);
  if (query.campaign) params.set("campaign", query.campaign);
  if (query.search) params.set("q", query.search);
  if (page !== undefined) params.set("page", String(page));
  if (includePageSize) params.set("pageSize", String(query.pageSize));
  return params.toString();
}

export function AdminDataStatus({ status }: { readonly status: DataStatus }) {
  return (
    <div className="admin-data-status" role="status">
      <CircleAlert size={16} aria-hidden="true" />
      <span>{status.caveat}</span>
      <small>
        {status.accuracy === "exact" ? "정확" : "추정"} ·{" "}
        {status.completeness === "complete" ? "완전" : "부분 집계"}
      </small>
    </div>
  );
}

export function AdminKpiCards({
  data,
  links,
  summary = false,
}: {
  readonly data: AdminAnalyticsOverview;
  readonly links?: Readonly<{
    acquisition: string;
    behavior: string;
    billing: string;
  }>;
  readonly summary?: boolean;
}) {
  if (summary && links) {
    const cards = [
      {
        label: adminMetricDefinitions.signups.label,
        value: data.kpis.newUsers.toLocaleString("ko-KR"),
        description: adminMetricDefinitions.signups.description,
        href: links.acquisition,
      },
      {
        label: "DAU / WAU / MAU",
        value: `${data.kpis.dau.toLocaleString("ko-KR")} / ${data.kpis.wau.toLocaleString("ko-KR")} / ${data.kpis.mau.toLocaleString("ko-KR")}`,
        description: "기간별 meaningful activity 사용자",
        href: links.behavior,
      },
      {
        label: adminMetricDefinitions.signupToPaid.label,
        value:
          data.kpis.signupToPaidRate === null
            ? "—"
            : `${data.kpis.signupToPaidRate.toLocaleString("ko-KR")}%`,
        description: adminMetricDefinitions.signupToPaid.description,
        href: links.acquisition,
      },
      {
        label: adminMetricDefinitions.activePaid.label,
        value: data.kpis.activePaid.toLocaleString("ko-KR"),
        description: adminMetricDefinitions.activePaid.description,
        href: links.billing,
      },
    ];
    return (
      <section
        className="admin-kpis admin-kpis--summary"
        aria-label="핵심 지표"
      >
        {cards.map((card) => (
          <article key={card.label}>
            <Link className="admin-kpi-link" href={card.href}>
              <div>
                <span>{card.label}</span>
                <Activity size={18} />
              </div>
              <strong>{card.value}</strong>
              <p>{card.description}</p>
            </Link>
          </article>
        ))}
      </section>
    );
  }
  const kpis = [
    {
      definition: adminMetricDefinitions.signups,
      value: data.kpis.newUsers,
      icon: UserRound,
      href: links?.acquisition,
    },
    {
      definition: adminMetricDefinitions.dau,
      value: data.kpis.dau,
      icon: Activity,
      href: links?.behavior,
    },
    {
      definition: adminMetricDefinitions.wau,
      value: data.kpis.wau,
      icon: UsersRound,
      href: links?.behavior,
    },
    {
      definition: adminMetricDefinitions.mau,
      value: data.kpis.mau,
      icon: UsersRound,
      href: links?.behavior,
    },
    {
      definition: adminMetricDefinitions.signupToPaid,
      value: data.kpis.signupToPaidRate,
      icon: BadgeDollarSign,
      rate: true,
      href: links?.acquisition,
    },
    {
      definition: adminMetricDefinitions.activePaid,
      value: data.kpis.activePaid,
      icon: CreditCard,
      href: links?.billing,
    },
  ] as const;
  return (
    <section className="admin-kpis" aria-label="핵심 지표">
      {kpis.map(({ definition, value, icon: Icon, href, ...item }) => {
        const content = (
          <>
            <div>
              <span>{definition.label}</span>
              <Icon size={18} />
            </div>
            <strong>
              {"rate" in item && item.rate
                ? value === null
                  ? "—"
                  : `${value.toLocaleString("ko-KR")}%`
                : (value ?? 0).toLocaleString("ko-KR")}
            </strong>
            <p>{definition.description}</p>
          </>
        );
        return (
          <article key={definition.label}>
            {href ? (
              <Link className="admin-kpi-link" href={href}>
                {content}
              </Link>
            ) : (
              content
            )}
          </article>
        );
      })}
    </section>
  );
}

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("ko-KR")}%`;
}

export function AdminFunnel({
  title,
  funnel,
  activation,
}: {
  readonly title: string;
  readonly funnel: AdminFunnelData;
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

export function AdminBreakdownSection({
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

export function AdminRetentionSection({
  rows,
}: {
  readonly rows: readonly AdminRetention[];
}) {
  return (
    <section className="admin-panel">
      <header className="admin-panel__header">
        <div>
          <p>코호트</p>
          <h2>리텐션</h2>
        </div>
      </header>
      <div className="admin-retention">
        {rows.map((row) => (
          <article key={row.horizon}>
            <span>{row.horizon}</span>
            <strong>{percent(row.rate)}</strong>
            <small>
              {row.retained.toLocaleString()} / {row.eligible.toLocaleString()}
              명
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AdminPaymentStatus({
  payments,
}: {
  readonly payments: AdminAnalyticsOverview["payments"];
}) {
  return (
    <section className="admin-panel">
      <header className="admin-panel__header">
        <div>
          <p>결제 진단</p>
          <h2>결제·구독 상태</h2>
        </div>
      </header>
      <dl className="admin-diagnostics">
        <div>
          <dt>결제 성공</dt>
          <dd>{payments.succeeded.toLocaleString()}</dd>
        </div>
        <div>
          <dt>결제 실패율</dt>
          <dd>{percent(payments.failureRate)}</dd>
        </div>
        <div>
          <dt>멤버십 종료</dt>
          <dd>{payments.deactivated.toLocaleString()}</dd>
        </div>
        <div>
          <dt>해지 예약</dt>
          <dd>{payments.cancelScheduled.toLocaleString()}</dd>
        </div>
        <div>
          <dt>결제 지연</dt>
          <dd>{payments.pastDue.toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  );
}

export function AdminUsageTable({
  rows,
}: {
  readonly rows: readonly AdminUsage[];
}) {
  return (
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
            {rows.map((row) => (
              <tr key={row.event}>
                <th scope="row">{row.label}</th>
                <td>{row.events.toLocaleString()}</td>
                <td>{row.users.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <div className="admin-empty">선택 기간의 핵심 액션이 없습니다.</div>
      ) : null}
    </section>
  );
}

export function AdminEngagementTable({
  rows,
  periodOnlyNote = false,
}: {
  readonly rows: AdminAnalyticsOverview["engagement"];
  readonly periodOnlyNote?: boolean;
}) {
  const values = rows ?? [];
  return (
    <section className="admin-panel">
      <header>
        <h2>메뉴별 실제 체류 시간</h2>
        {periodOnlyNote ? (
          <p>
            기간 필터만 적용되며 channel/plan 필터는 적용되지 않습니다. 동의한
            방문자의 전경 시간만 측정하며 관리자·자동 테스트는 제외한 클라이언트
            관측값입니다.
          </p>
        ) : (
          <p>
            전체 유입 · 선택 기간 기준(채널·플랜 필터 미적용). 동의한 방문자의
            전경 시간만 측정하며, 관리자·자동 테스트는 수집에서 제외합니다.
            클라이언트 관측값입니다.
          </p>
        )}
      </header>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>메뉴 / 이벤트</th>
              <th>방문</th>
              <th>세션</th>
              <th>전경 체류 합계(초)</th>
            </tr>
          </thead>
          <tbody>
            {values.map((row) => (
              <tr key={`${row.surface}:${row.kind}`}>
                <th>
                  {row.surface} / {row.kind}
                </th>
                <td>{row.visits}</td>
                <td>{row.sessions}</td>
                <td>{row.visibleSeconds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {values.length === 0 ? (
        <div className="admin-empty">
          선택 기간의 engagement 데이터가 없습니다.
        </div>
      ) : null}
    </section>
  );
}

export function AdminUserTable({
  query,
  users,
  basePath = "/admin",
  includePageSize = false,
  explicitDetailLink = false,
}: {
  readonly query: AdminAnalyticsQuery;
  readonly users: AdminUserList;
  readonly basePath?: string;
  readonly includePageSize?: boolean;
  readonly explicitDetailLink?: boolean;
}) {
  return (
    <section className="admin-panel admin-users" id="users">
      <header className="admin-panel__header admin-users__header">
        <div>
          <p>사용자</p>
          <h2>가입자 목록</h2>
        </div>
        <form action={basePath} method="get" className="admin-user-search">
          <input type="hidden" name="range" value={query.range} />
          <input type="hidden" name="fromDate" value={query.fromDate} />
          <input type="hidden" name="throughDate" value={query.throughDate} />
          <input type="hidden" name="channel" value={query.channel} />
          {includePageSize ? (
            <input type="hidden" name="pageSize" value={query.pageSize} />
          ) : null}
          {query.plan ? (
            <input type="hidden" name="plan" value={query.plan} />
          ) : null}
          {query.status ? (
            <input type="hidden" name="status" value={query.status} />
          ) : null}
          {query.source ? (
            <input type="hidden" name="source" value={query.source} />
          ) : null}
          {query.campaign ? (
            <input type="hidden" name="campaign" value={query.campaign} />
          ) : null}
          <Search size={16} aria-hidden="true" />
          <input
            name="q"
            type="search"
            defaultValue={query.search ?? ""}
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
            {users.items.map((user) => (
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
                <td className="admin-acquisition">
                  <strong className="admin-acquisition__source">
                    {user.onboardingDiscoverySource === null
                      ? "미응답"
                      : ONBOARDING_DISCOVERY_SOURCE_LABELS_KO[
                          user.onboardingDiscoverySource
                        ]}
                  </strong>
                  <small className="admin-acquisition__campaign">
                    {user.acquisition?.source ?? user.acquisitionChannel}
                  </small>
                </td>
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
                    href={`${basePath}/${user.principalId}?${adminQueryString(query, undefined, includePageSize)}`}
                    aria-label={`${user.displayName || user.email || "사용자"} 상세 보기`}
                  >
                    {explicitDetailLink ? (
                      "상세 보기"
                    ) : (
                      <ArrowRight size={17} />
                    )}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.items.length === 0 ? (
        <div className="admin-empty">조건에 맞는 사용자가 없습니다.</div>
      ) : null}
      <footer className="admin-pagination">
        <span>
          총 {users.total.toLocaleString()}명 · {users.page}/{users.pageCount}{" "}
          페이지
        </span>
        <div>
          {users.page > 1 ? (
            <Link
              href={`${basePath}?${adminQueryString(query, users.page - 1, includePageSize)}#users`}
            >
              이전
            </Link>
          ) : null}
          {users.page < users.pageCount ? (
            <Link
              href={`${basePath}?${adminQueryString(query, users.page + 1, includePageSize)}#users`}
            >
              다음
            </Link>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
