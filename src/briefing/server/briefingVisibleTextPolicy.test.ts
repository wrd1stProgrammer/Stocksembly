import { describe, expect, it } from "vitest";
import {
  localizeBriefingDraft,
  repairBriefingDraft,
} from "./briefingDraftRepair";
import {
  type BriefingDraft,
  BriefingDraftSchema,
} from "./briefingSynthesisSchema";
import { isVisibleTextSafe } from "./briefingVisibleTextPolicy";

const forbidden =
  /(?:cutoffAt|volumeRatio20|fundamentalSeries|nextEpsForecast|coverageStart|observedEnd|barCount|marketState|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\bJSON\b|provider|evidence[ -]?window|supplied\s+(?:data|evidence|signals?|window))/u;
const brokenCopula = /(?:상승|하락|혼조|중립)다(?=\s|[.!?,]|$)/u;

function requiredAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Missing fixture at index ${index}`);
  }
  return value;
}

function safeDraft(): BriefingDraft {
  return {
    headline: "엔비디아의 당일 판단 기준을 점검합니다.",
    summary: "가격과 회사 확인 자료를 함께 보며 당일 판단을 업데이트합니다.",
    materialChanges: [
      {
        id: "signal-1",
        title: "확인된 변화",
        detail: "회사 발표의 핵심 내용을 확인했습니다.",
        investmentMeaning: "추가 확인 전까지 기존 판단을 유지합니다.",
      },
    ],
    agentViews: [
      {
        agent: "market",
        stance: "watch",
        headline: "가격 기준 점검",
        detail: "정해진 시점의 가격 움직임과 거래 강도를 함께 확인합니다.",
      },
    ],
    bullCase: "상방 조건은 가격과 사업 지표가 함께 개선되는 경우입니다.",
    bearCase: "하방 조건은 가격 약세와 사업 지표 둔화가 이어지는 경우입니다.",
    upcomingEvents: [
      {
        name: "실적 발표",
        scheduledAt: "2026-08-20T20:00:00.000Z",
        whyItMatters: "매출과 마진 전망이 유지되는지 확인합니다.",
        certainty: "confirmed",
      },
    ],
    todayChecks: [
      {
        horizon: "today",
        title: "당일 가격 확인",
        timing: "정규장 종가",
        metric: "가격과 거래 강도",
        confirmation: "가격과 거래 강도가 함께 유지되는 경우",
        ifConfirmed: "현재 판단을 뒷받침하는 근거가 강해집니다.",
        ifUnclear: "엇갈린 신호면 추가 확인을 기다립니다.",
        ifFailed: "당일 판단의 신뢰도를 낮춰서 봅니다.",
      },
    ],
    changedSincePrevious: "새로운 회사 발표를 반영해 판단 기준을 갱신했습니다.",
    stillWatching: "다음 회사 발표와 가격 반응을 계속 확인합니다.",
  };
}

function unsafeDraft(): BriefingDraft {
  const draft = safeDraft();
  return {
    ...draft,
    headline: "cutoffAt 이후 상승다.",
    summary: "provider JSON evidence-window와 volumeRatio20를 사용했습니다.",
    materialChanges: [
      {
        ...requiredAt(draft.materialChanges, 0),
        title: "fundamentalSeries 상승다",
        detail: "nextEpsForecast 하락다",
        investmentMeaning: "coverageStart 혼조다",
      },
    ],
    agentViews: [
      {
        ...requiredAt(draft.agentViews, 0),
        headline: "observedEnd 상승다",
        detail: "barCount와 marketState를 확인했습니다.",
      },
    ],
    bullCase: "supplied data 상승다.",
    bearCase: "snake_case 하락다.",
    upcomingEvents: [
      {
        ...requiredAt(draft.upcomingEvents, 0),
        name: "provider 일정",
        whyItMatters: "evidence window 혼조다",
      },
    ],
    todayChecks: [
      {
        ...requiredAt(draft.todayChecks, 0),
        title: "cutoffAt 상승다",
        timing: "volumeRatio20 이후",
        metric: "fundamentalSeries",
        confirmation: "nextEpsForecast",
        ifConfirmed: "coverageStart",
        ifUnclear: "next_report_at",
        ifFailed: "marketState 하락다",
      },
    ],
    changedSincePrevious: "provider data 상승다.",
    stillWatching: "supplied signals 혼조다.",
  };
}

function visibleStrings(draft: BriefingDraft): readonly string[] {
  return [
    draft.headline,
    draft.summary,
    draft.bullCase,
    draft.bearCase,
    ...draft.materialChanges.flatMap((change) => [
      change.title,
      change.detail,
      change.investmentMeaning,
    ]),
    ...draft.agentViews.flatMap((view) => [view.headline, view.detail]),
    ...draft.upcomingEvents.flatMap((event) => [
      event.name,
      event.whyItMatters,
    ]),
    ...draft.todayChecks.flatMap((check) => [
      check.title,
      check.timing,
      check.metric,
      check.confirmation,
      check.ifConfirmed,
      check.ifUnclear,
      check.ifFailed,
    ]),
    ...(draft.changedSincePrevious === null
      ? []
      : [draft.changedSincePrevious]),
    ...(draft.stillWatching === null ? [] : [draft.stillWatching]),
  ];
}

describe("briefing visible-text policy", () => {
  it("sanitizes every visible Korean field", () => {
    // Given
    const model = unsafeDraft();
    const fallback = safeDraft();

    // When
    const output = localizeBriefingDraft(
      "ko",
      repairBriefingDraft(model, fallback),
      "NVDA",
    );

    // Then
    expect(BriefingDraftSchema.safeParse(output).success).toBe(true);
    expect(visibleStrings(output)).not.toContain("next_report_at");
    expect(
      visibleStrings(output).every(
        (value) => !forbidden.test(value) && !brokenCopula.test(value),
      ),
    ).toBe(true);
    expect(output.materialChanges[0]?.id).toBe("signal-1");
    expect(output.upcomingEvents[0]?.scheduledAt).toBe(
      "2026-08-20T20:00:00.000Z",
    );
  });

  it("uses one safe fallback pass without looping", () => {
    // Given
    const model = unsafeDraft();
    const fallback = {
      ...unsafeDraft(),
      headline: "provider headline",
      changedSincePrevious: "provider data",
      stillWatching: "provider data",
    };

    // When
    const output = repairBriefingDraft(model, fallback);

    // Then
    expect(BriefingDraftSchema.safeParse(output).success).toBe(true);
    expect(output.headline).toBe("투자 판단에 필요한 확인 사항을 점검합니다.");
    expect(output.upcomingEvents).toEqual([]);
    expect(output.changedSincePrevious).toBeNull();
    expect(output.stillWatching).toBeNull();
  });

  it("repairs Korean copula artifacts before validation", () => {
    // Given
    const model = {
      ...safeDraft(),
      headline: "주가 흐름은 상승다.",
      bullCase: "상방 판단은 혼조다.",
      bearCase: "하방 판단은 하락다.",
    };

    // When
    const output = repairBriefingDraft(model, safeDraft());

    // Then
    expect(output.headline).toBe("주가 흐름은 상승입니다.");
    expect(output.bullCase).toBe("상방 판단은 혼조입니다.");
    expect(output.bearCase).toBe("하방 판단은 하락입니다.");
  });

  it("keeps uppercase market symbols, numbers, and natural language", () => {
    // Given
    const visibleMarketText = "BRK_B는 $123.45에서 4h 기준으로 거래됩니다.";

    // When
    const safe = isVisibleTextSafe(visibleMarketText);

    // Then
    expect(safe).toBe(true);
  });

  it("repairs Korean numeric particles and moving-average phrasing in every visible field", () => {
    // Given
    const model = {
      ...safeDraft(),
      headline: "$217.56는 가격 기준입니다.",
      summary: "2.08를 확인합니다.",
      materialChanges: [
        {
          ...requiredAt(safeDraft().materialChanges, 0),
          title: "2.02을 확인",
          detail: "1가 기준입니다.",
          investmentMeaning: "2과 3와 비교합니다.",
        },
      ],
      agentViews: [
        {
          ...requiredAt(safeDraft().agentViews, 0),
          detail: "20기간 이동평균을 확인합니다.",
        },
      ],
      todayChecks: [
        {
          ...requiredAt(safeDraft().todayChecks, 0),
          timing: "8는 확인 시점입니다.",
          metric: "0과 9와 비교합니다.",
        },
      ],
    };

    // When
    const output = localizeBriefingDraft("ko", model, "NVDA");

    // Then
    expect(output.headline).toBe("$217.56은 가격 기준입니다.");
    expect(output.summary).toBe("2.08을 확인합니다.");
    expect(output.materialChanges[0]?.title).toBe("2.02를 확인");
    expect(output.materialChanges[0]?.detail).toBe("1이 기준입니다.");
    expect(output.materialChanges[0]?.investmentMeaning).toBe(
      "2와 3과 비교합니다.",
    );
    expect(output.agentViews[0]?.detail).toBe(
      "최근 20개 봉 이동평균을 확인합니다.",
    );
    expect(output.todayChecks[0]?.timing).toBe("8은 확인 시점입니다.");
    expect(output.todayChecks[0]?.metric).toBe("0과 9와 비교합니다.");
  });
});
