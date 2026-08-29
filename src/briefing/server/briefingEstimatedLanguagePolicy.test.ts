import { describe, expect, it } from "vitest";
import type { BriefingSourceSnapshot } from "../domain/contracts";
import {
  localizeBriefingDraft,
  normalizeEstimatedBriefingLanguage,
} from "./briefingDraftRepair";
import {
  type BriefingDraft,
  BriefingDraftSchema,
} from "./briefingSynthesisSchema";

const snapshot: BriefingSourceSnapshot = {
  symbol: "JPM",
  company: "JPMorgan Chase & Co.",
  providerCode: "NYSE:JPM",
  marketDate: "2026-08-11",
  cutoffAt: "2026-08-11T12:30:00.000Z",
  coverageStart: "2026-08-10T12:30:00.000Z",
  quote: { value: 300 },
  signals: [],
  upcomingEvents: [
    {
      name: "JPM earnings",
      scheduledAt: "2026-10-29T20:00:00.000Z",
      whyItMatters: "JPM earnings를 확인합니다.",
      certainty: "estimated",
    },
    {
      name: "Investor day",
      scheduledAt: "2026-11-01T20:00:00.000Z",
      whyItMatters: "전략을 확인합니다.",
      certainty: "confirmed",
    },
  ],
  fundamentals: {},
  sources: [],
  limitations: [],
};

function requiredAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Missing fixture at index ${index}`);
  }
  return value;
}

function draft(): BriefingDraft {
  return {
    headline:
      "JPM earnings와 예정된 JPM 실적은 2026-10-29, 2026-11-01에 확인합니다.",
    summary:
      "이번 관측 구간의 이전 관측치인 $57.62억과 공급된 다음 분기 EPS 2.08를 함께 봅니다.",
    materialChanges: [
      {
        id: "signal-1",
        title: "제시된 다음 분기 EPS",
        detail: "JPM earnings 이후 2.08를 확인합니다.",
        investmentMeaning: "이번 관측 구간의 변화인지 판단합니다.",
      },
    ],
    agentViews: [
      {
        agent: "financial",
        stance: "watch",
        headline: "JPM earnings 점검",
        detail:
          "supplied trading strength와 제시된 다음 분기 EPS 2.08를 비교합니다.",
      },
    ],
    bullCase:
      "공급된 상단 기준과 예정 실적의 지표가 개선되면 상방 판단을 강화합니다.",
    bearCase:
      "제공된 하단 기준 아래로 2.08를 지키지 못하면 하방 위험을 봅니다.",
    upcomingEvents: [
      {
        name: "JPM earnings",
        scheduledAt: "2026-10-29T20:00:00.000Z",
        whyItMatters: "제공된 다음 분기 EPS 2.08를 확인합니다.",
        certainty: "estimated",
      },
    ],
    todayChecks: [
      {
        horizon: "today",
        title: "확정된 판단 지점",
        timing: "정규장 종가",
        metric: "제시된 다음 분기 EPS 2.02를",
        confirmation:
          "provided trading strength와 이번 관측 구간의 가격을 확인합니다.",
        ifConfirmed: "JPM earnings 반응을 확인합니다.",
        ifUnclear: "이전 관측치와 비교를 보류합니다.",
        ifFailed: "예정 실적의 반응을 낮춰서 봅니다.",
      },
    ],
    changedSincePrevious: "이번 관측 구간에 JPM earnings가 추가됐습니다.",
    stillWatching: "제공된 다음 분기 EPS 2.08를 계속 확인합니다.",
  };
}

describe("briefing estimated-language policy", () => {
  it("localizes reader-facing provider framing and Korean numeric grammar", () => {
    // Given
    const modelDraft = draft();

    // When
    const output = localizeBriefingDraft("ko", modelDraft, "JPM");

    // Then
    expect(BriefingDraftSchema.safeParse(output).success).toBe(true);
    expect(JSON.stringify(output)).not.toMatch(
      /(?:공급된|제공된|제시된)\s+다음 분기 EPS|(?:공급|제공|제시)된\s+(?:상단|하단|거래)|\b(?:supplied|provided)\b|이번 관측 구간|이전 관측치|\bJPM earnings\b|2\.08를|2\.02을|\$57\.62억/u,
    );
    expect(JSON.stringify(output)).toContain("2.08을");
    expect(JSON.stringify(output)).toContain("2.02를");
    expect(JSON.stringify(output)).toContain("57.62억 달러");
  });

  it("labels estimated event prose without downgrading confirmed dates", () => {
    // Given
    const localized = localizeBriefingDraft("ko", draft(), "JPM");

    // When
    const output = normalizeEstimatedBriefingLanguage(
      "ko",
      localized,
      snapshot,
    );

    // Then
    const freeText = [
      output.headline,
      output.summary,
      ...output.materialChanges.flatMap((change) => [
        change.title,
        change.detail,
        change.investmentMeaning,
      ]),
      ...output.agentViews.flatMap((view) => [view.headline, view.detail]),
      output.bullCase,
      output.bearCase,
      ...output.upcomingEvents.flatMap((event) => [
        event.name,
        event.whyItMatters,
      ]),
      ...output.todayChecks.flatMap((check) => [
        check.title,
        check.timing,
        check.metric,
        check.confirmation,
        check.ifConfirmed,
        check.ifUnclear,
        check.ifFailed,
      ]),
      output.changedSincePrevious ?? "",
      output.stillWatching ?? "",
    ].join(" ");
    expect(BriefingDraftSchema.safeParse(output).success).toBe(true);
    expect(freeText).toContain("2026-10-29 (예상)");
    expect(freeText).not.toMatch(/2026-10-29(?! \(예상\))/u);
    expect(freeText).toContain("예상 JPM 실적");
    expect(freeText).toContain("예상 판단 시점");
    expect(freeText).not.toMatch(/(?:확정된 판단 지점|예정 실적)/u);
    expect(freeText).toContain("2026-11-01");
    expect(freeText).not.toContain("2026-11-01 (예상)");
  });

  it("labels an estimated next-catalyst timing exactly once", () => {
    // Given
    const localized = localizeBriefingDraft(
      "ko",
      {
        ...draft(),
        todayChecks: [
          {
            ...requiredAt(draft().todayChecks, 0),
            horizon: "next_catalyst",
            timing: "2026-10-29",
          },
        ],
        upcomingEvents: [
          {
            ...requiredAt(draft().upcomingEvents, 0),
            name: "JPM 실적 발표 (예상) (예상)",
          },
          {
            name: "Investor day",
            scheduledAt: "2026-11-01T20:00:00.000Z",
            whyItMatters: "전략을 확인합니다.",
            certainty: "confirmed",
          },
        ],
      },
      "JPM",
    );

    // When
    const output = normalizeEstimatedBriefingLanguage(
      "ko",
      localized,
      snapshot,
    );

    // Then
    expect(output.todayChecks[0]?.timing).toBe("2026-10-29 (예상)");
    expect(output.upcomingEvents[0]?.name).toBe("JPM 실적 발표 (예상)");
    expect(output.upcomingEvents[1]?.scheduledAt).toBe(
      "2026-11-01T20:00:00.000Z",
    );
    expect(output.upcomingEvents[1]?.name).not.toContain("(예상)");
  });

  it("removes estimated date qualifiers without changing confirmed dates", () => {
    // Given
    const localized = localizeBriefingDraft(
      "ko",
      {
        ...draft(),
        summary: "추정된 2026-10-29 (예상)에 실적을 확인합니다.",
        todayChecks: [
          {
            ...requiredAt(draft().todayChecks, 0),
            horizon: "today",
            timing: "추정된 2026-10-29 (예상)",
          },
        ],
        changedSincePrevious: "확정된 2026-11-01 일정은 유지됩니다.",
      },
      "JPM",
    );

    // When
    const output = normalizeEstimatedBriefingLanguage(
      "ko",
      localized,
      snapshot,
    );

    // Then
    expect(output.summary).toBe("2026-10-29 (예상)에 실적을 확인합니다.");
    expect(output.todayChecks[0]?.timing).toBe("2026-10-29 (예상)");
    expect(output.changedSincePrevious).toBe(
      "확정된 2026-11-01 일정은 유지됩니다.",
    );
  });

  it("collapses duplicate estimated qualifiers in reader-facing prose", () => {
    // Given
    const localized = localizeBriefingDraft(
      "ko",
      {
        ...draft(),
        materialChanges: [
          {
            ...requiredAt(draft().materialChanges, 0),
            detail: "예상 (예상) 실적 발표를 확인합니다.",
          },
        ],
        stillWatching: "2026-10-29 (예상) 예정 실적 발표를 계속 확인합니다.",
      },
      "JPM",
    );

    // When
    const output = normalizeEstimatedBriefingLanguage(
      "ko",
      localized,
      snapshot,
    );

    // Then
    expect(output.materialChanges[0]?.detail).toBe(
      "(예상) 실적 발표를 확인합니다.",
    );
    expect(output.stillWatching).toBe(
      "2026-10-29 (예상) 실적 발표를 계속 확인합니다.",
    );
  });

  it("removes redundant estimated-date prose in summary and still watching", () => {
    // Given
    const msftSnapshot = {
      ...snapshot,
      upcomingEvents: [
        {
          ...requiredAt(snapshot.upcomingEvents, 0),
          scheduledAt: "2026-10-27T20:00:00.000Z",
        },
      ],
    };
    const localized = localizeBriefingDraft(
      "ko",
      {
        ...draft(),
        summary: "2026-10-27 (예상)로 추정되며 일정을 확인합니다.",
        stillWatching: "2026-10-27 (예상)로 추정됩니다.",
      },
      "MSFT",
    );

    // When
    const output = normalizeEstimatedBriefingLanguage(
      "ko",
      localized,
      msftSnapshot,
    );

    // Then
    expect(output.summary).toBe("2026-10-27 (예상) 일정을 확인합니다.");
    expect(output.stillWatching).toBe("2026-10-27 (예상).");
  });

  it("normalizes stacked estimated earnings decision phrasing", () => {
    // Given
    const amznSnapshot = {
      ...snapshot,
      upcomingEvents: [
        {
          ...requiredAt(snapshot.upcomingEvents, 0),
          scheduledAt: "2026-10-22T20:00:00.000Z",
        },
      ],
    };
    const localized = localizeBriefingDraft(
      "ko",
      {
        ...draft(),
        stillWatching: "2026-10-22 (예상)로 예정된 추정 실적 결정 시점",
      },
      "AMZN",
    );

    // When
    const output = normalizeEstimatedBriefingLanguage(
      "ko",
      localized,
      amznSnapshot,
    );

    // Then
    expect(output.stillWatching).toBe("2026-10-22 (예상) 실적 발표 시점");
  });

  it("labels Korean full and short estimated dates without changing confirmed events", () => {
    // Given
    const amznSnapshot = {
      ...snapshot,
      upcomingEvents: [
        {
          ...requiredAt(snapshot.upcomingEvents, 0),
          scheduledAt: "2026-10-22T20:00:00.000Z",
        },
        requiredAt(snapshot.upcomingEvents, 1),
      ],
    };
    const localized = localizeBriefingDraft(
      "ko",
      {
        ...draft(),
        summary: "2026년 10월 22일 예정된 실적 발표를 확인합니다.",
        stillWatching: "10월 22일 확정된 실적 발표를 확인합니다.",
        changedSincePrevious: "2026년 11월 1일 확정된 일정은 유지됩니다.",
      },
      "AMZN",
    );

    // When
    const output = normalizeEstimatedBriefingLanguage(
      "ko",
      localized,
      amznSnapshot,
    );

    // Then
    expect(output.summary).toBe(
      "2026년 10월 22일 (예상) 실적 발표를 확인합니다.",
    );
    expect(output.stillWatching).toBe(
      "10월 22일 (예상) 실적 발표를 확인합니다.",
    );
    expect(output.changedSincePrevious).toBe(
      "2026년 11월 1일 확정된 일정은 유지됩니다.",
    );
  });
});
