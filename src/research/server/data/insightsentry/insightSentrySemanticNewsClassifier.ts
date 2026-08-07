import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "../../../domain/ids";
import {
  type CommittedLaunchReservation,
  codexInputHash,
  type LaunchReservationClaim,
  type LaunchReservationReader,
} from "../../codex/codexReservation";
import { createCodexPort } from "../../codex/codexRunner";
import type {
  NewsClassifier,
  NewsClassifierCandidate,
} from "./insightSentryResearchContracts";
import { NewsClassifierResponseSchema } from "./insightSentryResearchSchemas";

function heuristic(candidate: NewsClassifierCandidate) {
  const text =
    `${candidate.title} ${candidate.alternateTitles.join(" ")} ${candidate.clusterFeatures.topics.join(" ")}`.toLowerCase();
  const material =
    candidate.source !== undefined &&
    candidate.link !== undefined &&
    /earn|guidance|forecast|contract|order|launch|approval|regulat|lawsuit|investigation|acqui|merger|partnership|layoff|buyback|dividend|tariff|shipment|sales|revenue|margin|ceo|cfo|recall|breach|production|pricing/u.test(
      text,
    );
  const category =
    /regulat|lawsuit|probe|investigation|sanction|recall|breach|risk/u.test(
      text,
    )
      ? "risk"
      : /rate|inflation|economy|market|sector|index|tariff/u.test(text)
        ? "market"
        : "company";
  return {
    candidateId: candidate.candidateId,
    eventKey: candidate.clusterId.slice(0, 160),
    category,
    relevance: material ? 0.82 : 0.35,
    materiality: material ? "material" : "immaterial",
    novelty: "unique",
    direction: candidate.clusterFeatures.stance,
    horizon: /today|pre.?market|after.?hours|immediate/u.test(text)
      ? "immediate"
      : "near_term",
    verificationNeed: "recommended",
  } as const;
}

function prompt(candidates: readonly NewsClassifierCandidate[]): string {
  return [
    "Classify a bounded set of licensed US-equity news candidates.",
    "Do not browse. Use only the supplied JSON. Return exactly one classification for every candidateId.",
    "Material means the event can reasonably change issuer revenue, demand, pricing, margin, cash flow, capital allocation, management, regulation, production, product timing, or competitive position.",
    "A market roundup, stock list, generic index move, analyst recap, or passing company mention is immaterial unless it contains a concrete issuer-specific development.",
    "Mark semantic repeats inside the batch as duplicate even when wording differs. Keep the newest or best-sourced representative unique.",
    "Use relevance below 0.5 for tangential mentions. Do not infer facts absent from the title, excerpt, related-symbol entities, and source metadata.",
    JSON.stringify(
      candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        clusterId: candidate.clusterId,
        bundleSize: candidate.bundleSize,
        title: candidate.title,
        alternateTitles: candidate.alternateTitles.slice(0, 3),
        sources: candidate.sources,
        publishedAt: candidate.publishedAt,
        excerpt: candidate.excerpt?.slice(0, 1_200),
        features: candidate.clusterFeatures,
      })),
      null,
      2,
    ),
  ].join("\n\n");
}

async function classifyWithLuna(
  request: Parameters<NewsClassifier>[0],
): Promise<unknown> {
  const key = {
    runId: RunIdSchema.parse(randomUUID()),
    jobId: JobIdSchema.parse(randomUUID()),
    attemptId: AttemptIdSchema.parse(randomUUID()),
    ordinal: 1,
  };
  const fence = { ownerId: `news-classifier:${process.pid}`, token: 1 };
  const claim: LaunchReservationClaim = { key, fence };
  const classifierPrompt = prompt(request.candidates);
  const inputHash = codexInputHash({
    stage: "memo",
    prompt: classifierPrompt,
    outputSchema: NewsClassifierResponseSchema,
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
  const attemptDir = await mkdtemp(
    join(await realpath(tmpdir()), "stocksembly-news-"),
  );
  try {
    const result = await createCodexPort(reservations).run({
      attemptDir,
      reservation: claim,
      stage: "memo",
      runtime: { model: request.model, reasoning: request.reasoning },
      prompt: classifierPrompt,
      outputSchema: NewsClassifierResponseSchema,
    });
    return result.candidate;
  } finally {
    await rm(attemptDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

export function createSemanticNewsClassifier(): NewsClassifier {
  return async (request) => {
    if (request.candidates.length === 0) return { classifications: [] };
    const fallback = request.candidates.map(heuristic);
    try {
      const parsed = NewsClassifierResponseSchema.parse(
        await classifyWithLuna(request),
      );
      const known = new Map(
        parsed.classifications.map((item) => [item.candidateId, item]),
      );
      return {
        classifications: request.candidates.map((candidate, index) => ({
          ...(known.get(candidate.candidateId) ?? fallback[index]!),
          candidateId: candidate.candidateId,
          eventKey: candidate.clusterId.slice(0, 160),
        })),
      };
    } catch (error) {
      if (process.env["NODE_ENV"] !== "production")
        console.error("NEWS_CLASSIFIER_FALLBACK", error);
      return { classifications: fallback };
    }
  };
}
