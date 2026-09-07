import type { BriefingEditionPayload } from "../../briefing/domain/contracts";

// English translation of the actual generated briefing, retained as a dated product example.
export const briefingSample: BriefingEditionPayload = {
  schemaVersion: 1,
  symbol: "NVDA",
  company: "NVDA",
  locale: "en",
  marketDate: "2026-08-11",
  generatedAt: "2026-08-11T07:05:57.665Z",
  cutoffAt: "2026-08-11T07:05:55.875Z",
  coverageStart: "2026-08-10T07:05:55.875Z",
  status: "ready",
  evidenceCompleteness: "complete",
  generationMode: "model",
  attention: "medium",
  headline:
    "NVDA fell 2.86% to $217.55 despite the AI compute financing platform announcement.",
  summary:
    "The AI compute infrastructure financing platforms with Apollo, BlackRock, Blackstone, Brookfield, Goldman Sachs and KKR aim to mobilize over $500 billion of third-party capital. The August 26, 2026 earnings release is the next checkpoint: whether EPS meets the $2.08 consensus will help test whether the initiative is translating into financial performance.",
  price: {
    value: 217.55,
    currency: "USD",
    changePercent: -2.862118235399178,
    marketState: "CLOSED",
    observedAt: "2026-08-11T00:00:00.000Z",
  },
  earnings: {
    latestReportAt: "2026-05-20T20:20:00.000Z",
    nextReportAt: "2026-08-26T20:00:00.000Z",
    currency: "USD",
    epsActual: 1.866323,
    nextEpsForecast: 2.083504,
    nextReportCertainty: "confirmed",
  },
  materialChanges: [
    {
      id: "nvidia-2026-08-10-ai-compute-financing-platforms",
      kind: "company",
      direction: "positive",
      title: "AI compute infrastructure financing platforms announced",
      detail:
        "NVIDIA announced AI compute infrastructure financing platforms with Apollo, BlackRock, Blackstone, Brookfield, Goldman Sachs and KKR, targeting over $500 billion of third-party capital.",
      investmentMeaning:
        "The investment implications strengthen only if subsequent revenue, margin and cash-flow metrics improve.",
      occurredAt: "2026-08-10T20:14:00.000Z",
      sourceUrl:
        "https://www.eqs-news.com/news//nvidia-partners-with-apollo-blackrock-blackstone-brookfield-goldman-sachs-and-kkr-to-establish-ai-compute-infrastructure-financing-platforms-to-mobilize-over-500-billion-of-third-party-capital/15f8b3c0-144c-4fac-95e7-4255cab3f071_en",
    },
  ],
  agentViews: [
    {
      agent: "company",
      stance: "positive",
      headline:
        "The financing platforms offer a potential path to broader AI infrastructure demand.",
      detail:
        "NVIDIA aims to finance AI factories as repeatable infrastructure assets. The operating and financial effects remain unconfirmed and need to be tested in subsequent financial results.",
    },
    {
      agent: "market",
      stance: "watch",
      headline:
        "The $217.55 close and the previous low of $216.77 are near-term reference levels.",
      detail:
        "The stock closed at $217.55, down 2.86%. The 20-day high of $224.76 is also four-hour resistance, while $208.22 is support on the same timeframe.",
    },
    {
      agent: "financial",
      stance: "watch",
      headline: "Watch Blackwell execution",
      detail:
        "August 26. Key earnings checkpoints: Blackwell and the $2.08 EPS consensus. Compare operating metrics with the same measures and basis in the prior-year quarter, and EPS with the consensus for the reporting quarter.",
    },
  ],
  bullCase:
    "The upside case strengthens only if the price holds above $224.76.",
  bearCase:
    "The downside case strengthens only if the price falls below $208.22.",
  upcomingEvents: [
    {
      name: "NVDA earnings release",
      scheduledAt: "2026-08-26T20:00:00.000Z",
      whyItMatters:
        "Key earnings checkpoints: Blackwell and the $2.08 EPS consensus. Compare operating metrics with the same measures and basis in the prior-year quarter, and EPS with the consensus for the reporting quarter.",
      certainty: "confirmed",
    },
  ],
  todayChecks: [
    {
      horizon: "today",
      title: "Does early trading confirm the news?",
      timing: "30 minutes after the next regular-session open",
      metric: "Price range: upper $224.14 / lower $216.77",
      confirmation: "If the price is above $224.14 at the checkpoint",
      ifConfirmed:
        "Evidence strengthens that the new event is translating into same-day demand.",
      ifUnclear:
        "Keep the existing view if the price remains between $216.77 and $224.14.",
      ifFailed:
        "Price confirmation fails if the price is below $216.77 at the checkpoint.",
    },
    {
      horizon: "next_catalyst",
      title: "Does the next reported EPS meet the current consensus?",
      timing: "2026-08-26",
      metric:
        "NVDA earnings release: current EPS consensus $2.08. Additional focus: Blackwell.",
      confirmation: "Confirmation requires reported EPS of at least $2.08.",
      ifConfirmed:
        "Reported EPS meets or exceeds the current consensus for the next release.",
      ifUnclear:
        "The result is unclear if EPS is unavailable or has not yet been reported.",
      ifFailed:
        "Reported EPS below $2.08 falls short of the current consensus.",
    },
  ],
  stillWatching:
    "Watch the August 26, 2026 earnings release for evidence that the financing platforms translate into revenue, margin and cash-flow metrics.",
  sources: [
    {
      title:
        "NVIDIA Partners with Apollo, BlackRock, Blackstone, Brookfield, Goldman Sachs and KKR to Establish AI Compute Infrastructure Financing Platforms to Mobilize Over $500 Billion of Third-Party Capital",
      publisher: "EQS",
      publishedAt: "2026-08-10T20:14:00.000Z",
      url: "https://www.eqs-news.com/news//nvidia-partners-with-apollo-blackrock-blackstone-brookfield-goldman-sachs-and-kkr-to-establish-ai-compute-infrastructure-financing-platforms-to-mobilize-over-500-billion-of-third-party-capital/15f8b3c0-144c-4fac-95e7-4255cab3f071_en",
    },
  ],
  limitations: [],
};
