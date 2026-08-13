import type { BriefingDraft } from "./briefingSynthesisSchema";

const internalLanguage =
  /(?:\b(?:cutoffAt|volumeRatio20|fundamentalSeries|nextEpsForecast|coverageStart|observedEnd|barCount|marketState|snake_case|json|provider|supplied|provided)\b|\bevidence[ -]?window\b|(?:공급|제공|제시)된\b|(?:자료|데이터|시계열)(?:가|이|도)?\s*(?:제공되지|없))/iu;
const asciiSnakeCaseIdentifier = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/u;
const brokenCopula = /(?:상승|하락|혼조|중립)다(?=\s|[.!?,]|$)/u;
const koreanNumericParticle =
  /(\d+(?:[.,]\d+)?)([을를은는이가과와])(?=\s|[.!?,]|$)/gu;

const safeText = {
  headline: "투자 판단에 필요한 확인 사항을 점검합니다.",
  summary: "확인된 가격과 회사 정보를 바탕으로 당일 판단 기준을 정리합니다.",
  signalTitle: "확인할 변화",
  signalDetail: "관련 내용을 추가로 확인하고 있습니다.",
  signalMeaning: "확인 전까지 기존 판단을 유지합니다.",
  viewHeadline: "판단 기준 점검",
  viewDetail: "확인 가능한 가격과 회사 정보를 함께 살펴봅니다.",
  bull: "상방 조건은 가격과 사업 지표가 함께 개선되는 경우입니다.",
  bear: "하방 조건은 가격 약세와 사업 지표 둔화가 이어지는 경우입니다.",
  checkTitle: "당일 판단 기준",
  checkTiming: "확인 시점",
  checkMetric: "가격과 거래 흐름",
  checkConfirmation: "가격과 거래 흐름이 함께 유지되는 경우입니다.",
  checkConfirmed: "현재 판단을 뒷받침하는 근거가 강해집니다.",
  checkUnclear: "엇갈린 신호면 추가 확인을 기다립니다.",
  checkFailed: "당일 판단의 신뢰도를 낮춰서 봅니다.",
} as const;

const requiredTodayCheck: BriefingDraft["todayChecks"][number] = {
  horizon: "today",
  title: safeText.checkTitle,
  timing: safeText.checkTiming,
  metric: safeText.checkMetric,
  confirmation: safeText.checkConfirmation,
  ifConfirmed: safeText.checkConfirmed,
  ifUnclear: safeText.checkUnclear,
  ifFailed: safeText.checkFailed,
};

export function repairVisibleKoreanCopula(value: string): string {
  return value.replace(
    /(?:상승|하락|혼조|중립)다(?=\s|[.!?,]|$)/gu,
    (match) => `${match.slice(0, -1)}입니다`,
  );
}

function numericParticle(particle: string, hasBatchim: boolean): string {
  if (particle === "을" || particle === "를") return hasBatchim ? "을" : "를";
  if (particle === "은" || particle === "는") return hasBatchim ? "은" : "는";
  if (particle === "이" || particle === "가") return hasBatchim ? "이" : "가";
  if (particle === "과" || particle === "와") return hasBatchim ? "과" : "와";
  return particle;
}

export function repairKoreanNumericParticles(value: string): string {
  return value.replace(koreanNumericParticle, (_, number: string, particle) => {
    const lastDigit = number.at(-1) ?? "";
    return `${number}${numericParticle(particle, /[013678]/u.test(lastDigit))}`;
  });
}

export function repairVisibleKoreanText(value: string): string {
  return repairKoreanNumericParticles(repairVisibleKoreanCopula(value));
}

export function normalizeKoreanEstimatedPhrase(value: string): string {
  return value
    .replace(/(?:확정된|예정된)\s+판단\s*(?:지점|시점)/gu, "예상 판단 시점")
    .replace(
      /(?:확정된|예정된)\s+([A-Z][A-Z0-9.-]{0,11})\s+실적/gu,
      "예상 $1 실적",
    )
    .replace(/(?:확정|예정)\s*실적/gu, "예상 실적")
    .replace(/(?:예상\s+)?\(예상\)(?:\s+예상|로 추정[가-힣]{1,4})?/gu, "(예상)")
    .replace(
      /\(예상\)로 예정된 추정 실적 [결판]. 시점/gu,
      "(예상) 실적 발표 시점",
    );
}

