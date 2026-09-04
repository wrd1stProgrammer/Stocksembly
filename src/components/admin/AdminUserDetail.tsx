import "../../styles/admin-dashboard.css";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  CreditCard,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { AdminUserDetail as AdminUserDetailData } from "../../admin/analyticsContracts";

type Props = { readonly data: AdminUserDetailData; readonly backQuery: string };

export function AdminUserDetail({ data, backQuery }: Props) {
  const user = data.user;
  return (
    <main className="admin-detail">
      <Link className="admin-detail__back" href={`/admin?${backQuery}#users`}>
        <ArrowLeft size={17} /> 사용자 목록
      </Link>
      <header className="admin-detail__header">
        <div className="admin-detail__avatar">
          <UserRound size={28} />
        </div>
        <div>
          <p>USER DETAIL</p>
          <h1>{user.displayName || user.email || "이름 없는 사용자"}</h1>
          <span>{user.email ?? user.principalId}</span>
        </div>
        <span className={`admin-plan is-${user.plan}`}>{user.plan}</span>
      </header>
      <section className="admin-detail__facts" aria-label="사용자 요약">
        <article>
          <CalendarDays size={18} />
          <span>첫 인증</span>
          <strong>{new Date(user.createdAt).toLocaleString("ko-KR")}</strong>
        </article>
        <article>
          <Clock3 size={18} />
          <span>최근 접속</span>
          <strong>{new Date(user.lastSeenAt).toLocaleString("ko-KR")}</strong>
        </article>
        <article>
          <CreditCard size={18} />
          <span>결제 상태</span>
          <strong>{user.status}</strong>
        </article>
        <article>
          <UserRound size={18} />
          <span>유입 채널</span>
          <strong>{user.acquisitionChannel}</strong>
        </article>
      </section>
      <section className="admin-panel admin-detail__acquisition">
        <header className="admin-panel__header">
          <div>
            <p>FIRST TOUCH</p>
            <h2>최초 유입 정보</h2>
          </div>
        </header>
        {user.acquisition === null ? (
          <div className="admin-empty">저장된 UTM 정보가 없습니다.</div>
        ) : (
          <dl>
            <div>
              <dt>Source / Medium</dt>
              <dd>
                {user.acquisition.source ?? "—"} /{" "}
                {user.acquisition.medium ?? "—"}
              </dd>
            </div>
            <div>
              <dt>Campaign</dt>
              <dd>{user.acquisition.campaign ?? "—"}</dd>
            </div>
            <div>
              <dt>Term</dt>
              <dd>{user.acquisition.term ?? "—"}</dd>
            </div>
            <div>
              <dt>Content</dt>
              <dd>{user.acquisition.content ?? "—"}</dd>
            </div>
            <div>
              <dt>Landing</dt>
              <dd>{user.acquisition.landingPath ?? "—"}</dd>
            </div>
            <div>
              <dt>Referrer</dt>
              <dd>{user.acquisition.referrerHost ?? "—"}</dd>
            </div>
            <div>
              <dt>Captured</dt>
              <dd>
                {user.acquisition.capturedAt
                  ? new Date(user.acquisition.capturedAt).toLocaleString(
                      "ko-KR",
                    )
                  : "—"}
              </dd>
            </div>
          </dl>
        )}
      </section>
      <section className="admin-panel admin-detail__timeline">
        <header className="admin-panel__header">
          <div>
            <p>최근 100건</p>
            <h2>사용자 액션</h2>
          </div>
        </header>
        {data.timeline.length === 0 ? (
          <div className="admin-empty">선택 기간의 활동이 없습니다.</div>
        ) : (
          <ol>
            {data.timeline.map((event) => (
              <li key={event.id}>
                <i />
                <div>
                  <strong>{event.label}</strong>
                  <small>{event.event}</small>
                </div>
                <time dateTime={event.occurredAt}>
                  {new Date(event.occurredAt).toLocaleString("ko-KR")}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
