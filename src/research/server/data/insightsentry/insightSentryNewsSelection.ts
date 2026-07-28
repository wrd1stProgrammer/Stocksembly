import { createHash } from "node:crypto";
import {
  NEWS_CLASSIFIER_MODEL,
  NEWS_CLASSIFIER_REASONING,
  type NewsClassifier,
  type NewsClassifierCandidate,
} from "./insightSentryResearchContracts";
import { NewsClassifierResponseSchema } from "./insightSentryResearchSchemas";
import { unixSecondsToIso } from "./insightSentryResearchSupport";

export const MAX_NEWS_EXCERPT_CHARACTERS = 2_500;

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

export async function classifyNewsCandidates(
  classifier: NewsClassifier,
  candidates: readonly CandidateWithContent[],
) {
  return NewsClassifierResponseSchema.parse(
    await classifier({
      model: NEWS_CLASSIFIER_MODEL,
      reasoning: NEWS_CLASSIFIER_REASONING,
      candidates,
    }),
  ).classifications;
}
