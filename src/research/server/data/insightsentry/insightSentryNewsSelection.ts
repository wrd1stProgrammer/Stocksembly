import { createHash } from "node:crypto";
import {
  NEWS_CLASSIFIER_MODEL,
  NEWS_CLASSIFIER_REASONING,
  type NewsClassifier,
  type NewsClassifierCandidate,
} from "./insightSentryResearchContracts";
import type { NewsClassification } from "./insightSentryResearchSchemas";
import { NewsClassifierResponseSchema } from "./insightSentryResearchSchemas";
import { unixSecondsToIso } from "./insightSentryResearchSupport";

export const MAX_NEWS_EXCERPT_CHARACTERS = 2_500;
export const MAX_NEWS_CLASSIFIER_BATCH = 20;
export const MAX_NEWS_DETAIL_CANDIDATES = 20;

const MUST_KEEP_NEWS =
  /earnings?|guidance|10-[kq]|8-k|sec filing|dividend|buyback|repurchase|merger|acquisition|contract|order|approval|regulat|lawsuit|investigation|recall|breach|ceo|cfo|실적|가이던스|공시|배당|자사주|합병|인수|계약|수주|승인|규제|소송|조사|리콜|침해|대표이사|최고재무책임자/iu;

export type NewsCandidateClassificationResult = {
  readonly classifications: readonly NewsClassification[];
  readonly screenedOut: readonly NewsClassification[];
};

export type RawNewsCandidate = Omit<
  NewsClassifierCandidate,
  "clusterId" | "bundleSize" | "alternateTitles" | "sources" | "clusterFeatures"
> & {
  readonly content?: string;
  readonly relatedSymbols: readonly string[];
};

export type CandidateWithContent = NewsClassifierCandidate & {
  readonly content?: string;
};

function candidateId(input: {
  readonly title: string;
  readonly publishedAt: string;
  readonly link?: string;
}): string {
  return createHash("sha256")
    .update(`${input.link ?? ""}|${input.title}|${input.publishedAt}`)
    .digest("hex");
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function deduplicateNewsItems(
  items: readonly {
    readonly link?: string | undefined;
    readonly title?: string | undefined;
    readonly source?: string | undefined;
    readonly content?: string | undefined;
    readonly related_symbols?: readonly string[] | undefined;
    readonly published_at: number;
  }[],
): readonly RawNewsCandidate[] {
  const candidates = items
    .filter(
      (item): item is typeof item & { readonly title: string } =>
        item.title !== undefined,
    )
    .map((item) => {
      const publishedAt = unixSecondsToIso(item.published_at);
      return Object.freeze({
        candidateId: candidateId({
          title: item.title,
          publishedAt,
          ...(item.link === undefined ? {} : { link: item.link }),
        }),
        title: item.title,
        publishedAt,
        relatedSymbols: [...(item.related_symbols ?? [])].sort(),
        ...(item.source === undefined ? {} : { source: item.source }),
        ...(item.link === undefined ? {} : { link: item.link }),
        ...(item.content === undefined
          ? {}
          : {
              content: item.content,
              excerpt: item.content.slice(0, MAX_NEWS_EXCERPT_CHARACTERS),
            }),
      });
    })
    .sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) ||
        left.candidateId.localeCompare(right.candidateId),
    );
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key =
      candidate.link ??
      `${normalizeTitle(candidate.title)}|${candidate.publishedAt.slice(0, 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shortlistRank(
  classification: NewsClassification,
  candidate: CandidateWithContent,
): number {
  const text = `${candidate.title} ${candidate.excerpt ?? ""}`;
  return (
    (MUST_KEEP_NEWS.test(text) ? 4 : 0) +
    (classification.materiality === "material" ? 2 : 0) +
    (classification.novelty === "unique" ? 0.75 : 0) +
    classification.relevance +
    Math.min(0.4, candidate.bundleSize * 0.05)
  );
}

function detailedCandidateIds(
  candidates: readonly CandidateWithContent[],
  shortlist: readonly NewsClassification[],
): ReadonlySet<string> {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const ranked = shortlist
    .flatMap((classification) => {
      const candidate = candidateById.get(classification.candidateId);
      return candidate === undefined ? [] : [{ classification, candidate }];
    })
    .sort(
      (left, right) =>
        shortlistRank(right.classification, right.candidate) -
          shortlistRank(left.classification, left.candidate) ||
        right.candidate.publishedAt.localeCompare(left.candidate.publishedAt) ||
        left.candidate.candidateId.localeCompare(right.candidate.candidateId),
    );
  return new Set(
    ranked
      .slice(0, MAX_NEWS_DETAIL_CANDIDATES)
      .map(({ candidate }) => candidate.candidateId),
  );
}

export async function classifyNewsCandidatePool(
  classifier: NewsClassifier,
  candidates: readonly CandidateWithContent[],
): Promise<NewsCandidateClassificationResult> {
  if (candidates.length === 0)
    return Object.freeze({ classifications: [], screenedOut: [] });

  if (candidates.length <= MAX_NEWS_DETAIL_CANDIDATES) {
    const classifications = NewsClassifierResponseSchema.parse(
      await classifier({
        model: NEWS_CLASSIFIER_MODEL,
        reasoning: NEWS_CLASSIFIER_REASONING,
        phase: "detail",
        candidates,
      }),
    ).classifications;
    return Object.freeze({ classifications, screenedOut: [] });
  }

  const shortlist = NewsClassifierResponseSchema.parse(
    await classifier({
      model: NEWS_CLASSIFIER_MODEL,
      reasoning: NEWS_CLASSIFIER_REASONING,
      phase: "shortlist",
      candidates,
    }),
  ).classifications;
  const selectedIds = detailedCandidateIds(candidates, shortlist);
  const selectedCandidates = candidates.filter((candidate) =>
    selectedIds.has(candidate.candidateId),
  );
  const classifications = NewsClassifierResponseSchema.parse(
    await classifier({
      model: NEWS_CLASSIFIER_MODEL,
      reasoning: NEWS_CLASSIFIER_REASONING,
      phase: "detail",
      candidates: selectedCandidates,
    }),
  ).classifications;
  return Object.freeze({
    classifications,
    screenedOut: shortlist.filter(
      (classification) => !selectedIds.has(classification.candidateId),
    ),
  });
}

export async function classifyNewsCandidates(
  classifier: NewsClassifier,
  candidates: readonly CandidateWithContent[],
): Promise<readonly NewsClassification[]> {
  return (await classifyNewsCandidatePool(classifier, candidates))
    .classifications;
}
