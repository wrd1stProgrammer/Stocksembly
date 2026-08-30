import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoOutputSchema } from "../domain/agentOutputs";
import type { SpecialistRoleId } from "../domain/roleRegistry";
import { CODEX_RUNTIME_POLICY } from "../server/codex/codexPolicy";
import { codexInputHash } from "../server/codex/codexRunner";
import { SpecialistMemoOutputSchema } from "./specialistRoundContracts";
import {
  allocateSpecialistClaimSlots,
  normalizeSpecialistClaimSlotBindings,
  sanitizeSpecialistDecisiveMetricIds,
  sanitizeSpecialistEvidenceTypeBindings,
  sanitizeSpecialistNumericMetricValues,
  validateSpecialistClaimSubmission,
} from "./specialistRoundInput";
import { makeSqliteRoundHarness } from "./specialistRoundSqlite.testSupport";
import { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";
import {
  prepareSpecialistJobs,
  specialistInlineEvidenceBudget,
} from "./specialistRoundSqliteStage";

const expectedDimensions = {
  market: ["regime", "regime", "catalyst"],
  market_news: ["timing", "timing"],
  benchmark: ["relative_performance", "relative_performance"],
  company: ["growth_engine", "growth_engine"],
  company_product: ["adoption", "adoption"],
  company_competition: ["moat", "competitive_erosion", "moat"],
  financial: ["margin", "reinvestment", "margin"],
  valuation: ["embedded_expectations", "embedded_expectations"],
  financial_quality: ["cash_conversion", "cash_conversion"],
  risk: ["downside_path", "leading_indicator", "downside_path"],
  risk_policy: ["mitigant", "leading_indicator", "mitigant"],
} as const;

function quantifiedCandidate(input: {
  readonly roleId: SpecialistRoleId;
  readonly claimSlots: ReturnType<typeof allocateSpecialistClaimSlots>;
  readonly artifactId: string;
  readonly metricId: string;
  readonly leadSummary: { readonly en: string; readonly ko: string };
}) {
  return {
    kind: "memo" as const,
    sourceArtifactIds: [input.artifactId],
    positions: input.claimSlots
      .filter((slot) => !slot.optional)
      .map((slot, index) => ({
        claimId: slot.claimId,
        decisionDimension: slot.decisionDimension,
        roleOwner: input.roleId,
        stance: "supports" as const,
        materiality: slot.materiality,
        publicSummary:
          index === 0
            ? input.leadSummary
            : {
                en: `Distinct grounded observation ${index + 1}.`,
                ko: `서로 다른 근거 관찰 ${index + 1}입니다.`,
              },
        evidenceArtifactIds: [input.artifactId],
        decisiveMetricIds: index === 0 ? [input.metricId] : [],
        strongestContraryObservation: {
          en: `Contrary evidence ${index + 1} remains relevant.`,
          ko: `반대 근거 ${index + 1}도 여전히 중요합니다.`,
        },
        falsifier: {
          en: `The observable condition ${index + 1} reverses.`,
          ko: `관찰 조건 ${index + 1}이 반전됩니다.`,
        },
      })),
    dissent: [],
    unknowns: [],
  };
}

describe("specialist claim slots", () => {
  it("reserves runner headroom before inlining evidence", () => {
    const basePromptBytes = 190 * 1_024;
    const inlineBudget = specialistInlineEvidenceBudget(basePromptBytes);

    expect(basePromptBytes + inlineBudget).toBeLessThan(
      CODEX_RUNTIME_POLICY.maxPromptBytes,
    );
    expect(inlineBudget).toBeGreaterThan(0);
  });

  it("drops invented metric references without discarding the claim", () => {
    const candidate = {
      kind: "memo",
      positions: [
        {
          decisiveMetricIds: ["registered-value", "invented-display-label"],
        },
      ],
    };
    expect(
      sanitizeSpecialistDecisiveMetricIds(candidate, ["registered-value"]),
    ).toMatchObject({
      positions: [{ decisiveMetricIds: ["registered-value"] }],
    });
  });

  it("rejects a revenue-growth percentage that does not match its decisive metric", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const roleId = "financial" as const;
    const claimSlots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId,
    });
    const artifact = harness.sources[0];
    if (artifact === undefined) throw new TypeError("source fixture missing");
    const artifactId = artifact.artifactId;
    const metricId = "revenue_quarter:growth:Q:2026-07-26";
    const candidate = quantifiedCandidate({
      roleId,
      claimSlots,
      artifactId,
      metricId,
      leadSummary: {
        en: "Quarterly revenue increased 106% year over year.",
        ko: "최근 분기 매출은 전년 대비 106% 증가했습니다.",
      },
    });

    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId,
          claimSlots,
          allowedArtifactIds: [artifactId],
          allowedMetricIds: [metricId],
          registeredValues: [
            {
              valueId: metricId,
              metric: "revenue_growth",
              value: "18",
              unit: "percent",
              period: "Q:2026-07-26",
            },
          ],
        },
        candidate,
      ),
    ).toEqual({
      ok: false,
      reason: "specialist_claim_numeric_metric_mismatch",
    });

    const repaired = quantifiedCandidate({
      roleId,
      claimSlots,
      artifactId,
      metricId,
      leadSummary: {
        en: "Quarterly revenue increased 18% year over year.",
        ko: "최근 분기 매출은 전년 대비 18% 증가했습니다.",
      },
    });
    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId,
          claimSlots,
          allowedArtifactIds: [artifactId],
          allowedMetricIds: [metricId],
          registeredValues: [
            {
              valueId: metricId,
              metric: "revenue_growth",
              value: "18",
              unit: "percent",
              period: "Q:2026-07-26",
            },
          ],
        },
        repaired,
      ),
    ).toEqual({ ok: true });
  });

  it("grounds a mismatched percentage from its selected registered metric without a model rewrite", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const roleId = "financial" as const;
    const claimSlots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId,
    });
    const artifact = harness.sources[0];
    if (artifact === undefined) throw new TypeError("source fixture missing");
    const metricId = "revenue_quarter:growth:Q:2026-07-26";
    const registeredValues = [
      {
        valueId: metricId,
        metric: "revenue_growth",
        value: "18",
        unit: "percent",
        period: "Q:2026-07-26",
      },
    ];
    const candidate = quantifiedCandidate({
      roleId,
      claimSlots,
      artifactId: artifact.artifactId,
      metricId,
      leadSummary: {
        en: "Quarterly revenue increased 106% year over year.",
        ko: "최근 분기 매출은 전년 대비 106% 증가했습니다.",
      },
    });

    const grounded = sanitizeSpecialistNumericMetricValues(
      candidate,
      registeredValues,
    );

    expect(
      (grounded as { readonly positions: readonly unknown[] }).positions[0],
    ).toMatchObject({
      publicSummary: {
        en: "Quarterly revenue increased 18% year over year.",
        ko: "최근 분기 매출은 전년 대비 18% 증가했습니다.",
      },
    });
    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId,
          claimSlots,
          allowedArtifactIds: [artifact.artifactId],
          allowedMetricIds: [metricId],
          registeredValues,
        },
        grounded,
      ),
    ).toEqual({ ok: true });
  });

  it("preserves a sub-one percentage as registered instead of treating it as a ratio", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const roleId = "market" as const;
    const claimSlots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId,
    });
    const artifact = harness.sources[0];
    if (artifact === undefined) throw new TypeError("source fixture missing");
    const metricId = "daily_change_percent:2026-07-26";
    const registeredValues = [
      {
        valueId: metricId,
        metric: "daily_change_percent",
        value: "0.5",
        unit: "percent",
        period: "2026-07-26",
      },
    ];
    const candidate = quantifiedCandidate({
      roleId,
      claimSlots,
      artifactId: artifact.artifactId,
      metricId,
      leadSummary: {
        en: "The share price increased 50% today.",
        ko: "주가는 오늘 50% 상승했습니다.",
      },
    });

    const grounded = sanitizeSpecialistNumericMetricValues(
      candidate,
      registeredValues,
    );

    expect(
      (grounded as { readonly positions: readonly unknown[] }).positions[0],
    ).toMatchObject({
      publicSummary: {
        en: "The share price increased 0.5% today.",
        ko: "주가는 오늘 0.5% 상승했습니다.",
      },
    });
  });

  it("removes only ambiguous percentage values instead of exhausting replacement retries", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const roleId = "financial" as const;
    const claimSlots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId,
    });
    const artifact = harness.sources[0];
    if (artifact === undefined) throw new TypeError("source fixture missing");
    const revenueMetricId = "revenue_quarter:growth:Q:2026-07-26";
    const marginMetricId = "operating_margin:Q:2026-07-26";
    const registeredValues = [
      {
        valueId: revenueMetricId,
        metric: "revenue_growth",
        value: "18",
        unit: "percent",
        period: "Q:2026-07-26",
      },
      {
        valueId: marginMetricId,
        metric: "operating_margin",
        value: "55",
        unit: "percent",
        period: "Q:2026-07-26",
      },
    ];
    const candidate = quantifiedCandidate({
      roleId,
      claimSlots,
      artifactId: artifact.artifactId,
      metricId: revenueMetricId,
      leadSummary: {
        en: "Revenue increased 106%, while operating margin reached 77%.",
        ko: "매출은 106% 증가했고 영업이익률은 77%를 기록했습니다.",
      },
    });
    const lead = candidate.positions[0];
    if (lead === undefined) throw new TypeError("lead claim missing");
    const ambiguous = {
      ...candidate,
      positions: [
        {
          ...lead,
          decisiveMetricIds: [marginMetricId, revenueMetricId],
        },
        ...candidate.positions.slice(1),
      ],
    };

    const grounded = sanitizeSpecialistNumericMetricValues(
      ambiguous,
      registeredValues,
    );

    expect(
      (grounded as { readonly positions: readonly unknown[] }).positions[0],
    ).toMatchObject({
      publicSummary: {
        en: "The evidence supports the direction of this claim, but an exact rate is omitted because it could not be matched unambiguously.",
        ko: "근거는 이 주장의 방향성을 뒷받침하지만, 명확히 연결되지 않은 비율은 표시하지 않았습니다.",
      },
    });
    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId,
          claimSlots,
          allowedArtifactIds: [artifact.artifactId],
          allowedMetricIds: [revenueMetricId, marginMetricId],
          registeredValues,
        },
        grounded,
      ),
    ).toEqual({ ok: true });
  });

  it("does not mistake an explicit future threshold for a reported metric", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const roleId = "financial" as const;
    const claimSlots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId,
    });
    const artifact = harness.sources[0];
    if (artifact === undefined) throw new TypeError("source fixture missing");
    const firstMarginId = "operating_margin:Q:2026-04-27";
    const secondMarginId = "operating_margin:Q:2026-07-26";
    const candidate = quantifiedCandidate({
      roleId,
      claimSlots,
      artifactId: artifact.artifactId,
      metricId: secondMarginId,
      leadSummary: {
        en: "Operating margin improved from 65.6% to 66.2%; treat a fall below 60% next quarter as a warning threshold.",
        ko: "영업이익률은 65.6%에서 66.2%로 개선됐으며, 다음 분기 60% 아래로 하락하면 경고 조건입니다.",
      },
    });
    const lead = candidate.positions[0];
    if (lead === undefined) throw new TypeError("lead claim missing");
    const withBothMargins = {
      ...candidate,
      positions: [
        {
          ...lead,
          decisiveMetricIds: [firstMarginId, secondMarginId],
        },
        ...candidate.positions.slice(1),
      ],
    };

    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId,
          claimSlots,
          allowedArtifactIds: [artifact.artifactId],
          allowedMetricIds: [firstMarginId, secondMarginId],
          registeredValues: [
            {
              valueId: firstMarginId,
              metric: "operating_margin",
              value: "65.6",
              unit: "percent",
              period: "Q:2026-04-27",
            },
            {
              valueId: secondMarginId,
              metric: "operating_margin",
              value: "66.2",
              unit: "percent",
              period: "Q:2026-07-26",
            },
          ],
        },
        withBothMargins,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects ownership filings cited for a non-ownership valuation claim", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const roleId = "valuation" as const;
    const claimSlots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId,
    });
    const artifact = harness.sources[0];
    if (artifact === undefined) throw new TypeError("source fixture missing");
    const artifactId = artifact.artifactId;
    const metricId = "forward_pe";
    const candidate = quantifiedCandidate({
      roleId,
      claimSlots,
      artifactId,
      metricId,
      leadSummary: {
        en: "The current valuation requires faster earnings delivery.",
        ko: "현재 밸류에이션은 더 빠른 이익 실현을 요구합니다.",
      },
    });

    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId,
          claimSlots,
          allowedArtifactIds: [artifactId],
          allowedMetricIds: [metricId],
          evidenceArtifacts: [
            { evidenceId: artifactId, dataset: "sec_filings", form: "4" },
          ],
        },
        candidate,
      ),
    ).toEqual({
      ok: false,
      reason: "specialist_claim_evidence_type_mismatch",
    });
  });

  it("removes an incidental ownership filing when a suitable source remains", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const roleId = "valuation" as const;
    const claimSlots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId,
    });
    const filing = harness.sources[0];
    const ownership = harness.sources[1];
    if (filing === undefined || ownership === undefined)
      throw new TypeError("source fixtures missing");
    const candidate = quantifiedCandidate({
      roleId,
      claimSlots,
      artifactId: filing.artifactId,
      metricId: "forward_pe",
      leadSummary: {
        en: "The current valuation requires faster earnings delivery.",
        ko: "현재 밸류에이션은 더 빠른 이익 실현을 요구합니다.",
      },
    });
    const mixed = {
      ...candidate,
      sourceArtifactIds: [filing.artifactId, ownership.artifactId],
      positions: candidate.positions.map((position) => ({
        ...position,
        evidenceArtifactIds: [filing.artifactId, ownership.artifactId],
      })),
    };

    const evidenceArtifacts = [
      {
        evidenceId: filing.artifactId,
        dataset: "sec_filings",
        form: "10-Q",
      },
      {
        evidenceId: ownership.artifactId,
        dataset: "sec_filings",
        form: "4",
      },
    ];
    const repaired = sanitizeSpecialistEvidenceTypeBindings(
      mixed,
      evidenceArtifacts,
    );

    expect(repaired).toMatchObject({
      positions: [
        { evidenceArtifactIds: [filing.artifactId] },
        { evidenceArtifactIds: [filing.artifactId] },
      ],
    });
    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId,
          claimSlots,
          allowedArtifactIds: [filing.artifactId, ownership.artifactId],
          allowedMetricIds: ["forward_pe"],
          evidenceArtifacts,
        },
        repaired,
      ),
    ).toEqual({ ok: true });
  });

  it("rebinds an ownership-only non-ownership claim to sealed primary evidence", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const roleId = "valuation" as const;
    const claimSlots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId,
    });
    const ownership = harness.sources[0];
    const currentReport = harness.sources[1];
    if (ownership === undefined || currentReport === undefined)
      throw new TypeError("source fixtures missing");
    const candidate = quantifiedCandidate({
      roleId,
      claimSlots,
      artifactId: ownership.artifactId,
      metricId: "forward_pe",
      leadSummary: {
        en: "The current valuation requires faster earnings delivery.",
        ko: "현재 밸류에이션은 더 빠른 이익 실현을 요구합니다.",
      },
    });
    const evidenceArtifacts = [
      {
        evidenceId: ownership.artifactId,
        dataset: "sec_insider_transactions",
        form: "4",
      },
      {
        evidenceId: currentReport.artifactId,
        dataset: "sec_filing",
        form: "8-K",
      },
    ];

    const repaired = sanitizeSpecialistEvidenceTypeBindings(
      candidate,
      evidenceArtifacts,
    );

    expect(repaired).toMatchObject({
      positions: [
        { evidenceArtifactIds: [currentReport.artifactId] },
        { evidenceArtifactIds: [currentReport.artifactId] },
      ],
    });
    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId,
          claimSlots,
          allowedArtifactIds: [ownership.artifactId, currentReport.artifactId],
          allowedMetricIds: ["forward_pe"],
          evidenceArtifacts,
        },
        repaired,
      ),
    ).toEqual({ ok: true });
  });

  it("repairs a copied claim-id typo from its unique semantic slot", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const slots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId: "company_competition",
    });
    const slot = slots[1];
    if (slot === undefined) throw new TypeError("claim slot fixture missing");
    const typo = `${slot.claimId.slice(0, -1)}${slot.claimId.endsWith("8") ? "2" : "8"}`;
    const normalized = normalizeSpecialistClaimSlotBindings(
      { roleId: "company_competition", claimSlots: slots },
      {
        kind: "memo",
        positions: [
          {
            claimId: typo,
            decisionDimension: slot.decisionDimension,
            roleOwner: "company_competition",
            materiality: slot.materiality,
          },
        ],
      },
    );

    expect(normalized).toMatchObject({
      positions: [
        {
          claimId: slot.claimId,
          decisionDimension: slot.decisionDimension,
          roleOwner: "company_competition",
          materiality: slot.materiality,
        },
      ],
    });
  });

  it("keeps evidence slicing, source IDs, and runner input stable", async () => {
    const harness = await makeSqliteRoundHarness("none");

    const first = prepareSpecialistJobs(harness.input, harness.sources);
    const replay = prepareSpecialistJobs(harness.input, harness.sources);

    expect(replay).toEqual(first);
    for (const job of first) {
      const manifest = JSON.parse(job.prompt.split("\n", 1)[0] ?? "null") as {
        readonly request: {
          readonly role: { readonly id: keyof typeof expectedDimensions };
          readonly claimSlots: readonly {
            readonly claimId: string;
            readonly decisionDimension: string;
            readonly materiality: "material" | "supporting";
            readonly optional: boolean;
          }[];
          readonly comparatorQualification: { readonly status: string };
        };
      };
      expect(manifest).toMatchObject({
        request: { comparatorQualification: { status: "not_available" } },
      });
      const expectedSlots = allocateSpecialistClaimSlots(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId: manifest.request.role.id,
        },
        harness.input.mandate.researchProfile,
      );
      expect(manifest.request.claimSlots).toEqual(expectedSlots);
      expect(manifest.request.claimSlots.length).toBeGreaterThanOrEqual(1);
      expect(manifest.request.claimSlots.length).toBeLessThanOrEqual(3);
      expect(
        new Set(manifest.request.claimSlots.map((slot) => slot.claimId)).size,
      ).toBe(manifest.request.claimSlots.length);
      expect(manifest.request.claimSlots[0]).toMatchObject({
        materiality: "material",
        optional: false,
      });
      expect(
        manifest.request.claimSlots.map((slot) => slot.decisionDimension),
      ).toEqual(expectedDimensions[manifest.request.role.id]);
      const assignment = harness.input.assignments.assignments.find(
        (candidate) => candidate.roleId === job.roleId,
      );
      expect(assignment).toBeDefined();
      expect(job.sourceArtifactIds).toEqual(
        assignment?.evidenceSlice.artifacts.map((artifact) => {
          const source = harness.sources.find(
            (candidate) => candidate.evidenceId === artifact.evidenceId,
          );
          if (source === undefined)
            throw new TypeError("source fixture missing");
          return source.artifactId;
        }),
      );
      expect(job.inputManifestHash).toBe(assignment?.evidenceSlice.sliceHash);
      expect(job.inputHash).toBe(
        codexInputHash({
          stage: "memo",
          prompt: job.prompt,
          outputSchema: SpecialistMemoOutputSchema,
        }),
      );
    }
  });

  it("allocates byte-identical role-owned IDs across retry and replay", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const identity = {
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId: "market" as const,
    };

    expect(allocateSpecialistClaimSlots(identity)).toEqual(
      allocateSpecialistClaimSlots(identity),
    );
  });

  it("assigns exclusive decision dimensions to every specialist family", async () => {
    const harness = await makeSqliteRoundHarness("none");
    for (const [roleId, dimensions] of Object.entries(expectedDimensions))
      expect(
        allocateSpecialistClaimSlots({
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId: roleId as keyof typeof expectedDimensions,
        }).map((slot) => slot.decisionDimension),
      ).toEqual(dimensions);
  });

  it("requires every decision-grade slot while allowing the optional depth slot to remain unused", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const assignment = harness.input.assignments.assignments.find(
      (candidate) => candidate.roleId === "market",
    );
    if (assignment === undefined) throw new TypeError("market fixture missing");
    const request = {
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId: assignment.roleId,
      claimSlots: allocateSpecialistClaimSlots({
        runId: harness.input.mandate.runId,
        snapshotId: harness.input.snapshot.snapshotId,
        roleId: assignment.roleId,
      }),
      allowedArtifactIds: [harness.sources[0]!.artifactId],
      allowedMetricIds: ["cash_conversion_annual:FY:2026-01-25"],
    };
    const candidate = {
      kind: "memo" as const,
      sourceArtifactIds: request.allowedArtifactIds,
      positions: request.claimSlots
        .filter((slot) => !slot.optional)
        .map((slot, index) => ({
          claimId: slot.claimId,
          decisionDimension: slot.decisionDimension,
          roleOwner: request.roleId,
          stance: index === 0 ? ("supports" as const) : ("uncertain" as const),
          materiality: slot.materiality,
          publicSummary: {
            en: `Distinct market observation ${index + 1} is supported by the record.`,
            ko: `서로 다른 시장 관찰 ${index + 1}이 근거 기록의 지지를 받습니다.`,
          },
          evidenceArtifactIds: request.allowedArtifactIds,
          decisiveMetricIds: request.allowedMetricIds,
          strongestContraryObservation: {
            en: `Contrary observation ${index + 1} remains unresolved.`,
            ko: `반대 관찰 ${index + 1}은 아직 해소되지 않았습니다.`,
          },
          falsifier: {
            en: `Observable reversal condition ${index + 1} occurs.`,
            ko: `관찰 가능한 반전 조건 ${index + 1}이 발생합니다.`,
          },
        })),
      dissent: [],
      unknowns: [],
    };

    expect(validateSpecialistClaimSubmission(request, candidate)).toEqual({
      ok: true,
    });
    expect(MemoOutputSchema.safeParse(candidate).success).toBe(true);
    expect(SpecialistMemoOutputSchema.safeParse(candidate).success).toBe(true);
  });

  it("fails closed on malformed atomic output without relying on prompt wording", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const roleId = "market_news" as const;
    const claimSlots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId,
    });
    const allowedArtifactIds = [harness.sources[0]!.artifactId];
    const malformed = {
      kind: "memo",
      sourceArtifactIds: allowedArtifactIds,
      positions: [
        {
          claimId: claimSlots[0]!.claimId,
          decisionDimension: claimSlots[0]!.decisionDimension,
          roleOwner: roleId,
          stance: "supports",
          materiality: "material",
          publicSummary: { en: "Support holds.", ko: "지지선이 유지된다." },
          evidenceArtifactIds: allowedArtifactIds,
          decisiveMetricIds: [],
        },
      ],
      dissent: [],
      unknowns: [],
    };

    expect(SpecialistMemoOutputSchema.safeParse(malformed).success).toBe(false);
    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId,
          claimSlots,
          allowedArtifactIds,
          allowedMetricIds: [],
        },
        malformed,
      ),
    ).toEqual({ ok: false, reason: "specialist_claim_malformed" });
  });

  it.each([
    ["invented slot", "specialist_claim_slot_unallocated"],
    ["out-of-role dimension", "specialist_claim_dimension_out_of_role"],
    ["more than three metrics", "specialist_claim_too_many_decisive_metrics"],
    ["unknown evidence", "specialist_claim_unknown_evidence"],
  ] as const)("rejects %s with a stable reason", async (variant, reason) => {
    const harness = await makeSqliteRoundHarness("none");
    const slots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId: "market_news",
    });
    const slot = slots[0]!;
    const allowed = harness.sources[0]!.artifactId;
    const base = {
      claimId: slot.claimId,
      decisionDimension: slot.decisionDimension,
      roleOwner: "market_news",
      stance: "supports" as const,
      materiality: "material" as const,
      publicSummary: {
        en: "Price holds above support.",
        ko: "가격이 지지선을 유지한다.",
      },
      evidenceArtifactIds: [allowed],
      decisiveMetricIds: [],
      strongestContraryObservation: {
        en: "Volume is weak.",
        ko: "거래량은 약하다.",
      },
      falsifier: {
        en: "Price closes below support.",
        ko: "가격이 지지선 아래로 마감한다.",
      },
    };
    const position = {
      ...base,
      ...(variant === "invented slot"
        ? { claimId: "00000000-0000-4000-8000-999999999999" }
        : {}),
      ...(variant === "out-of-role dimension"
        ? { decisionDimension: "margin" }
        : {}),
      ...(variant === "more than three metrics"
        ? {
            decisiveMetricIds: [
              "00000000-0000-4000-8000-000000000001",
              "00000000-0000-4000-8000-000000000002",
              "00000000-0000-4000-8000-000000000003",
              "00000000-0000-4000-8000-000000000004",
            ],
          }
        : {}),
      ...(variant === "unknown evidence"
        ? { evidenceArtifactIds: ["00000000-0000-4000-8000-999999999999"] }
        : {}),
    };

    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId: "market_news",
          claimSlots: slots,
          allowedArtifactIds: [allowed],
          allowedMetricIds: position.decisiveMetricIds,
        },
        {
          kind: "memo",
          sourceArtifactIds: [allowed],
          positions: [position],
          dissent: [],
          unknowns: [],
        },
      ),
    ).toEqual({ ok: false, reason });
  });

  it("rejects a normalized thesis already submitted by a teammate", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const slots = allocateSpecialistClaimSlots({
      runId: harness.input.mandate.runId,
      snapshotId: harness.input.snapshot.snapshotId,
      roleId: "benchmark",
    });
    const allowed = harness.sources[0]!.artifactId;
    const thesis = {
      en: "Growth is strong, but uncertain!",
      ko: "성장은 강하지만 불확실하다.",
    };

    expect(
      validateSpecialistClaimSubmission(
        {
          runId: harness.input.mandate.runId,
          snapshotId: harness.input.snapshot.snapshotId,
          roleId: "benchmark",
          claimSlots: slots,
          allowedArtifactIds: [allowed],
          allowedMetricIds: [],
          existingDepartmentTheses: [
            {
              en: "growth is strong but uncertain",
              ko: "성장은 강하지만 불확실하다",
            },
          ],
        },
        {
          kind: "memo",
          sourceArtifactIds: [allowed],
          positions: [
            {
              claimId: slots[0]!.claimId,
              decisionDimension: slots[0]!.decisionDimension,
              roleOwner: "benchmark",
              stance: "uncertain",
              materiality: "material",
              publicSummary: thesis,
              evidenceArtifactIds: [allowed],
              decisiveMetricIds: [],
              strongestContraryObservation: {
                en: "No contrary observation.",
                ko: "반대 관찰은 없다.",
              },
              falsifier: {
                en: "Relative growth reverses.",
                ko: "상대 성장이 역전된다.",
              },
            },
          ],
          dissent: [],
          unknowns: [],
        },
      ),
    ).toEqual({ ok: false, reason: "specialist_claim_duplicate_thesis" });
  });

  it("atomically reserves a normalized thesis for only one department role", () => {
    const root = mkdtempSync(join(tmpdir(), "specialist-thesis-"));
    const authority = new SpecialistRoundSqliteAuthority(
      join(root, "research.sqlite"),
    );
    try {
      const input = {
        runId: "00000000-0000-4000-8000-000000000001",
        departmentId: "market",
        fingerprints: [
          "growth is strong but uncertain|성장은 강하지만 불확실하다",
        ],
        at: "2026-07-31T00:00:00.000Z",
      };

      expect(
        authority.reserveDepartmentTheses({ ...input, roleId: "market" }),
      ).toBe(true);
      expect(
        authority.reserveDepartmentTheses({ ...input, roleId: "benchmark" }),
      ).toBe(false);
    } finally {
      authority.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not consume an earlier new thesis when a later thesis conflicts", () => {
    const root = mkdtempSync(join(tmpdir(), "specialist-thesis-batch-"));
    const authority = new SpecialistRoundSqliteAuthority(
      join(root, "research.sqlite"),
    );
    try {
      const shared = {
        runId: "00000000-0000-4000-8000-000000000001",
        departmentId: "market",
        at: "2026-07-31T00:00:00.000Z",
      };
      const duplicate = "already reserved|이미 예약됨";
      const unrelated = "unrelated new thesis|관련 없는 새 논지";

      expect(
        authority.reserveDepartmentTheses({
          ...shared,
          roleId: "market",
          fingerprints: [duplicate],
        }),
      ).toBe(true);
      expect(
        authority.reserveDepartmentTheses({
          ...shared,
          roleId: "benchmark",
          fingerprints: [unrelated, duplicate],
        }),
      ).toBe(false);
      expect(
        authority.reserveDepartmentTheses({
          ...shared,
          roleId: "market_news",
          fingerprints: [unrelated],
        }),
      ).toBe(true);
    } finally {
      authority.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects intra-batch duplicates without mutation and keeps retries idempotent", () => {
    const root = mkdtempSync(join(tmpdir(), "specialist-thesis-retry-"));
    const authority = new SpecialistRoundSqliteAuthority(
      join(root, "research.sqlite"),
    );
    try {
      const shared = {
        runId: "00000000-0000-4000-8000-000000000001",
        departmentId: "company",
        at: "2026-07-31T00:00:00.000Z",
      };
      const repeated = "same batch thesis|같은 배치 논지";
      const stable = "idempotent retry thesis|멱등 재시도 논지";

      expect(
        authority.reserveDepartmentTheses({
          ...shared,
          roleId: "company",
          fingerprints: [repeated, repeated],
        }),
      ).toBe(false);
      expect(
        authority.reserveDepartmentTheses({
          ...shared,
          roleId: "company_product",
          fingerprints: [repeated],
        }),
      ).toBe(true);
      expect(
        authority.reserveDepartmentTheses({
          ...shared,
          roleId: "company",
          fingerprints: [stable],
        }),
      ).toBe(true);
      expect(
        authority.reserveDepartmentTheses({
          ...shared,
          roleId: "company",
          fingerprints: [stable],
        }),
      ).toBe(true);
    } finally {
      authority.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
