import { describe, expect, it } from "vitest";
import { BriefingDraftSchema } from "./briefingSynthesisSchema";

const view = {
  agent: "market" as const,
  stance: "watch" as const,
  headline: "Opening range test",
  detail: "Price must hold the supplied prior high after the open.",
};

const check = {
  horizon: "today" as const,
  title: "Opening confirmation",
  timing: "First 30 minutes",
  metric: "Prior high and trading strength",
  confirmation: "Price holds above the supplied prior high.",
  ifConfirmed: "Same-day demand has stronger support.",
  ifUnclear: "Mixed evidence preserves the current view pending follow-up.",
  ifFailed: "Treat the initial move as unconfirmed.",
};

const event = {
  scheduledAt: "2026-08-26T20:00:00.000Z",
  name: "Quarterly earnings release",
  whyItMatters: "The release updates growth, margin, and forward guidance.",
  certainty: "confirmed" as const,
};

const draft = {
  headline: "A decision-relevant development",
  summary: "A sufficiently detailed summary tied only to supplied evidence.",
  materialChanges: [],
  agentViews: [view],
  bullCase: "The supplied upside condition holds.",
  bearCase: "The supplied downside condition holds.",
  upcomingEvents: [],
  todayChecks: [check],
  changedSincePrevious: null,
  stillWatching: null,
};

describe("briefing synthesis model schema", () => {
  it("accepts one to three views and checks when every check has a horizon", () => {
    // Given
    const candidates = [
      draft,
      {
        ...draft,
        agentViews: [view, { ...view, agent: "company" as const }],
        upcomingEvents: [event],
        todayChecks: [
          check,
          {
            ...check,
            horizon: "next_catalyst" as const,
            timing: "2026-08-26",
          },
        ],
      },
      {
        ...draft,
        agentViews: [
          view,
          { ...view, agent: "company" as const },
          { ...view, agent: "risk" as const },
        ],
        upcomingEvents: [event],
        todayChecks: [
          check,
          {
            ...check,
            horizon: "next_catalyst" as const,
            timing: "2026-08-26",
            title: "Next release confirmation",
            metric: "Forward guidance and operating margin",
          },
          {
            ...check,
            title: "Closing range confirmation",
            metric: "Closing price and full-session trading strength",
          },
        ],
      },
    ];

    // When
    const results = candidates.map((candidate) =>
      BriefingDraftSchema.safeParse(candidate),
    );

    // Then
    expect(results.every((result) => result.success)).toBe(true);
  });

  it("rejects a model check without a horizon", () => {
    // Given
    const { horizon: _horizon, ...checkWithoutHorizon } = check;

    // When
    const result = BriefingDraftSchema.safeParse({
      ...draft,
      todayChecks: [checkWithoutHorizon],
    });

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects a next-catalyst check whose timing is not an ISO market date", () => {
    const result = BriefingDraftSchema.safeParse({
      ...draft,
      upcomingEvents: [event],
      todayChecks: [
        {
          ...check,
          horizon: "next_catalyst",
          timing: "Aug 26",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a next-catalyst date absent from upcoming events", () => {
    const result = BriefingDraftSchema.safeParse({
      ...draft,
      upcomingEvents: [event],
      todayChecks: [
        {
          ...check,
          horizon: "next_catalyst",
          timing: "2026-08-27",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("keeps same-session timing as executable prose", () => {
    const result = BriefingDraftSchema.safeParse({
      ...draft,
      todayChecks: [{ ...check, timing: "16:00 ET close" }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects repeated agent lenses at the model boundary", () => {
    // Given
    const repeatedViews = [view, { ...view }];

    // When
    const result = BriefingDraftSchema.safeParse({
      ...draft,
      agentViews: repeatedViews,
    });

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects repeated decision checks at the model boundary", () => {
    // Given / When
    const result = BriefingDraftSchema.safeParse({
      ...draft,
      todayChecks: [check, { ...check }],
    });

    // Then
    expect(result.success).toBe(false);
  });

  it("rejects a decision check without an explicit neutral outcome", () => {
    const { ifUnclear: _ifUnclear, ...checkWithoutNeutral } = check;
    const result = BriefingDraftSchema.safeParse({
      ...draft,
      todayChecks: [checkWithoutNeutral],
    });

    expect(result.success).toBe(false);
  });
});
