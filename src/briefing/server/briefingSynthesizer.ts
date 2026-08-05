import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Locale } from "../../lib/i18n";
import {
  AttemptIdSchema,
  JobIdSchema,
  RunIdSchema,
} from "../../research/domain/ids";
import {
  type CommittedLaunchReservation,
  codexInputHash,
  type LaunchReservationClaim,
  type LaunchReservationReader,
} from "../../research/server/codex/codexReservation";
import { createCodexPort } from "../../research/server/codex/codexRunner";
import type {
  BriefingAgentView,
  BriefingEditionPayload,
  BriefingSignal,
  BriefingSourceSnapshot,
} from "../domain/contracts";

const AgentViewSchema = z
  .object({
    agent: z.enum(["market", "company", "financial", "risk"]),
    stance: z.enum(["positive", "negative", "watch", "neutral"]),
    headline: z.string().min(4).max(140),
    detail: z.string().min(10).max(500),
  })
  .strict();

const LocalizedSignalSchema = z
  .object({
    id: z.string().min(1).max(200),
    title: z.string().min(3).max(180),
    detail: z.string().min(8).max(650),
    investmentMeaning: z.string().min(8).max(500),
  })
  .strict();

const UpcomingEventSchema = z
  .object({
    scheduledAt: z.string().datetime(),
    name: z.string().min(2).max(160),
    whyItMatters: z.string().min(8).max(400),
  })
  .strict();

const BriefingDraftSchema = z
  .object({
    headline: z.string().min(6).max(180),
    summary: z.string().min(20).max(700),
    materialChanges: z.array(LocalizedSignalSchema).max(5),
    agentViews: z.array(AgentViewSchema).min(2).max(4),
    bullCase: z.string().min(10).max(500),
    bearCase: z.string().min(10).max(500),
    upcomingEvents: z.array(UpcomingEventSchema).max(3),
    todayChecks: z.array(z.string().min(5).max(220)).min(2).max(4),
    changedSincePrevious: z.string().min(8).max(450).optional(),
    stillWatching: z.string().min(8).max(350).optional(),
  })
  .strict();

type BriefingDraft = z.infer<typeof BriefingDraftSchema>;

function normalizedTerms(value: string): ReadonlySet<string> {
  return new Set(
    value
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((term) => term.length >= 3),
  );
}

