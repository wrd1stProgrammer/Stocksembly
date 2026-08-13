import type { Locale } from "../../lib/i18n";
import type { BriefingSourceSnapshot } from "../domain/contracts";
import { briefingTextSimilarity } from "./briefingSignalPolicy";
import type { BriefingDraft } from "./briefingSynthesisSchema";
import {
  normalizeKoreanEstimatedPhrase,
  repairVisibleKoreanText,
  sanitizeVisibleBriefingDraft,
} from "./briefingVisibleTextPolicy";

function hasInternalEvidenceLanguage(value: string): boolean {
  return /(?:공급|제공|제시)된\b|(?:자료|데이터|시계열)(?:가|이|도)?\s*(?:제공되지|없)|\b(?:supplied|provided)\b|provider data/iu.test(
    value,
  );
}
export function repairBriefingDraft(
  draft: BriefingDraft,
  fallback: BriefingDraft,
): BriefingDraft {
  const headline = hasInternalEvidenceLanguage(draft.headline)
    ? fallback.headline
    : draft.headline;
  const summary =
    hasInternalEvidenceLanguage(draft.summary) ||
    briefingTextSimilarity(headline, draft.summary) >= 0.52
      ? fallback.summary
      : draft.summary;
  const usedText: string[] = [headline, summary];
  const usedAgents = new Set<BriefingDraft["agentViews"][number]["agent"]>();
  const agentViews: BriefingDraft["agentViews"][number][] = [];
  for (const view of draft.agentViews) {
    const combined = `${view.headline} ${view.detail}`;
    const overlaps = usedText.some(
      (section) => briefingTextSimilarity(section, combined) >= 0.66,
    );
    const needsRepair =
      overlaps ||
      hasInternalEvidenceLanguage(combined) ||
      usedAgents.has(view.agent);
    const repaired = needsRepair
      ? fallback.agentViews.find((candidate) => {
          const candidateText = `${candidate.headline} ${candidate.detail}`;
          return (
            !usedAgents.has(candidate.agent) &&
            !hasInternalEvidenceLanguage(candidateText) &&
            !usedText.some(
              (section) =>
                briefingTextSimilarity(section, candidateText) >= 0.66,
            )
          );
        })
      : view;
    if (repaired === undefined) continue;
    agentViews.push(repaired);
    usedAgents.add(repaired.agent);
    usedText.push(`${repaired.headline} ${repaired.detail}`);
  }
  const recovery = fallback.agentViews[0] ?? draft.agentViews[0];
  if (agentViews.length === 0 && recovery !== undefined)
    agentViews.push(recovery);
  const bullCase =
    briefingTextSimilarity(draft.bullCase, draft.bearCase) >= 0.58
      ? fallback.bullCase
      : draft.bullCase;
  const bearCase =
    briefingTextSimilarity(bullCase, draft.bearCase) >= 0.58
      ? fallback.bearCase
      : draft.bearCase;
  return sanitizeVisibleBriefingDraft(
    { ...draft, headline, summary, agentViews, bullCase, bearCase },
    fallback,
  );
}
export function localizeBriefingDraft(
  locale: Locale,
  draft: BriefingDraft,
  symbol: string,
): BriefingDraft {
  const visibleDraft: BriefingDraft = {
    ...draft,
    todayChecks: draft.todayChecks.map((check) => ({
      ...check,
      timing: check.timing.replace(
        /\bcutoffAt\b/giu,
        locale === "ko" ? "기준 시각" : "the cutoff time",
      ),
    })),
  };
  if (locale !== "ko")
    return sanitizeVisibleBriefingDraft(visibleDraft, visibleDraft);
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = (value: string) =>
    repairVisibleKoreanText(
      value
        .replace(/\bbullish\b/giu, "상승")
        .replace(/\bbearish\b/giu, "하락")
        .replace(/\bmixed\b/giu, "혼조")
        .replace(/\bneutral\b/giu, "중립")
        .replace(
          new RegExp(`${escapedSymbol}\\s+earnings`, "giu"),
          `${symbol} 실적 발표`,
        )
        .replace(/\b([A-Z][A-Z0-9.-]{0,11})\s+earnings\b/gu, "$1 실적 발표")
        .replace(/이번 관측 창(?:에는|에서)/gu, "직전 브리핑 이후")
        .replace(/이번 관측 구간/gu, "직전 브리핑 이후")
        .replace(/관측 창 내/gu, "직전 브리핑 이후")
        .replace(/이전 관측치/gu, "직전 수치")
        .replace(/(?:공급|제공|제시)된\s+/gu, "")
        .replace(/(\d+)\s*기간\s+이동평균/gu, "최근 $1개 봉 이동평균")
        .replace(/\$(\d+(?:\.\d+)?)억/gu, "$1억 달러")
        .replace(/제공되지 않았/gu, "확인되지 않았")
        .replace(/제공되지 않은/gu, "확인되지 않은"),
    );
  const optionalText = (value: string | null) =>
    value === null ? null : text(value);
  return sanitizeVisibleBriefingDraft(
    {
      ...visibleDraft,
      headline: text(visibleDraft.headline),
      summary: text(visibleDraft.summary),
      materialChanges: visibleDraft.materialChanges.map((change) => ({
        ...change,
        title: text(change.title),
        detail: text(change.detail),
        investmentMeaning: text(change.investmentMeaning),
      })),
      agentViews: visibleDraft.agentViews.map((view) => ({
        ...view,
        headline: text(view.headline),
        detail: text(view.detail),
      })),
      bullCase: text(visibleDraft.bullCase),
      bearCase: text(visibleDraft.bearCase),
      upcomingEvents: visibleDraft.upcomingEvents.map((event) => ({
        ...event,
        name: text(event.name),
        whyItMatters: text(event.whyItMatters),
      })),
      todayChecks: visibleDraft.todayChecks.map((check) => ({
        ...check,
        title: text(check.title),
        timing: text(check.timing),
        metric: text(check.metric),
        confirmation: text(check.confirmation),
        ifConfirmed: text(check.ifConfirmed),
        ifUnclear: text(check.ifUnclear),
        ifFailed: text(check.ifFailed),
      })),
      changedSincePrevious: optionalText(visibleDraft.changedSincePrevious),
      stillWatching: optionalText(visibleDraft.stillWatching),
    },
    visibleDraft,
  );
}
export function normalizeEstimatedBriefingLanguage(
  locale: Locale,
  draft: BriefingDraft,
  snapshot: BriefingSourceSnapshot,
): BriefingDraft {
  const estimatedDates = new Set(
    [...snapshot.upcomingEvents, ...draft.upcomingEvents]
      .filter((event) => event.certainty === "estimated")
      .map((event) => event.scheduledAt.slice(0, 10)),
  );
  if (snapshot.earnings?.nextReportCertainty === "estimated")
    estimatedDates.add(snapshot.earnings.nextReportAt?.slice(0, 10) ?? "");
  estimatedDates.delete("");
  if (estimatedDates.size === 0) return draft;
  const label = locale === "ko" ? "예상" : "estimated";
  const text = (value: string) => {
    let normalized = value;
    for (const date of estimatedDates) {
      const dateQualifier =
        locale === "ko"
          ? "(?:(?:추정된|예정된|확정된)\\s+)?"
          : "(?:(?:estimated|scheduled|confirmed)\\s+)?";
      normalized = normalized.replace(
        new RegExp(
          `${dateQualifier}${date}(?:\\s*\\((?:예상|estimated)\\))*`,
          "giu",
        ),
        `${date} (${label})`,
      );
      const koreanDate = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
      normalized = normalized.replace(
        new RegExp(
          `((?:${date.slice(0, 4)}년 )?${koreanDate})\\s+(?:예정된|확정된)`,
          "gu",
        ),
        `$1 (${label})`,
      );
    }
    const translated =
      locale === "ko"
        ? normalizeKoreanEstimatedPhrase(normalized)
        : normalized
            .replace(/confirmed decision point/giu, "estimated decision point")
            .replace(
              /(?:confirmed|scheduled) earnings/giu,
              "estimated earnings",
            );
    return translated.replace(
      new RegExp(`(?:\\s*\\(${label}\\)){2,}`, "gu"),
      ` (${label})`,
    );
  };
  const events = draft.upcomingEvents.map((event) => ({
    ...event,
    name: text(
      event.certainty === "estimated" ? `${event.name} (${label})` : event.name,
    ),
    whyItMatters: text(event.whyItMatters),
  }));
  return {
    ...draft,
    headline: text(draft.headline),
    summary: text(draft.summary),
    materialChanges: draft.materialChanges.map((change) => ({
      ...change,
      title: text(change.title),
      detail: text(change.detail),
      investmentMeaning: text(change.investmentMeaning),
    })),
    agentViews: draft.agentViews.map((view) => ({
      ...view,
      headline: text(view.headline),
      detail: text(view.detail),
    })),
    bullCase: text(draft.bullCase),
    bearCase: text(draft.bearCase),
    upcomingEvents: events,
    todayChecks: draft.todayChecks.map((check) => ({
      ...check,
      title: text(check.title),
      timing: text(check.timing),
      metric: text(check.metric),
      confirmation: text(check.confirmation),
      ifConfirmed: text(check.ifConfirmed),
      ifUnclear: text(check.ifUnclear),
      ifFailed: text(check.ifFailed),
    })),
    changedSincePrevious:
      draft.changedSincePrevious === null
        ? null
        : text(draft.changedSincePrevious),
    stillWatching:
      draft.stillWatching === null ? null : text(draft.stillWatching),
  };
}
