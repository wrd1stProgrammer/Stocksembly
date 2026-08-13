"use client";

import {
  CaretDown,
  MagnifyingGlass,
  SidebarSimple,
  User,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Brand } from "../Brand";
import type { ResearchSidebarProps } from "./researchSidebarTypes";

export function CompanyLogo({ symbol }: { readonly symbol: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="analysis-history__symbol" aria-hidden="true">
        {symbol.slice(0, 1)}
      </span>
    );
  }

  return (
    <span className="analysis-history__symbol is-logo">
      <Image
        src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`}
        alt=""
        width={24}
        height={24}
        unoptimized
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export function ResearchSidebar({
  company,
  history,
  locale,
  compactTitle,
  collapsed,
  onCollapsedChange,
  onRunSelect,
  onProfileOpen,
}: ResearchSidebarProps) {
  const [openHistoryGroups, setOpenHistoryGroups] = useState<
    ReadonlySet<string>
  >(() => new Set([history.at(0)?.symbol ?? company.symbol]));
  const [scrolling, setScrolling] = useState(false);
  const scrollTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (scrollTimer.current !== undefined)
        window.clearTimeout(scrollTimer.current);
    },
    [],
  );

  const markScrolling = (): void => {
    setScrolling(true);
    if (scrollTimer.current !== undefined)
      window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => setScrolling(false), 700);
  };

  const toggleHistoryGroup = (symbol: string): void => {
    setOpenHistoryGroups((current) => {
      const next = new Set(current);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  return (
    <aside
      className="department-rail research-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      aria-label={locale === "ko" ? "리서치 내비게이션" : "Research navigation"}
    >
      <header className="research-sidebar__header">
        <Brand locale={locale} />
        {compactTitle === undefined ? null : (
          <span
            className="research-sidebar__mobile-title"
            data-title={compactTitle}
            aria-hidden="true"
          />
        )}
        <button
          type="button"
          className="research-sidebar__panel-toggle"
          aria-expanded={!collapsed}
          aria-controls="research-sidebar-content"
          aria-label={
            locale === "ko"
              ? collapsed
                ? "좌측 사이드바 펼치기"
                : "좌측 사이드바 접기"
              : collapsed
                ? "Expand left sidebar"
                : "Collapse left sidebar"
          }
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <SidebarSimple
            size={20}
            weight={collapsed ? "regular" : "fill"}
            aria-hidden="true"
          />
        </button>
      </header>

      <div
        id="research-sidebar-content"
        data-scrolling={scrolling ? "true" : "false"}
        aria-hidden={collapsed}
        inert={collapsed ? true : undefined}
        onScroll={markScrolling}
      >
        <div className="research-sidebar__drawer-brand">
          <Brand locale={locale} />
        </div>
        <section className="company-brief" aria-label={company.company}>
          <div>
            <span>{company.symbol}</span>
            <p>{company.company}</p>
          </div>
          <div className="company-brief__quote">
            <strong>{company.price}</strong>
            {company.change === "—" ? null : (
              <small
                data-direction={company.change.startsWith("-") ? "down" : "up"}
              >
                {locale === "ko" ? "전일 대비 " : "Prev. "}
                {company.change}
              </small>
            )}
          </div>
        </section>

        <section className="analysis-history">
          <div className="research-sidebar__section-label">
            <span>{locale === "ko" ? "분석 기록" : "ANALYSIS HISTORY"}</span>
            <MagnifyingGlass size={15} />
          </div>
          <div className="analysis-history__list">
            {history.map((group, index) => {
              const symbol = index === 0 ? company.symbol : group.symbol;
              const companyName = index === 0 ? company.company : group.company;
              const isOpen = openHistoryGroups.has(group.symbol);
              const contentId = `history-${group.symbol.toLowerCase()}-runs`;
              return (
                <div
                  className="analysis-history__group"
                  data-open={isOpen || undefined}
                  key={group.symbol}
                >
                  <button
                    type="button"
                    className="analysis-history__group-toggle"
                    aria-expanded={isOpen}
                    aria-controls={contentId}
                    onClick={() => toggleHistoryGroup(group.symbol)}
                  >
                    <CompanyLogo symbol={symbol} />
                    <span>
                      <strong>{symbol}</strong>
                      <small>{companyName}</small>
                    </span>
                    <em>{group.runs.length}</em>
                    <CaretDown size={14} />
                  </button>
                  <div
                    className="analysis-history__collapse"
                    id={contentId}
                    aria-hidden={!isOpen}
                    inert={isOpen ? undefined : true}
                  >
                    <div>
                      <div className="analysis-history__runs">
                        {group.runs.map((run) => (
                          <button
                            key={run.runId ?? `${group.symbol}-${run.label}`}
                            type="button"
                            className={run.live ? "is-live" : ""}
                            aria-current={run.current ? "page" : undefined}
                            onClick={
                              run.runId === undefined || run.current
                                ? undefined
                                : () => {
                                    if (run.runId !== undefined)
                                      onRunSelect?.(run.runId, group.symbol);
                                  }
                            }
                          >
                            <span>
                              <strong title={run.label}>{run.label}</strong>
                              <small>{run.date}</small>
                            </span>
                            {run.live ? (
                              <i>{locale === "ko" ? "진행 중" : "Live"}</i>
                            ) : run.statusLabel === undefined ? null : (
                              <i>{run.statusLabel}</i>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {onProfileOpen === undefined ? null : (
        <nav
          className="research-sidebar__footer"
          aria-label={locale === "ko" ? "사용자 메뉴" : "User menu"}
        >
          <button type="button" onClick={onProfileOpen}>
            <User size={21} aria-hidden="true" />
            <span>{locale === "ko" ? "내 정보" : "My profile"}</span>
          </button>
        </nav>
      )}
    </aside>
  );
}