function similarity(left: string, right: string): number {
  const a = normalizedTerms(left);
  const b = normalizedTerms(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const term of a) if (b.has(term)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function novelSignals(
  snapshot: BriefingSourceSnapshot,
  previous: BriefingEditionPayload | undefined,
): readonly BriefingSignal[] {
  if (previous === undefined) return snapshot.signals;
  return snapshot.signals.filter((signal) => {
    if (signal.kind === "price") return true;
    return !previous.materialChanges.some(
      (prior) =>
        prior.id === signal.id ||
        similarity(
          `${prior.title} ${prior.detail}`,
          `${signal.title} ${signal.detail}`,
        ) >= 0.68,
    );
  });
}

function attentionFor(
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
): BriefingEditionPayload["attention"] {
  const change = Math.abs(snapshot.quote.changePercent ?? 0);
  const riskSignals = signals.filter(
    (signal) => signal.kind === "risk" || signal.direction === "negative",
  ).length;
  const imminent = snapshot.upcomingEvents.some(
    (event) =>
      Date.parse(event.scheduledAt) - Date.parse(snapshot.cutoffAt) <=
      3 * 24 * 60 * 60 * 1_000,
  );
  if (change >= 3 || riskSignals >= 2 || (signals.length >= 3 && imminent))
    return "high";
  if (change >= 1 || signals.length > 0 || imminent) return "medium";
  return "low";
}

function fallbackDraft(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
  previous: BriefingEditionPayload | undefined,
): BriefingDraft {
  const change = snapshot.quote.changePercent;
  const move =
    change === undefined
      ? locale === "ko"
        ? "가격 확인 전"
        : "Price pending"
      : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
  const hasChanges = signals.length > 0;
  const headline = hasChanges
    ? locale === "ko"
      ? `${snapshot.symbol}, 지난 24시간의 새 신호 ${signals.length}건과 ${move} 움직임을 함께 확인할 시점`
      : `${snapshot.symbol}: ${signals.length} new 24-hour signal${signals.length === 1 ? "" : "s"} alongside a ${move} move`
    : locale === "ko"
      ? `${snapshot.symbol}, 논지를 바꿀 새 사건은 없고 ${move} 가격 확인이 우선`
      : `${snapshot.symbol}: no new thesis-changing event; validate the ${move} move`;
  const summary = hasChanges
    ? locale === "ko"
      ? "새 정보가 실제 매출·마진·현금흐름 기대를 바꾸는지와 개장 후 가격·거래량이 같은 방향으로 확인되는지를 분리해 봐야 합니다."
      : "Separate whether the new information changes revenue, margin, or cash-flow expectations from whether price and volume confirm it after the open."
    : locale === "ko"
      ? "반복 뉴스는 제외했습니다. 오늘은 새로운 서사를 만들기보다 다음 공시 일정과 개장 후 가격 확인에 집중하는 편이 낫습니다."
      : "Repeated news was removed. Today is better spent watching the next dated event and post-open confirmation than inventing a new narrative.";
  const localizedChanges = signals.slice(0, 5).map((signal) => ({
    id: signal.id,
    title: signal.title,
    detail: signal.detail,
    investmentMeaning:
      locale === "ko"
        ? signal.kind === "risk"
          ? "보고 실적보다 먼저 하방 범위를 바꿀 수 있는 신호입니다."
          : "다음 실적에서 매출·마진·현금흐름으로 확인될 때만 투자 논지에 반영할 수 있습니다."
        : signal.investmentMeaning,
  }));
  const baseViews: BriefingAgentView[] = [
    {
      agent: "market",
      stance: Math.abs(change ?? 0) >= 1 ? "watch" : "neutral",
      headline:
        locale === "ko"
          ? `개장 후 ${move} 움직임의 지속성 확인`
          : `Test whether the ${move} move holds after the open`,
      detail:
        locale === "ko"
          ? "시초가만 보지 말고 거래량과 전일 종가 회복 여부를 함께 확인합니다."
          : "Read the opening print together with volume and any recovery of the prior close.",
    },
    {
      agent: "company",
      stance: signals.some((signal) => signal.kind === "company")
        ? "watch"
        : "neutral",
      headline:
        locale === "ko"
          ? "새 사건의 사업 영향 분리"
          : "Separate the operating impact of new events",
      detail:
        locale === "ko"
          ? "헤드라인이 실제 수요·가격·제품 일정 중 무엇을 바꾸는지 확인합니다."
          : "Identify whether the headline changes demand, pricing, or the product timetable.",
    },
    {
      agent: "financial",
      stance: "watch",
      headline:
        locale === "ko"
          ? "실적 추정치로 이어질 숫자 확인"
          : "Look for a number that changes estimates",
      detail:
        locale === "ko"
          ? "매출 성장률이나 마진 기대를 바꾸지 않는 뉴스는 재무 논지에서 낮게 평가합니다."
          : "Downweight news that cannot change revenue growth or margin expectations.",
    },
    {
      agent: "risk",
      stance: signals.some((signal) => signal.kind === "risk")
        ? "negative"
        : "neutral",
      headline:
        locale === "ko"
          ? "하방 전이 경로 점검"
          : "Check the downside transmission path",
      detail:
        locale === "ko"
          ? "규제·소송·수요 약화가 현금흐름에 닿는 경로가 있는지 봅니다."
          : "Test whether regulation, litigation, or weaker demand can reach cash flow.",
    },
  ];
  return {
    headline,
    summary,
    materialChanges: localizedChanges,
    agentViews: baseViews,
    bullCase:
      locale === "ko"
        ? "새 긍정 신호가 개장 후 거래량과 함께 유지되고 다음 실적 추정치 개선으로 연결되면 상방 논리가 강화됩니다."
        : "The upside case strengthens if positive news holds with post-open volume and reaches forward estimates.",
    bearCase:
      locale === "ko"
        ? "가격 반응만 앞서고 매출·마진 근거가 따라오지 않거나 새 리스크가 현금흐름에 닿으면 하방 부담이 커집니다."
        : "Downside grows if price runs ahead of revenue and margin evidence or a new risk reaches cash flow.",
    upcomingEvents: [...snapshot.upcomingEvents],
    todayChecks:
      locale === "ko"
        ? [
            "개장 30분 뒤 전일 종가 대비 방향과 거래량",
            "새 정보가 바꾸는 다음 분기 매출·마진 항목",
          ]
        : [
            "Direction versus the prior close after 30 minutes and volume",
            "The next-quarter revenue or margin line changed by new information",
          ],
    ...(previous === undefined
      ? {}
      : {
          changedSincePrevious: hasChanges
            ? locale === "ko"
              ? `전일 브리핑에 없던 새 신호 ${signals.length}건을 반영했습니다.`
              : `${signals.length} signal${signals.length === 1 ? " is" : "s are"} new versus the prior briefing.`
            : locale === "ko"
              ? "전일 이후 결론을 바꿀 새 근거는 확인되지 않았습니다."
              : "No new evidence since the prior briefing changes the conclusion.",
        }),
  };
}

function promptFor(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
  previous: BriefingEditionPayload | undefined,
): string {
  return [
    "You are the chair of a four-agent US equity pre-market briefing.",
    `Write the entire response in ${locale === "ko" ? "natural Korean" : "concise professional English"}.`,
    "Use only the JSON evidence below. Do not browse. Do not invent facts, dates, prices, estimates, or events.",
    "This is a briefing, not a research report: prioritize what changed in the last 24 hours, what is scheduled next, and exactly what to verify today.",
    "Do not repeat the same meaning across headline, summary, cases, agent views, and checks.",
    "Avoid generic balance, canned risk disclaimers, empty neutrality, and phrases about unavailable provider data.",
    "Be directionally clear but conditional. Never issue a buy/sell recommendation or target price.",
    "Each agent owns a distinct lens: market=price/volume/relative tape, company=demand/product/competition, financial=estimate/margin/cash-flow implication, risk=downside transmission.",
    "materialChanges must use only the supplied signal IDs. Omit a signal if it repeats the previous briefing without a material change.",
    "upcomingEvents must preserve supplied ISO dates exactly.",
    JSON.stringify(
      {
        snapshot: { ...snapshot, signals },
        previous:
          previous === undefined
            ? null
            : {
                headline: previous.headline,
                summary: previous.summary,
                materialChanges: previous.materialChanges.map((signal) => ({
                  id: signal.id,
                  title: signal.title,
                  detail: signal.detail,
                })),
                attention: previous.attention,
              },
      },
      null,
      2,
    ),
  ].join("\n\n");
}

async function generateDraft(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
  previous: BriefingEditionPayload | undefined,
): Promise<BriefingDraft> {
  const prompt = promptFor(locale, snapshot, signals, previous);
  const key = {
    runId: RunIdSchema.parse(randomUUID()),
    jobId: JobIdSchema.parse(randomUUID()),
    attemptId: AttemptIdSchema.parse(randomUUID()),
    ordinal: 1,
  };
  const fence = { ownerId: `briefing:${process.pid}`, token: 1 };
  const claim: LaunchReservationClaim = { key, fence };
  const inputHash = codexInputHash({
    stage: "department_consolidation",
    prompt,
    outputSchema: BriefingDraftSchema,
  });
  const committed: CommittedLaunchReservation = {
    ...key,
    status: "spawn_reserved",
    committed: true,
    inputHash,
    reservationFence: fence,
    currentFence: fence,
  };
  const reservations: LaunchReservationReader = {
    readCommittedReservation: async (candidate) =>
      candidate.runId === key.runId &&
      candidate.jobId === key.jobId &&
      candidate.attemptId === key.attemptId &&
      candidate.ordinal === key.ordinal
        ? committed
        : undefined,
  };
  const attemptDir = await mkdtemp(join(tmpdir(), "stocksembly-briefing-"));
  try {
    const result = await createCodexPort(reservations).run({
      attemptDir,
      reservation: claim,
      stage: "department_consolidation",
      prompt,
      outputSchema: BriefingDraftSchema,
    });
    return result.candidate;
  } finally {
    await rm(attemptDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

export async function synthesizeBriefingEdition(input: {
  readonly locale: Locale;
  readonly snapshot: BriefingSourceSnapshot;
  readonly previous?: BriefingEditionPayload;
  readonly generatedAt: string;
}): Promise<BriefingEditionPayload> {
  const signals = novelSignals(input.snapshot, input.previous);
  let draft: BriefingDraft;
  let modelFailed = false;
  try {
    draft = await generateDraft(
      input.locale,
      input.snapshot,
      signals,
      input.previous,
    );
  } catch (error) {
    modelFailed = true;
    // biome-ignore lint/complexity/useLiteralKeys: worker env typing uses an index signature.
    if (process.env["NODE_ENV"] !== "production")
      console.error("BRIEFING_SYNTHESIS_FALLBACK", error);
    draft = fallbackDraft(
      input.locale,
      input.snapshot,
      signals,
      input.previous,
    );
  }
  const byId = new Map(signals.map((signal) => [signal.id, signal]));
  const materialChanges = draft.materialChanges.flatMap((localized) => {
    const source = byId.get(localized.id);
    return source === undefined
      ? []
      : [
          {
            ...source,
            title: localized.title,
            detail: localized.detail,
            investmentMeaning: localized.investmentMeaning,
          },
        ];
  });
  return Object.freeze({
    schemaVersion: 1,
    symbol: input.snapshot.symbol,
    company: input.snapshot.company,
    locale: input.locale,
    marketDate: input.snapshot.marketDate,
    generatedAt: input.generatedAt,
    cutoffAt: input.snapshot.cutoffAt,
    coverageStart: input.snapshot.coverageStart,
    status:
      modelFailed || input.snapshot.limitations.length > 0
        ? "partial"
        : "ready",
    attention: attentionFor(input.snapshot, signals),
    headline: draft.headline,
    summary: draft.summary,
    price: input.snapshot.quote,
    materialChanges: Object.freeze(materialChanges),
    agentViews: Object.freeze(draft.agentViews),
    bullCase: draft.bullCase,
    bearCase: draft.bearCase,
    upcomingEvents: Object.freeze(draft.upcomingEvents),
    todayChecks: Object.freeze(draft.todayChecks),
    ...(draft.changedSincePrevious === undefined
      ? {}
      : { changedSincePrevious: draft.changedSincePrevious }),
    ...(draft.stillWatching === undefined
      ? {}
      : { stillWatching: draft.stillWatching }),
    sources: input.snapshot.sources,
    limitations: input.snapshot.limitations,
  });
}
