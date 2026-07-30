"use client";

import { X } from "@phosphor-icons/react";
import Image from "next/image";
import type { Locale } from "../../lib/i18n";
import type { OfficeSceneManifestContract } from "../../research/officeSceneManifest";
import type { ResearchEvent } from "../../research/types";

type OfficeMember = OfficeSceneManifestContract["roster"][number];

function agentDescription(member: OfficeMember, locale: Locale): string {
  if (locale === "ko")
    return `${member.specialty.ko}를 담당하며, ${member.role.ko} 관점에서 핵심 근거와 반론을 점검합니다.`;
  return `${member.name.en} covers ${member.specialty.en.toLowerCase()}, testing the evidence and counterarguments through a ${member.role.en.toLowerCase()} lens.`;
}

export function OfficeAgentInfoPanel({
  member,
  locale,
  latestEvent,
  onClose,
}: {
  readonly member: OfficeMember;
  readonly locale: Locale;
  readonly latestEvent?: ResearchEvent;
  readonly onClose: () => void;
}) {
  const ko = locale === "ko";
  return (
    <aside
      className="office-agent-info"
      aria-live="polite"
      aria-label={
        ko
          ? `${member.name.ko} 에이전트 정보`
          : `${member.name.en} agent details`
      }
    >
      <header>
        <Image
          src={`/research/office-v7/portraits/${member.id}.png`}
          alt=""
          width={56}
          height={84}
        />
        <div>
          <h3>{member.name[locale]}</h3>
          <span>{member.role[locale]}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={ko ? "에이전트 정보 닫기" : "Close agent details"}
        >
          <X size={16} weight="bold" aria-hidden="true" />
        </button>
      </header>
      <p>
        {latestEvent === undefined
          ? agentDescription(member, locale)
          : latestEvent.detail[locale]}
      </p>
      {latestEvent === undefined ? null : (
        <footer>
          <span>{ko ? "현재 리서치 기록" : "Latest research activity"}</span>
          <strong>{latestEvent.summary[locale]}</strong>
        </footer>
      )}
    </aside>
  );
}
