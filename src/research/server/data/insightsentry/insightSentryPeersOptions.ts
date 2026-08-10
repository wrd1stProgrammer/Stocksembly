import { ZodError } from "zod";
import {
  type InsightSentryClient,
  InsightSentryClientError,
} from "./insightSentryClient";
import type {
  FamilyResult,
  InsightSentryResearchRollout,
  OptionsDataset,
  PeerScreen,
  PeersDataset,
} from "./insightSentryResearchContracts";
import {
  OptionsResponseSchema,
  PeerScreenResponseSchema,
} from "./insightSentryResearchSchemas";
import {
  familyFailure,
  unixMillisecondsToIso,
  withheldWhenDisabled,
} from "./insightSentryResearchSupport";

const OPTIONS_TTL = 15 * 60 * 1_000;
const MAX_OPTION_CALLS = 2;
const MAX_OPTION_CONTRACTS = 100;

export async function collectInsightSentryPeers(input: {
  readonly rollout: InsightSentryResearchRollout;
  readonly screenPeers: PeerScreen;
  readonly symbol: string;
}): Promise<FamilyResult<PeersDataset>> {
  const disabled = withheldWhenDisabled<PeersDataset>(input.rollout, "peers");
  if (disabled !== undefined) return disabled;
  try {
    const response = PeerScreenResponseSchema.parse(
      await input.screenPeers({ symbol: input.symbol, limit: 10 }),
    );
    const peers = [...response.peers]
      .filter((peer) => peer.symbol !== input.symbol)
      .sort(
        (left, right) =>
          right.selectionScore - left.selectionScore ||
          (right.marketCap ?? 0) - (left.marketCap ?? 0) ||
          left.symbol.localeCompare(right.symbol),
      )
      .filter(
        (peer, position, all) =>
          position === 0 || all[position - 1]?.symbol !== peer.symbol,
      )
      .slice(0, 10)
      .map((peer) =>
        Object.freeze({
          symbol: peer.symbol,
          name: peer.name,
          sector: peer.sector,
          classification: peer.classification,
          selectionScore: peer.selectionScore,
          selectionReasons: peer.selectionReasons,
          ...(peer.marketCap === undefined
            ? {}
            : { marketCap: peer.marketCap }),
          ...(peer.priceEarningsTtm === undefined
            ? {}
            : { priceEarningsTtm: peer.priceEarningsTtm }),
          ...(peer.enterpriseValueEbitdaTtm === undefined
            ? {}
            : {
                enterpriseValueEbitdaTtm: peer.enterpriseValueEbitdaTtm,
              }),
          ...(peer.enterpriseValueRevenueTtm === undefined
            ? {}
            : {
                enterpriseValueRevenueTtm: peer.enterpriseValueRevenueTtm,
              }),
          ...(peer.revenueGrowthTtm === undefined
            ? {}
            : { revenueGrowthTtm: peer.revenueGrowthTtm }),
          ...(peer.grossMarginTtm === undefined
            ? {}
            : { grossMarginTtm: peer.grossMarginTtm }),
          ...(peer.operatingMarginTtm === undefined
            ? {}
            : { operatingMarginTtm: peer.operatingMarginTtm }),
          ...(peer.performance3Month === undefined
            ? {}
            : { performance3Month: peer.performance3Month }),
          ...(peer.performance1Year === undefined
            ? {}
            : { performance1Year: peer.performance1Year }),
        }),
      );
    return Object.freeze({
      status: "available",
      data: Object.freeze({
        symbol: input.symbol,
        sector: response.sector,
        selectorVersion: response.selectorVersion,
        selectionCache: response.selectionCache,
        subject: Object.freeze({
          symbol: response.subject.symbol,
          name: response.subject.name,
          sector: response.subject.sector,
          ...(response.subject.marketCap === undefined
            ? {}
            : { marketCap: response.subject.marketCap }),
          ...(response.subject.priceEarningsTtm === undefined
            ? {}
            : { priceEarningsTtm: response.subject.priceEarningsTtm }),
          ...(response.subject.enterpriseValueEbitdaTtm === undefined
            ? {}
            : {
                enterpriseValueEbitdaTtm:
                  response.subject.enterpriseValueEbitdaTtm,
              }),
          ...(response.subject.enterpriseValueRevenueTtm === undefined
            ? {}
            : {
                enterpriseValueRevenueTtm:
                  response.subject.enterpriseValueRevenueTtm,
              }),
          ...(response.subject.revenueGrowthTtm === undefined
            ? {}
            : { revenueGrowthTtm: response.subject.revenueGrowthTtm }),
          ...(response.subject.grossMarginTtm === undefined
            ? {}
            : { grossMarginTtm: response.subject.grossMarginTtm }),
          ...(response.subject.operatingMarginTtm === undefined
            ? {}
            : { operatingMarginTtm: response.subject.operatingMarginTtm }),
          ...(response.subject.performance3Month === undefined
            ? {}
            : { performance3Month: response.subject.performance3Month }),
          ...(response.subject.performance1Year === undefined
            ? {}
            : { performance1Year: response.subject.performance1Year }),
        }),
        relativeValuation: response.relativeValuation.map((metric) =>
          Object.freeze({
            metric: metric.metric,
            peerMedian: metric.peerMedian,
            peerCount: metric.peerCount,
            ...(metric.subjectValue === undefined
              ? {}
              : { subjectValue: metric.subjectValue }),
            ...(metric.premiumDiscountPercent === undefined
              ? {}
              : {
                  premiumDiscountPercent: metric.premiumDiscountPercent,
                }),
          }),
        ),
        providerUpdatedAt: response.providerUpdatedAt,
        retrievedAt: response.retrievedAt,
        peers,
      }),
    });
  } catch (error) {
    if (error instanceof RangeError)
      return Object.freeze({
        status: "unavailable",
        limitation: "provider_unavailable",
      });
    if (error instanceof InsightSentryClientError || error instanceof ZodError)
      return familyFailure(error);
    throw error;
  }
}

