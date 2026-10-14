import {
  Activity,
  CreditCard,
  LayoutDashboard,
  ShieldCheck,
  UserRound,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import "../../styles/admin-dashboard.css";

const items = [
  { key: "overview", href: "/admin2", label: "요약", icon: LayoutDashboard },
  {
    key: "behavior",
    href: "/admin2/behavior",
    label: "사용자 행동",
    icon: Activity,
  },
  { key: "users", href: "/admin2/users", label: "사용자", icon: UserRound },
  {
    key: "acquisition",
    href: "/admin2/acquisition",
    label: "유입·전환",
    icon: Waypoints,
  },
  { key: "billing", href: "/admin2/billing", label: "결제", icon: CreditCard },
] as const;

export type Admin2Menu = (typeof items)[number]["key"];

export function AdminShell({
  active,
  children,
}: {
  readonly active: Admin2Menu;
  readonly children: ReactNode;
}) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin2">
          <span>S</span>
          <strong>Stocksembly</strong>
        </Link>
        <nav aria-label="관리자 메뉴">
          {items.map(({ key, href, label, icon: Icon }) => (
            <Link
              key={key}
              className={key === active ? "is-active" : undefined}
              href={href}
              aria-current={key === active ? "page" : undefined}
            >
              <Icon size={18} /> {label}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar__guard">
          <ShieldCheck size={18} />
          <span>관리자 전용</span>
        </div>
        <Link className="admin-back-link" href="/">
          서비스로 돌아가기
        </Link>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}

export function AdminPageHeading({
  eyebrow,
  title,
  generatedAt,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly generatedAt?: string;
  readonly children?: ReactNode;
}) {
  return (
    <header className="admin-heading">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        {generatedAt ? (
          <span>
            생성 {new Date(generatedAt).toLocaleString("ko-KR")} · KST 기준
          </span>
        ) : null}
      </div>
      {children}
    </header>
  );
}
