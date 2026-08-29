import { describe, expect, it } from "vitest";
import {
  evaluatePublicationQuality,
  PublicationQualityInputSchema,
  PublicClaimPublicationActionSchema,
} from "./qualityPolicy";

const base = {
  requestedStatus: "complete_with_limitations",
  acceptedArtifactCount: 12,
  requiredArtifactCount: 12,
  capabilities: [
    { key: "current_market_data", availability: "unavailable" },
    { key: "consensus", availability: "unavailable" },
  ],
  claims: [
    {
      claimId: "claim-1",
      materiality: "material",
      support: "supported",
      semanticVerdict: "entailed",
    },
  ],
  metrics: [{ id: "material-claim-audit", passed: 1, denominator: 1 }],
} as const;

describe("publication quality policy", () => {
  it("defines the three public-claim publication actions", () => {
    expect(PublicClaimPublicationActionSchema.options).toEqual([
      "publish",
      "limitations_only",
      "omit",
    ]);
  });

  it("keeps an otherwise grounded report complete_with_limitations for a stale capability", () => {
    const result = evaluatePublicationQuality({
      ...base,
      capabilities: [{ key: "current_market_data", availability: "stale" }],
    });

    expect(result).toEqual({
      publishable: true,
      status: "complete_with_limitations",
      blockers: [],
    });
  });

  it("returns complete_with_limitations for twelve artifacts and unavailable market data", () => {
    expect(evaluatePublicationQuality(base)).toEqual({
      publishable: true,
      status: "complete_with_limitations",
      blockers: [],
    });
  });

  it("blocks a contradicted material claim", () => {
    const semanticVerdict = "contradicted";
    const result = evaluatePublicationQuality({
      ...base,
      claims: [
        {
          claimId: "claim-1",
          materiality: "material",
          support: "supported",
          semanticVerdict,
        },
      ],
    });
    expect(result.publishable).toBe(false);
    expect(result.status).toBe("incomplete");
    expect(result.blockers).toContain(
      `material_claim_${semanticVerdict}:claim-1`,
    );
  });

  it("publishes a not-assessable supported claim with limitations", () => {
    const result = evaluatePublicationQuality({
      ...base,
      claims: [
        {
          claimId: "claim-1",
          materiality: "material",
          support: "supported",
          semanticVerdict: "not_assessable",
        },
      ],
    });

    expect(result).toEqual({
      publishable: true,
      status: "complete_with_limitations",
      blockers: [],
    });
  });

  it("blocks an unsupported material claim", () => {
    const result = evaluatePublicationQuality({
      ...base,
      claims: [
        {
          claimId: "claim-1",
          materiality: "material",
          support: "unsupported",
          semanticVerdict: "partial",
        },
      ],
    });
    expect(result.publishable).toBe(false);
    expect(result.blockers).toContain("material_claim_unsupported:claim-1");
  });

  it("rejects absent and zero denominators plus invalid status", () => {
    expect(
      PublicationQualityInputSchema.safeParse({
        ...base,
        metrics: [{ id: "audit", passed: 0 }],
      }).success,
    ).toBe(false);
    expect(
      PublicationQualityInputSchema.safeParse({
        ...base,
        metrics: [{ id: "audit", passed: 0, denominator: 0 }],
      }).success,
    ).toBe(false);
    expect(
      PublicationQualityInputSchema.safeParse({
        ...base,
        requestedStatus: "done",
      }).success,
    ).toBe(false);
  });

  it("rejects guessed price and recommendation content at every strict boundary", () => {
    expect(
      PublicationQualityInputSchema.safeParse({ ...base, price: 123 }).success,
    ).toBe(false);
    expect(
      PublicationQualityInputSchema.safeParse({
        ...base,
        claims: [{ ...base.claims[0], recommendation: "BUY" }],
      }).success,
    ).toBe(false);
  });

  it("blocks a full-completion status when a capability is unavailable", () => {
    expect(
      evaluatePublicationQuality({ ...base, requestedStatus: "complete" }),
    ).toEqual({
      publishable: false,
      status: "incomplete",
      blockers: [
        "requested_status_mismatch:complete:complete_with_limitations",
      ],
    });
  });
});
