import type { AdminAnalyticsQuery } from "../../admin/analyticsContracts";

type Props = {
  readonly query: AdminAnalyticsQuery;
  readonly action?: string;
  readonly showAcquisition?: boolean;
  readonly showLocale?: boolean;
  readonly showPlanStatus?: boolean;
  readonly showPageSize?: boolean;
  readonly preserveSearch?: boolean;
};

export function AdminFilters({
  query,
  action = "/admin",
  showAcquisition = true,
  showLocale = true,
  showPlanStatus = false,
  showPageSize = false,
  preserveSearch = false,
}: Props) {
  return (
    <form className="admin-filters" action={action} method="get">
      <label>
        <span>기간</span>
        <select name="range" defaultValue={query.range}>
          <option value="7">최근 7일</option>
          <option value="30">최근 30일</option>
          <option value="90">최근 90일</option>
          <option value="custom">직접 선택</option>
        </select>
      </label>
      <label>
        <span>시작일</span>
        <input type="date" name="fromDate" defaultValue={query.fromDate} />
      </label>
      <label>
        <span>종료일</span>
        <input
          type="date"
          name="throughDate"
          defaultValue={query.throughDate}
        />
      </label>
      {showAcquisition ? (
        <>
          <label>
            <span>유입 채널</span>
            <select name="channel" defaultValue={query.channel}>
              <option value="all">전체</option>
              <option value="direct">직접 유입</option>
              <option value="paid_search">유료 검색</option>
              <option value="organic_search">자연 검색</option>
              <option value="social">소셜</option>
              <option value="email">이메일</option>
              <option value="referral">추천·링크</option>
              <option value="campaign">캠페인</option>
              <option value="unknown">미확인</option>
            </select>
          </label>
          <label>
            <span>UTM 소스</span>
            <input
              type="text"
              name="source"
              defaultValue={query.source ?? ""}
              placeholder="threads"
            />
          </label>
          <label>
            <span>UTM 캠페인</span>
            <input
              type="text"
              name="campaign"
              defaultValue={query.campaign ?? ""}
              placeholder="threads_profile"
            />
          </label>
        </>
      ) : (
        <input type="hidden" name="channel" value={query.channel} />
      )}
      {showLocale ? (
        <label>
          <span>언어</span>
          <select name="locale" defaultValue={query.locale ?? ""}>
            <option value="">전체</option>
            <option value="ko">한국어</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="zh-TW">繁體中文</option>
          </select>
        </label>
      ) : query.locale ? (
        <input type="hidden" name="locale" value={query.locale} />
      ) : null}
      {showPlanStatus ? (
        <>
          <label>
            <span>플랜</span>
            <select name="plan" defaultValue={query.plan ?? ""}>
              <option value="">전체</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="ultra">Ultra</option>
            </select>
          </label>
          <label>
            <span>상태</span>
            <select name="status" defaultValue={query.status ?? ""}>
              <option value="">전체</option>
              <option value="active">활성</option>
              <option value="trialing">체험</option>
              <option value="past_due">결제 지연</option>
              <option value="cancelled">취소</option>
            </select>
          </label>
        </>
      ) : null}
      {showPageSize ? (
        <label>
          <span>페이지 크기</span>
          <select name="pageSize" defaultValue={String(query.pageSize)}>
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
      ) : null}
      {preserveSearch && query.search ? (
        <input type="hidden" name="q" value={query.search} />
      ) : null}
      <button type="submit">적용</button>
    </form>
  );
}
