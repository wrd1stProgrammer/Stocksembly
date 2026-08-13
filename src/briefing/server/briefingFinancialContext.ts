import type { PeersDataset } from "../../research/server/data/insightsentry/insightSentryResearchContracts";
import type {
  BriefingEarningsSnapshot,
  BriefingFinancialContext,
  BriefingFinancialDocumentContext,
  BriefingPeerFinancialContext,
} from "../domain/contracts";
import { companyEvidenceExcerpt } from "./briefingCompanyEvidence";

const DOCUMENT_LIMIT = 3;
const EXCERPT_LIMIT = 480;
const FINANCIAL_DOCUMENT_CATEGORIES = /(annual|quarterly|earnings|10-[kq])/iu;
const PRESENTATION_CATEGORY = /^(?:slides?|presentation)$/iu;
const ISSUER_PRESENTATION_TITLE =
  /(?:company|investor|earnings|results?)\s+(?:presentation|slides?)/iu;

type FinancialDocument = {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly reportedAt: string;
  readonly publishedAt: string;
  readonly content: string;
};

function isFinancialBackgroundDocument(document: FinancialDocument): boolean {
  return (
    FINANCIAL_DOCUMENT_CATEGORIES.test(document.category) ||
    (PRESENTATION_CATEGORY.test(document.category) &&
      ISSUER_PRESENTATION_TITLE.test(document.title))
  );
}

function boundedDocuments(
  documents: readonly FinancialDocument[],
  symbol: string,
  cutoffAt: string,
): readonly BriefingFinancialDocumentContext[] {
  return Object.freeze(
    documents
      .filter(
        (document) =>
          isFinancialBackgroundDocument(document) &&
          Date.parse(document.publishedAt) <= Date.parse(cutoffAt),
      )
      .sort(
        (left, right) =>
          Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
      )
      .slice(0, DOCUMENT_LIMIT)
      .map((document) =>
        Object.freeze({
          id: document.id,
          category: document.category,
          title: document.title,
          reportedAt: document.reportedAt,
          publishedAt: document.publishedAt,
          excerpt: companyEvidenceExcerpt(
            document.content,
            symbol,
            EXCERPT_LIMIT,
          ),
        }),
      ),
  );
}

function peerContext(peers: PeersDataset): BriefingPeerFinancialContext {
  const subject = peers.subject;
  return Object.freeze({
    sector: peers.sector,
    subject: Object.freeze({
      symbol: subject.symbol,
      name: subject.name,
      ...(subject.marketCap === undefined
        ? {}
        : { marketCap: subject.marketCap }),
      ...(subject.priceEarningsTtm === undefined
        ? {}
        : { priceEarningsTtm: subject.priceEarningsTtm }),
      ...(subject.enterpriseValueEbitdaTtm === undefined
        ? {}
        : { enterpriseValueEbitdaTtm: subject.enterpriseValueEbitdaTtm }),
      ...(subject.enterpriseValueRevenueTtm === undefined
        ? {}
        : { enterpriseValueRevenueTtm: subject.enterpriseValueRevenueTtm }),
      ...(subject.revenueGrowthTtm === undefined
        ? {}
        : { revenueGrowthTtm: subject.revenueGrowthTtm }),
      ...(subject.grossMarginTtm === undefined
        ? {}
        : { grossMarginTtm: subject.grossMarginTtm }),
      ...(subject.operatingMarginTtm === undefined
        ? {}
        : { operatingMarginTtm: subject.operatingMarginTtm }),
    }),
    relativeValuation: Object.freeze(
      peers.relativeValuation
        .slice(0, 3)
        .map((metric) => Object.freeze({ ...metric })),
    ),
  });
}

export function buildBriefingFinancialContext(input: {
  readonly symbol: string;
  readonly documents: readonly FinancialDocument[];
  readonly earnings?: BriefingEarningsSnapshot;
  readonly peers?: PeersDataset;
  readonly cutoffAt: string;
}): BriefingFinancialContext | undefined {
  const documents = boundedDocuments(
    input.documents,
    input.symbol,
    input.cutoffAt,
  );
  if (
    documents.length === 0 &&
    input.earnings === undefined &&
    input.peers === undefined
  ) {
    return undefined;
  }
  const earnings = input.earnings;
  const epsComparison =
    earnings?.epsActual === undefined
      ? {
          availability: "unavailable" as const,
          reason: "missing_actual" as const,
        }
      : earnings.epsForecast === undefined
        ? {
            availability: "unavailable" as const,
            reason: "missing_same_report_forecast" as const,
          }
        : Object.freeze({
            availability: "available" as const,
            basis: "same_report" as const,
            actual: earnings.epsActual,
            forecast: earnings.epsForecast,
            ...(earnings.epsSurprise === undefined
              ? {}
              : { surprise: earnings.epsSurprise }),
            ...(earnings.epsSurprisePercent === undefined
              ? {}
              : { surprisePercent: earnings.epsSurprisePercent }),
          });
  return Object.freeze({
    documents,
    epsComparison,
    oneOffInterpretation: "unavailable",
    ...(input.peers === undefined ? {} : { peers: peerContext(input.peers) }),
  });
}
