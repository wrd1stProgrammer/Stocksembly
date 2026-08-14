import type { AdminAnalyticsQuery } from "../../admin/analyticsContracts";

type Props = { readonly query: AdminAnalyticsQuery };

export function AdminFilters({ query }: Props) {
  return (
    <form className="admin-filters" action="/admin" method="get">
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
        <span>언어</span>
        <select name="locale" defaultValue={query.locale ?? ""}>
          <option value="">전체</option>
          <option value="ko">한국어</option>
          <option value="en">English</option>
          <option value="ja">日本語</option>
          <option value="zh-TW">繁體中文</option>
        </select>
      </label>
      <button type="submit">적용</button>
    </form>
  );
}
