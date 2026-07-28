import { createHash } from "node:crypto";
import type {
  CandidateWithContent,
  RawNewsCandidate,
} from "./insightSentryNewsSelection";
import type { NewsClassifierCandidate } from "./insightSentryResearchContracts";

const TOPIC_SYNONYMS = new Map<string, string>([
  ["outlook", "guidance"],
  ["forecast", "guidance"],
  ["sales", "revenue"],
  ["full", "annual"],
  ["year", "annual"],
  ["fy", "annual"],
]);
const POSITIVE_CUES = new Set([
  "boost",
  "boosts",
  "increase",
  "increases",
  "lift",
  "lifts",
  "raise",
  "raises",
  "raised",
]);
const NEGATIVE_CUES = new Set([
  "cut",
  "cuts",
  "decrease",
  "decreases",
  "lower",
  "lowers",
  "reduce",
  "reduces",
]);
const TOPIC_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "its",
  "of",
  "on",
  "the",
  "to",
]);

type ClusterFeatures = NewsClassifierCandidate["clusterFeatures"];
type CandidateCluster = {
  readonly features: ClusterFeatures;
  readonly members: [RawNewsCandidate, ...RawNewsCandidate[]];
};

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function features(candidate: RawNewsCandidate): ClusterFeatures {
  const normalized = normalize(candidate.title).split(" ").filter(Boolean);
  const stance = normalized.some((token) => POSITIVE_CUES.has(token))
    ? "positive"
    : normalized.some((token) => NEGATIVE_CUES.has(token))
      ? "negative"
      : "neutral";
  const topics = [
    ...new Set(
      normalized
        .filter(
          (token) =>
            !POSITIVE_CUES.has(token) &&
            !NEGATIVE_CUES.has(token) &&
            !TOPIC_STOP_WORDS.has(token),
        )
        .map((token) => TOPIC_SYNONYMS.get(token) ?? token),
    ),
  ].sort();
  return Object.freeze({
    entities: [...new Set(candidate.relatedSymbols.map(normalize))].sort(),
    topics,
    timeBucket: candidate.publishedAt.slice(0, 13),
    sources:
      candidate.source === undefined
        ? []
        : [normalize(candidate.source)].filter(Boolean),
    stance,
  });
}

function similarity(left: readonly string[], right: readonly string[]): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  return (
    [...new Set(left)].filter((value) => right.includes(value)).length /
    union.size
  );
}

function sameEvent(
  candidate: ClusterFeatures,
  representative: ClusterFeatures,
): boolean {
  if (candidate.stance !== representative.stance) return false;
  const timeDistance = Math.abs(
    Date.parse(`${candidate.timeBucket}:00:00.000Z`) -
      Date.parse(`${representative.timeBucket}:00:00.000Z`),
  );
  if (timeDistance > 36 * 60 * 60 * 1_000) return false;
  const entitySimilarity = similarity(
    candidate.entities,
    representative.entities,
  );
  const topicSimilarity = similarity(candidate.topics, representative.topics);
  const sourceSimilarity = similarity(
    candidate.sources,
    representative.sources,
  );
  const entitiesMatch =
    entitySimilarity > 0 ||
    (candidate.entities.length === 0 && representative.entities.length === 0);
  return (
    entitiesMatch &&
    (topicSimilarity >= 0.6 ||
      (topicSimilarity >= 0.45 && sourceSimilarity > 0))
  );
}

export function clusterNewsCandidates(
  candidates: readonly RawNewsCandidate[],
): readonly CandidateWithContent[] {
  const clusters: CandidateCluster[] = [];
  for (const candidate of candidates) {
    const candidateFeatures = features(candidate);
    const existing = clusters.find((cluster) =>
      sameEvent(candidateFeatures, cluster.features),
    );
    if (existing === undefined) {
      clusters.push({ features: candidateFeatures, members: [candidate] });
    } else {
      existing.members.push(candidate);
    }
  }
  return clusters.map((cluster) => {
    const representative = cluster.members[0];
    return Object.freeze({
      candidateId: representative.candidateId,
      clusterId: createHash("sha256")
        .update(
          cluster.members
            .map((member) => member.candidateId)
            .sort()
            .join("|"),
        )
        .digest("hex"),
      bundleSize: cluster.members.length,
      title: representative.title,
      alternateTitles: cluster.members.slice(1).map((member) => member.title),
      sources: [
        ...new Set(
          cluster.members.flatMap((member) =>
            member.source === undefined ? [] : [member.source],
          ),
        ),
      ].sort(),
      publishedAt: representative.publishedAt,
      ...(representative.source === undefined
        ? {}
        : { source: representative.source }),
      ...(representative.link === undefined
        ? {}
        : { link: representative.link }),
      ...(representative.excerpt === undefined
        ? {}
        : { excerpt: representative.excerpt }),
      ...(representative.content === undefined
        ? {}
        : { content: representative.content }),
      clusterFeatures: Object.freeze({
        ...cluster.features,
        sources: [
          ...new Set(
            cluster.members.flatMap((member) => features(member).sources),
          ),
        ].sort(),
      }),
    });
  });
}
