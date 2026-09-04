import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PixelOfficeGame } from "../components/research/PixelOfficeGame";
import { copy } from "../lib/i18n";
import { agents, phaseLabels, researchEvents } from "./mockResearch";
import { AGENT_IDS, OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

const expectedIdentity = {
  market: ["Maya", "마야", "Market Lead", "시장 책임"],
  market_news: ["June", "준", "News & Macro", "뉴스·거시"],
  company: ["Ethan", "이든", "Company Lead", "기업 책임"],
  company_product: ["Aria", "아리아", "Product Analyst", "제품 분석가"],
  company_competition: ["Leo", "레오", "Competitive Intelligence", "경쟁 정보"],
  financial: ["Noah", "노아", "Financial Lead", "재무 책임"],
  valuation: ["Sofia", "소피아", "Valuation & Chart", "가치평가·차트"],
  financial_quality: ["Hana", "하나", "Earnings Quality", "이익의 질"],
  risk: ["Liam", "리암", "Risk Lead", "리스크 책임"],
  risk_policy: ["Min", "민", "Policy & Scenario", "정책·시나리오"],
  chair: ["Dr. Park", "박 의장", "Research Chair", "리서치 의장"],
} as const;

function renderMarkup(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(element);
  return container;
}

describe("office public copy", () => {
  it("provides the approved bilingual identity and role for all eleven actors", () => {
    // Given
    const profiles = Object.fromEntries(
      agents.map((agent) => [
        agent.id,
        [agent.name.en, agent.name.ko, agent.role.en, agent.role.ko],
      ]),
    );
    // When
    const profileIds = agents.map((agent) => agent.id);
    // Then
    expect(profileIds).toEqual(AGENT_IDS);
    expect(profiles).toEqual(expectedIdentity);
  });

  it("keeps every public research field complete in Korean and English", () => {
    // Given
    const localizedFields = [
      ...agents.flatMap((agent) => [agent.name, agent.role, agent.specialty]),
      ...researchEvents.flatMap((event) => [event.summary, event.detail]),
      ...Object.values(phaseLabels),
    ];
    // When
    const incomplete = localizedFields.filter(
      (field) => field.en.trim().length === 0 || field.ko.trim().length === 0,
    );
    // Then
    expect(incomplete).toEqual([]);
  });

  it("keeps the approved research-file hero description in both locales", () => {
    // Given
    const expectedHeroCopy = {
      en: {
        descriptionLead:
          "They investigate independently, challenge each other's findings, and hand you a research file with every source linked.",
        descriptionTail: "No buy or sell calls. No price targets.",
      },
      ko: {
        descriptionLead:
          "각자 조사한 결과를 서로 반박하고, 출처가 링크된 리서치 파일로 정리합니다.",
        descriptionTail: "매매 추천도, 목표가도 없습니다.",
      },
    } as const;

    // When
    const heroCopy = {
      en: {
        descriptionLead: copy.en.hero.descriptionLead,
        descriptionTail: copy.en.hero.descriptionTail,
      },
      ko: {
        descriptionLead: copy.ko.hero.descriptionLead,
        descriptionTail: copy.ko.hero.descriptionTail,
      },
    };

    // Then
    expect(heroCopy).toEqual(expectedHeroCopy);
  });

  it("contains no stale six-person or private-reasoning language", () => {
    // Given
    const publicText = JSON.stringify({
      copy,
      agents,
      researchEvents,
      phaseLabels,
    });
    const prohibited = [
      /\bsix (?:agents|specialists)\b/i,
      /6명의? (?:AI )?분석가/,
      /chain[- ]of[- ]thought/i,
      /reasoning trace/i,
      /hidden reasoning/i,
      /internal monologue/i,
      /사고 과정/,
      /추론 과정/,
      /내부 추론/,
      /생각의 사슬/,
    ];
    // When
    const matches = prohibited.flatMap(
      (pattern) => publicText.match(pattern) ?? [],
    );
    // Then
    expect(matches).toEqual([]);
  });

  it("announces exactly the manifest gathering group without a stale count", () => {
    // Given
    const forumMembers = OFFICE_SCENE_MANIFEST.roster.filter(
      (member) => member.finalLocation === "forum",
    );
    const nonForumMembers = OFFICE_SCENE_MANIFEST.roster.filter(
      (member) => member.finalLocation !== "forum",
    );
    const forumAgentIds = forumMembers.map((member) => member.id);

    for (const locale of ["en", "ko"] as const) {
      // When
      const rendered = renderMarkup(
        createElement(PixelOfficeGame, {
          phase: "gathering",
          locale,
          isPaused: false,
          activeAgentIds: forumAgentIds,
        }),
      );
      const status =
        rendered.querySelector('[aria-live="polite"]')?.textContent ?? "";

      // Then
      for (const member of forumMembers) {
        expect(status).toContain(member.name[locale]);
      }
      for (const member of nonForumMembers) {
        expect(status).not.toContain(member.name[locale]);
      }
      expect(status).not.toMatch(/\bsix\b|6명/i);
    }
  });

  it("describes calibration actors from the canonical v7 manifest", async () => {
    // Given
    const { OfficeCalibration } = await import(
      "../components/research/OfficeCalibration"
    );

    // When
    const rendered = renderMarkup(createElement(OfficeCalibration));

    // Then
    expect(rendered).toHaveTextContent(
      `${OFFICE_SCENE_MANIFEST.roster.length} manifest actors`,
    );
    expect(rendered).toHaveTextContent("snapshot-owned choreography");
  });
});
