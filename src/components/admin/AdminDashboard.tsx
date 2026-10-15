import "../../styles/admin-dashboard.css";
import {
  CreditCard,
  LayoutDashboard,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { AdminAnalyticsOverview } from "../../admin/analyticsContracts";
import {
  AdminBreakdownSection,
  AdminDataStatus,
  AdminEngagementTable,
  AdminFunnel,
  AdminKpiCards,
  AdminPaymentStatus,
  AdminRetentionSection,
  AdminUsageTable,
  AdminUserTable,
} from "./AdminAnalyticsSections";
import { AdminFilters } from "./AdminFilters";
import { AdminTrendChart } from "./AdminTrendChart";

type Props = { readonly data: AdminAnalyticsOverview };

export function AdminDashboard({ data }: Props) {
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
        <AdminDataStatus status={data.status} />
        <AdminKpiCards data={data} />
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
          <AdminFunnel
            title="가입 → 활성화 → 결제"
            funnel={data.signupFunnel}
            activation
          />
          <AdminFunnel
            title="결제 이동 준비 완료 → 결제"
            funnel={data.checkoutFunnel}
          />
        </div>
        <div className="admin-two-column">
          <AdminBreakdownSection
            title="가입 설문 유입 경로"
            rows={data.onboardingDiscoverySources}
          />
          <AdminBreakdownSection
            title="자동 감지 유입 채널"
            rows={data.acquisition}
          />
        </div>
        <div className="admin-two-column">
          <AdminBreakdownSection
            title="UTM 소스"
            rows={data.acquisitionSources}
          />
          <AdminBreakdownSection
            title="UTM 캠페인"
            rows={data.acquisitionCampaigns}
          />
        </div>
        <div className="admin-two-column">
          <AdminBreakdownSection title="현재 플랜" rows={data.plans} />
          <AdminBreakdownSection title="현재 상태" rows={data.statuses} />
        </div>
        <div className="admin-two-column">
          <AdminRetentionSection rows={data.retention} />
          <div id="payments">
            <AdminPaymentStatus payments={data.payments} />
          </div>
        </div>
        <AdminUsageTable rows={data.usage} />
        <AdminEngagementTable rows={data.engagement} />
        <AdminUserTable query={data.query} users={data.users} />
      </main>
    </div>
  );
}