export async function collectInsightSentryOptions(input: {
  readonly client: InsightSentryClient;
  readonly rollout: InsightSentryResearchRollout;
  readonly symbol: string;
  readonly asOf: string;
  readonly entitled: boolean;
  readonly needed: boolean;
}): Promise<FamilyResult<OptionsDataset>> {
  const disabled = withheldWhenDisabled<OptionsDataset>(
    input.rollout,
    "options",
  );
  if (disabled !== undefined) return disabled;
  if (!input.entitled)
    return Object.freeze({ status: "withheld", limitation: "not_entitled" });
  if (!input.needed)
    return Object.freeze({ status: "withheld", limitation: "not_needed" });
  try {
    const contracts = [];
    let nextToken: string | undefined;
    let providerUpdatedAt = 0;
    let retrievedAt = input.asOf;
    for (let call = 0; call < MAX_OPTION_CALLS; call += 1) {
      const response = await input.client.get({
        endpoint: "options",
        pathSegments: ["options", "contracts"],
        parameters: {
          code: input.symbol,
          range: 20,
          ...(nextToken === undefined ? {} : { next_token: nextToken }),
        },
        asOfBucket: input.asOf.slice(0, 13),
        schema: OptionsResponseSchema,
        cacheTtlMilliseconds: OPTIONS_TTL,
      });
      providerUpdatedAt = Math.max(
        providerUpdatedAt,
        response.data.last_update,
      );
      retrievedAt =
        response.retrievedAt.localeCompare(retrievedAt) > 0
          ? response.retrievedAt
          : retrievedAt;
      contracts.push(...response.data.data);
      nextToken = response.data.next_token;
      if (nextToken === undefined || contracts.length >= MAX_OPTION_CONTRACTS)
        break;
    }
    const seen = new Set<string>();
    const normalized = contracts
      .filter((contract) => {
        if (seen.has(contract.code)) return false;
        seen.add(contract.code);
        return true;
      })
      .flatMap((contract) => {
        const strikePrice = Number(contract.strike_price);
        return Number.isFinite(strikePrice)
          ? [
              Object.freeze({
                code: contract.code,
                expiration: contract.expiration,
                type: contract.type,
                strikePrice,
              }),
            ]
          : [];
      })
      .slice(0, MAX_OPTION_CONTRACTS);
    return Object.freeze({
      status: "available",
      data: Object.freeze({
        symbol: input.symbol,
        providerUpdatedAt: unixMillisecondsToIso(providerUpdatedAt),
        retrievedAt,
        contracts: normalized,
      }),
    });
  } catch (error) {
    if (error instanceof InsightSentryClientError || error instanceof ZodError)
      return familyFailure(error);
    throw error;
  }
}