export function isVisibleTextSafe(value: string): boolean {
  return (
    !internalLanguage.test(value) &&
    !asciiSnakeCaseIdentifier.test(value) &&
    !brokenCopula.test(value)
  );
}

function pickRequired(
  model: string,
  fallback: string | undefined,
  safe: string,
): string {
  const repaired = repairVisibleKoreanCopula(model);
  if (isVisibleTextSafe(repaired)) return repaired;
  const backup =
    fallback === undefined ? undefined : repairVisibleKoreanCopula(fallback);
  return backup !== undefined && isVisibleTextSafe(backup) ? backup : safe;
}

function pickOptional(
  model: string | null,
  fallback: string | null,
): string | null {
  if (model !== null) {
    const repaired = repairVisibleKoreanCopula(model);
    if (isVisibleTextSafe(repaired)) return repaired;
  }
  if (fallback !== null) {
    const backup = repairVisibleKoreanCopula(fallback);
    if (isVisibleTextSafe(backup)) return backup;
  }
  return null;
}

export function sanitizeVisibleBriefingDraft(
  draft: BriefingDraft,
  fallback: BriefingDraft,
): BriefingDraft {
  const upcomingEvents = draft.upcomingEvents.flatMap((event) => {
    const backup = fallback.upcomingEvents.find(
      (item) => item.scheduledAt === event.scheduledAt,
    );
    const name = pickOptional(event.name, backup?.name ?? null);
    const whyItMatters = pickOptional(
      event.whyItMatters,
      backup?.whyItMatters ?? null,
    );
    return name === null || whyItMatters === null
      ? []
      : [{ ...event, name, whyItMatters }];
  });
  const todayChecks = draft.todayChecks
    .filter(
      (check) =>
        check.horizon !== "next_catalyst" ||
        upcomingEvents.some(
          (event) => event.scheduledAt.slice(0, 10) === check.timing,
        ),
    )
    .map((check, index) => {
      const backup = fallback.todayChecks[index];
      return {
        ...check,
        title: pickRequired(check.title, backup?.title, safeText.checkTitle),
        timing: pickRequired(
          check.timing,
          backup?.timing,
          safeText.checkTiming,
        ),
        metric: pickRequired(
          check.metric,
          backup?.metric,
          safeText.checkMetric,
        ),
        confirmation: pickRequired(
          check.confirmation,
          backup?.confirmation,
          safeText.checkConfirmation,
        ),
        ifConfirmed: pickRequired(
          check.ifConfirmed,
          backup?.ifConfirmed,
          safeText.checkConfirmed,
        ),
        ifUnclear: pickRequired(
          check.ifUnclear,
          backup?.ifUnclear,
          safeText.checkUnclear,
        ),
        ifFailed: pickRequired(
          check.ifFailed,
          backup?.ifFailed,
          safeText.checkFailed,
        ),
      };
    });
  return {
    ...draft,
    headline: pickRequired(
      draft.headline,
      fallback.headline,
      safeText.headline,
    ),
    summary: pickRequired(draft.summary, fallback.summary, safeText.summary),
    materialChanges: draft.materialChanges.map((change) => {
      const backup = fallback.materialChanges.find(
        (item) => item.id === change.id,
      );
      return {
        ...change,
        title: pickRequired(change.title, backup?.title, safeText.signalTitle),
        detail: pickRequired(
          change.detail,
          backup?.detail,
          safeText.signalDetail,
        ),
        investmentMeaning: pickRequired(
          change.investmentMeaning,
          backup?.investmentMeaning,
          safeText.signalMeaning,
        ),
      };
    }),
    agentViews: draft.agentViews.map((view) => {
      const backup = fallback.agentViews.find(
        (item) => item.agent === view.agent,
      );
      return {
        ...view,
        headline: pickRequired(
          view.headline,
          backup?.headline,
          safeText.viewHeadline,
        ),
        detail: pickRequired(view.detail, backup?.detail, safeText.viewDetail),
      };
    }),
    bullCase: pickRequired(draft.bullCase, fallback.bullCase, safeText.bull),
    bearCase: pickRequired(draft.bearCase, fallback.bearCase, safeText.bear),
    upcomingEvents,
    todayChecks: todayChecks.length === 0 ? [requiredTodayCheck] : todayChecks,
    changedSincePrevious: pickOptional(
      draft.changedSincePrevious,
      fallback.changedSincePrevious,
    ),
    stillWatching: pickOptional(draft.stillWatching, fallback.stillWatching),
  };
}
