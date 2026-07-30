import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  DepartmentConsolidationOutputSchema,
  MemoOutputSchema,
} from "../../../domain/agentOutputs";
import {
  canonicalJson,
  hashBytes,
  hashCanonical,
} from "../../../domain/contractHelpers";
import {
  ArtifactIdSchema,
  ReportIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { buildResearchMetricSnapshot } from "../../../domain/metricSnapshot";
import {
  type ResearchReport,
  ResearchReportSchema,
} from "../../../domain/report";
import { singleLocaleReportForStorage } from "../../../domain/reportStorage";
import { normalizeReportNarrativeText } from "../../../domain/reportText";
import {
  WORKFLOW_V1_ROLE_REGISTRY,
  type WorkflowDepartmentId,
} from "../../../domain/roleRegistry";
import type { ArtifactCasPort } from "../../../ports/artifacts";
import { ArtifactDigestSchema } from "../../../ports/artifacts";
import { serializeSafeJson } from "./safeJson";

const RunSchema = z.object({
  snapshot_id: SnapshotIdSchema,
  status: z.literal("running"),
  version: z.number().int().nonnegative(),
  report_id: z.null(),
  symbol: z.string().min(1),
  question: z.string(),
  locale: z.enum(["en", "ko"]),
  research_kind: z.literal("department"),
  department_id: z.enum(["market", "company", "financial", "risk"]),
});

const ArtifactRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  content_hash: ArtifactDigestSchema,
  logical_key: z.string(),
  created_at: z.string().datetime(),
  locator_json: z.string().nullable(),
  envelope_json: z.string().nullable(),
});

const EnvelopeSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    logicalArtifactId: z.string(),
    roleId: z.string(),
    stage: z.enum(["memo", "department_consolidation"]),
    outputHash: z.string().regex(/^[a-f0-9]{64}$/),
    payload: z.unknown(),
  })
  .passthrough();

const DEPARTMENT_COPY = {
  market: {
    name: { en: "Market team", ko: "시장 분석팀" },
    section: { en: "Market structure and demand", ko: "시장 구조와 수요" },
  },
  company: {
    name: { en: "Company team", ko: "기업 분석팀" },
    section: {
      en: "Business quality and execution",
      ko: "사업 경쟁력과 실행력",
    },
  },
  financial: {
    name: { en: "Financial team", ko: "재무 분석팀" },
    section: {
      en: "Financial quality and valuation",
      ko: "재무 품질과 밸류에이션",
    },
  },
  risk: {
    name: { en: "Risk team", ko: "리스크 분석팀" },
    section: { en: "Downside map and controls", ko: "하방 위험과 통제 조건" },
  },
} as const satisfies Record<
  WorkflowDepartmentId,
  {
    readonly name: { readonly en: string; readonly ko: string };
    readonly section: { readonly en: string; readonly ko: string };
  }
>;

const SOURCE_PUBLISHERS: Readonly<Record<string, string>> = {
  sec: "U.S. Securities and Exchange Commission",
  bls: "U.S. Bureau of Labor Statistics",
  treasury: "U.S. Department of the Treasury",
  alpaca: "Alpaca Market Data",
  insightsentry: "InsightSentry via RapidAPI",
  captured_web: "Captured web source",
};

type LoadedAgentArtifact = {
  readonly row: z.infer<typeof ArtifactRowSchema>;
  readonly envelope: z.infer<typeof EnvelopeSchema>;
};

function narrative(value: string, locale: "en" | "ko"): string {
  return normalizeReportNarrativeText(
    value,
    locale === "ko"
      ? "팀은 이 근거 기반 판단을 유지했습니다."
      : "The team retained this evidence-backed finding.",
  );
}

function localizedNarrative(value: {
  readonly en: string;
  readonly ko: string;
}) {
  return {
    en: narrative(value.en, "en"),
    ko: narrative(value.ko, "ko"),
  };
}

function sourcePublisher(logicalKey: string, locator: unknown): string {
  const source =
    typeof locator === "object" &&
    locator !== null &&
    "source" in locator &&
    typeof locator.source === "string"
      ? locator.source
      : logicalKey;
  const match = Object.entries(SOURCE_PUBLISHERS).find(([key]) =>
    source.includes(key),
  );
  return match?.[1] ?? "Verified research source";
}

function optionalString(value: unknown, key: string): string | undefined {
  return typeof value === "object" &&
    value !== null &&
    key in value &&
    typeof Reflect.get(value, key) === "string"
    ? (Reflect.get(value, key) as string)
    : undefined;
}

const DepartmentQuoteLocatorSchema = z
  .object({
    kind: z.literal("licensed_provider"),
    dataset: z.literal("insightsentry_quote"),
  })
  .passthrough();

const DepartmentMarketSnapshotSchema = z
  .object({
    providerCode: z.string().trim().min(1),
    marketState: z.enum(["OPEN", "CLOSED", "PRE", "POST", "HOLIDAYS"]),
    observedAt: z.string().datetime(),
    lastPrice: z.number().positive(),
    change: z.number().finite().optional(),
    changePercent: z.number().finite().optional(),
    currency: z.string().trim().min(3).max(8),
  })
  .passthrough();

export function parseDepartmentMarketSnapshot(
  locator: unknown,
  content: string,
): ResearchReport["marketSnapshot"] {
  if (!DepartmentQuoteLocatorSchema.safeParse(locator).success)
    return undefined;
  try {
    const parsed = DepartmentMarketSnapshotSchema.safeParse(
      JSON.parse(content),
    );
    if (!parsed.success) return undefined;
    const {
      providerCode,
      marketState,
      observedAt,
      lastPrice,
      change,
      changePercent,
      currency,
    } = parsed.data;
    return {
      providerCode,
      marketState,
      observedAt,
      lastPrice,
      ...(change === undefined ? {} : { change }),
      ...(changePercent === undefined ? {} : { changePercent }),
      currency,
    };
  } catch {
    return undefined;
  }
}

async function authenticateAgentArtifact(
  cas: ArtifactCasPort,
  row: z.infer<typeof ArtifactRowSchema>,
): Promise<LoadedAgentArtifact | undefined> {
  const stored = await cas.get(row.content_hash);
  if (
    stored === undefined ||
    stored.descriptor.artifactId !== row.artifact_id ||
    stored.descriptor.runId !== row.run_id ||
    stored.descriptor.snapshotId !== row.snapshot_id ||
    hashBytes(stored.bytes) !== row.content_hash
  )
    return undefined;
  const parsed: unknown = JSON.parse(new TextDecoder().decode(stored.bytes));
  const envelope = EnvelopeSchema.safeParse(parsed);
  if (
    !envelope.success ||
    row.envelope_json === null ||
    canonicalJson(parsed) !== canonicalJson(JSON.parse(row.envelope_json)) ||
    envelope.data.outputHash !== hashCanonical(envelope.data.payload) ||
    envelope.data.logicalArtifactId !== row.logical_key
  )
    return undefined;
  return { row, envelope: envelope.data };
}

function localizedSections(
  departmentId: WorkflowDepartmentId,
  consolidation: z.infer<typeof DepartmentConsolidationOutputSchema>,
  positions: readonly z.infer<typeof MemoOutputSchema>["positions"][number][],
) {
  const accepted = new Set(consolidation.acceptedClaimIds);
  const strongest = new Set(consolidation.strongestClaimIds);
  const selected = positions.filter((position) =>
    accepted.has(position.claimId),
  );
  const selectedOrAll = selected.length > 0 ? selected : positions;
  const sourceIds = [
    ...new Set(
      selectedOrAll.flatMap((position) => position.evidenceArtifactIds),
    ),
  ];
  const claimIds = selectedOrAll.map((position) => position.claimId);
  const evidenceBody = {
    en: selectedOrAll
      .map((position) => narrative(position.publicSummary.en, "en"))
      .join(" "),
    ko: selectedOrAll
      .map((position) => narrative(position.publicSummary.ko, "ko"))
      .join(" "),
  };
  const strongestPositions = selectedOrAll.filter((position) =>
    strongest.has(position.claimId),
  );
  const leadPositions =
    strongestPositions.length > 0
      ? strongestPositions
      : selectedOrAll.slice(0, 1);
  const secondaryPositions = selectedOrAll.filter(
    (position) =>
      !leadPositions.some((lead) => lead.claimId === position.claimId),
  );
  const teamBody =
    leadPositions.length > 0
      ? {
          en: leadPositions
            .map((position) => narrative(position.publicSummary.en, "en"))
            .join(" "),
          ko: leadPositions
            .map((position) => narrative(position.publicSummary.ko, "ko"))
            .join(" "),
        }
      : evidenceBody;
  const secondaryBody =
    secondaryPositions.length > 0
      ? {
          en: secondaryPositions
            .map((position) => narrative(position.publicSummary.en, "en"))
            .join(" "),
          ko: secondaryPositions
            .map((position) => narrative(position.publicSummary.ko, "ko"))
            .join(" "),
        }
      : evidenceBody;
  const openQuestionBody = {
    en:
      consolidation.openQuestions
        .map((question) => narrative(question.en, "en"))
        .join(" ") || "No additional team-level question was retained.",
    ko:
      consolidation.openQuestions
        .map((question) => narrative(question.ko, "ko"))
        .join(" ") || "추가로 보존된 팀 단위 질문은 없습니다.",
  };
  const dissentBody = {
    en:
      consolidation.dissent
        .map((dissent) => narrative(dissent.publicSummary.en, "en"))
        .join(" ") || "No material dissent was retained within this team.",
    ko:
      consolidation.dissent
        .map((dissent) => narrative(dissent.publicSummary.ko, "ko"))
        .join(" ") || "팀 내부에서 보존된 중대한 이견은 없습니다.",
  };
  const changeBody = {
    en:
      consolidation.dissent.length > 0
        ? `Reassess the team view if the retained counter-evidence is confirmed by the next filing or operating update: ${dissentBody.en}`
        : openQuestionBody.en,
    ko:
      consolidation.dissent.length > 0
        ? `다음 공시나 운영 지표에서 보존된 반대 근거가 확인되면 팀 판단을 재검토합니다: ${dissentBody.ko}`
        : openQuestionBody.ko,
  };
  const base = [
    {
      id: "ten_second_brief",
      title: {
        en: `${DEPARTMENT_COPY[departmentId].name.en} conclusion`,
        ko: `${DEPARTMENT_COPY[departmentId].name.ko} 결론`,
      },
      body: localizedNarrative(consolidation.publicSummary),
      claimIds,
      sourceIds,
    },
    {
      id: "supported_analysis",
      title: { en: "Evidence-backed findings", ko: "근거로 확인된 핵심 판단" },
      body: evidenceBody,
      claimIds,
      sourceIds,
    },
    {
      id: `${departmentId}_deep_dive`,
      title: DEPARTMENT_COPY[departmentId].section,
      body: teamBody,
      claimIds: leadPositions.map((position) => position.claimId),
      sourceIds: [
        ...new Set(
          leadPositions.flatMap((position) => position.evidenceArtifactIds),
        ),
      ],
    },
    {
      id: "valuation_comparison",
      title:
        departmentId === "financial"
          ? { en: "Valuation constraints", ko: "밸류에이션 제약" }
          : departmentId === "market"
            ? { en: "Relative leadership check", ko: "상대 주도력 검증" }
            : departmentId === "company"
              ? { en: "Moat pressure test", ko: "경쟁우위 압력 테스트" }
              : { en: "Risk concentration check", ko: "위험 집중도 검증" },
      body: secondaryBody,
      claimIds: secondaryPositions.map((position) => position.claimId),
      sourceIds: [
        ...new Set(
          secondaryPositions.flatMap(
            (position) => position.evidenceArtifactIds,
          ),
        ),
      ],
    },
    {
      id: "operational_scenarios",
      title: { en: "Questions to monitor", ko: "다음에 확인할 질문" },
      body: openQuestionBody,
      claimIds,
      sourceIds,
    },
    {
      id: "dissent_unknowns",
      title: { en: "Dissent and unknowns", ko: "이견과 미확인 사항" },
      body: dissentBody,
      claimIds: consolidation.dissent.map((dissent) => dissent.claimId),
      sourceIds,
    },
    {
      id: "change_conditions",
      title: { en: "What could change this view", ko: "판단이 바뀌는 조건" },
      body: changeBody,
      claimIds: consolidation.dissent.map((dissent) => dissent.claimId),
      sourceIds,
    },
  ];
  return {
    en: base.map((section) => ({
      ...section,
      title: section.title.en,
      body: section.body.en,
    })),
    ko: base.map((section) => ({
      ...section,
      title: section.title.ko,
      body: section.body.ko,
    })),
  };
}

async function buildReport(
  cas: ArtifactCasPort,
  runId: string,
  run: z.infer<typeof RunSchema>,
  rows: readonly z.infer<typeof ArtifactRowSchema>[],
): Promise<
  | {
      readonly report: ResearchReport;
      readonly parentRows: readonly z.infer<typeof ArtifactRowSchema>[];
    }
  | undefined
> {
  const departmentId = run.department_id;
  const memberIds =
    WORKFLOW_V1_ROLE_REGISTRY.departments[departmentId].memberIds;
  const logicalIds = [
    ...memberIds.map((roleId) => `memo:${roleId}`),
    `consolidation:${departmentId}`,
  ];
  const parentRows = logicalIds.flatMap((logicalId) => {
    const row = rows.find((candidate) => candidate.logical_key === logicalId);
    return row === undefined ? [] : [row];
  });
  if (parentRows.length !== logicalIds.length) return undefined;
  const authenticated = await Promise.all(
    parentRows.map(async (row) => await authenticateAgentArtifact(cas, row)),
  );
  if (authenticated.some((value) => value === undefined)) return undefined;
  const loaded = authenticated.flatMap((value) =>
    value === undefined ? [] : [value],
  );
  const memoOutputs = loaded.flatMap((value) => {
    if (value.envelope.stage !== "memo") return [];
    const parsed = MemoOutputSchema.safeParse(value.envelope.payload);
    return parsed.success ? [parsed.data] : [];
  });
  const consolidationEntry = loaded.find(
    (value) => value.envelope.stage === "department_consolidation",
  );
  const consolidation = DepartmentConsolidationOutputSchema.safeParse(
    consolidationEntry?.envelope.payload,
  );
  if (memoOutputs.length !== memberIds.length || !consolidation.success)
    return undefined;
  const positions = memoOutputs.flatMap((memo) => memo.positions);
  const citedSourceIds = [
    ...new Set(positions.flatMap((position) => position.evidenceArtifactIds)),
  ];
  const quoteRow = rows.find(
    (candidate) => candidate.logical_key === "evidence:insightsentry:quote",
  );
  const sourceIds = [
    ...citedSourceIds,
    ...(quoteRow === undefined || citedSourceIds.includes(quoteRow.artifact_id)
      ? []
      : [quoteRow.artifact_id]),
  ];
  const sourceRows = sourceIds.flatMap((sourceId) => {
    const row = rows.find((candidate) => candidate.artifact_id === sourceId);
    return row === undefined ? [] : [row];
  });
  if (sourceRows.length !== sourceIds.length) return undefined;
  const sources = [];
  let marketSnapshot: ResearchReport["marketSnapshot"];
  for (const row of sourceRows) {
    const stored = await cas.get(row.content_hash);
    if (stored === undefined || hashBytes(stored.bytes) !== row.content_hash)
      return undefined;
    const locator: unknown =
      row.locator_json === null ? undefined : JSON.parse(row.locator_json);
    marketSnapshot ??= parseDepartmentMarketSnapshot(
      locator,
      new TextDecoder().decode(stored.bytes),
    );
    const sourceUrl = optionalString(locator, "sourceUrl");
    const title =
      optionalString(locator, "title") ??
      row.logical_key.replace(/^evidence:/u, "").replaceAll(":", " · ");
    sources.push({
      sourceId: row.artifact_id,
      title: title.slice(0, 500),
      publisher: sourcePublisher(row.logical_key, locator),
      sourceClass:
        optionalString(locator, "source")?.slice(0, 80) ?? "verified_evidence",
      retrievedAt: row.created_at,
      ...(sourceUrl === undefined ? {} : { url: sourceUrl }),
    });
  }
  const metricEvidence: {
    quote?: unknown;
    fundamentals?: unknown;
    peers?: unknown;
  } = {};
  const metricArtifacts = await Promise.all(
    (
      [
        ["evidence:insightsentry:quote", "quote"],
        ["evidence:insightsentry:fundamentals", "fundamentals"],
        ["evidence:insightsentry:peers", "peers"],
      ] as const
    ).map(async ([logicalKey, field]) => {
      const row = rows.find(
        (candidate) => candidate.logical_key === logicalKey,
      );
      if (row === undefined) return undefined;
      const stored = await cas.get(row.content_hash);
      if (stored === undefined || hashBytes(stored.bytes) !== row.content_hash)
        return undefined;
      try {
        return [
          field,
          JSON.parse(new TextDecoder().decode(stored.bytes)) as unknown,
        ] as const;
      } catch {
        // A malformed optional metric artifact must not block report publication.
        return undefined;
      }
    }),
  );
  for (const artifact of metricArtifacts)
    if (artifact !== undefined) metricEvidence[artifact[0]] = artifact[1];
  const metricSnapshot = buildResearchMetricSnapshot({
    asOf:
      rows
        .map((row) => row.created_at)
        .sort()
        .at(-1) ?? new Date().toISOString(),
    ...metricEvidence,
  });
  const sections = localizedSections(
    departmentId,
    consolidation.data,
    positions,
  );
  const strongest = new Set(consolidation.data.strongestClaimIds);
  const accepted = new Set(consolidation.data.acceptedClaimIds);
  const claims = positions.map((position) => ({
    claimId: position.claimId,
    text: localizedNarrative(position.publicSummary),
    materiality: strongest.has(position.claimId)
      ? ("material" as const)
      : ("supporting" as const),
    semanticVerdict: accepted.has(position.claimId)
      ? ("entailed" as const)
      : ("partial" as const),
    sourceIds: position.evidenceArtifactIds,
  }));
  const dissentClaimIds = new Set(claims.map((claim) => claim.claimId));
  const dissent = consolidation.data.dissent
    .filter((item) => dissentClaimIds.has(item.claimId))
    .map((item, index) => ({
      id: `team-dissent-${index + 1}`,
      claimId: item.claimId,
      sourceIds:
        claims.find((claim) => claim.claimId === item.claimId)?.sourceIds ?? [],
      disposition: "retained" as const,
      text: localizedNarrative(item.publicSummary),
    }));
  const artifacts = loaded.map((value) => ({
    artifactId: value.row.artifact_id,
    logicalArtifactId: value.row.logical_key,
    roleId: value.envelope.roleId as (typeof memberIds)[number],
    stage: value.envelope.stage,
    status: "accepted" as const,
    runId: value.row.run_id,
    snapshotId: value.row.snapshot_id,
  }));
  const leadPosition = positions.find((position) =>
    strongest.has(position.claimId),
  );
  const report = ResearchReportSchema.parse({
    schemaVersion: "workflow-v1",
    reportId: ReportIdSchema.parse(randomUUID()),
    versionId: ReportVersionIdSchema.parse(randomUUID()),
    version: 1,
    runId,
    snapshotId: run.snapshot_id,
    status: "complete_with_limitations",
    researchTarget: { kind: "department", departmentId },
    ...(marketSnapshot === undefined ? {} : { marketSnapshot }),
    ...(metricSnapshot === undefined ? {} : { metricSnapshot }),
    ...(run.question.trim().length === 0
      ? {}
      : { researchDirection: run.question }),
    teamViews: [
      {
        departmentId,
        position: localizedNarrative(consolidation.data.publicSummary),
        vote:
          consolidation.data.disagreementClaimIds.length > 0 ||
          consolidation.data.openQuestions.length > 0
            ? "support_with_reservations"
            : "support",
        rationale:
          leadPosition === undefined
            ? localizedNarrative(consolidation.data.publicSummary)
            : localizedNarrative(leadPosition.publicSummary),
      },
    ],
    artifacts,
    capabilities: [
      { key: "team_evidence_review", availability: "available" },
      {
        key: "current_market_data",
        availability:
          marketSnapshot === undefined ? "unavailable" : "available",
        ...(marketSnapshot === undefined
          ? { limitationId: "current_market_data_unavailable" }
          : {}),
      },
      {
        key: "cross_team_review",
        availability: "unavailable",
        limitationId: "focused_team_scope",
      },
    ],
    locales: {
      en: {
        sections: sections.en,
        scenarios: [],
        dissent: dissent.map((item) => ({ ...item, text: item.text.en })),
        unknowns: consolidation.data.openQuestions.map((question, index) => ({
          id: `team-unknown-${index + 1}`,
          impact: narrative(question.en, "en"),
          nextEvidence: narrative(question.en, "en"),
        })),
      },
      ko: {
        sections: sections.ko,
        scenarios: [],
        dissent: dissent.map((item) => ({ ...item, text: item.text.ko })),
        unknowns: consolidation.data.openQuestions.map((question, index) => ({
          id: `team-unknown-${index + 1}`,
          impact: narrative(question.ko, "ko"),
          nextEvidence: narrative(question.ko, "ko"),
        })),
      },
    },
    versionDelta: {
      priorVersionId: null,
      addedClaimIds: claims.map((claim) => claim.claimId),
      removedClaimIds: [],
    },
    claims,
    sources,
    dataCoverage: [
      {
        dataset: `${departmentId}_team_evidence`,
        provider: "Sealed research snapshot",
        status: "available",
        observationCount: sources.length,
      },
    ],
    providerDisagreements: [],
    metrics: [
      {
        id: "accepted_team_claims",
        passed: claims.filter((claim) => claim.semanticVerdict === "entailed")
          .length,
        denominator: Math.max(1, claims.length),
      },
    ],
    limitations: [
      ...(marketSnapshot === undefined
        ? [
            {
              id: "current_market_data_unavailable",
              capability: "current_market_data" as const,
            },
          ]
        : []),
      { id: "focused_team_scope", capability: "cross_team_review" },
    ],
  });
  return { report, parentRows };
}

export type PublishDepartmentReportResult =
  | {
      readonly kind: "published";
      readonly reportId: string;
      readonly versionId: string;
      readonly artifactId: string;
      readonly digest: string;
    }
  | { readonly kind: "incomplete"; readonly reason: string };

export async function publishDepartmentReportForRun(
  options: {
    readonly databasePath: string;
    readonly cas: ArtifactCasPort;
    readonly now?: () => string;
  },
  rawRunId: string,
): Promise<PublishDepartmentReportResult> {
  const runId = RunIdSchema.parse(rawRunId);
  const database = new Database(options.databasePath, { timeout: 5_000 });
  database.pragma("foreign_keys = ON");
  try {
    const run = RunSchema.safeParse(
      database
        .prepare(`SELECT runs.snapshot_id, runs.status, runs.version,
          runs.report_id, research_requests.symbol, research_requests.question,
          research_requests.locale, research_requests.research_kind,
          research_requests.department_id
          FROM runs JOIN research_requests USING(run_id)
          WHERE runs.run_id = ?`)
        .get(runId),
    );
    if (!run.success)
      return { kind: "incomplete", reason: "department_run_not_publishable" };
    const rows = database
      .prepare(`SELECT artifacts.artifact_id, artifacts.run_id,
        artifacts.snapshot_id, artifacts.content_hash, artifacts.logical_key,
        artifacts.created_at, artifact_citation_metadata.locator_json,
        agent_output_commits.envelope_json
        FROM artifacts
        LEFT JOIN artifact_citation_metadata USING(artifact_id)
        LEFT JOIN agent_output_commits USING(artifact_id)
        WHERE artifacts.run_id = ?`)
      .all(runId)
      .map((value) => ArtifactRowSchema.parse(value));
    const publishedAt = options.now?.() ?? new Date().toISOString();
    const built = await buildReport(options.cas, runId, run.data, rows);
    if (built === undefined)
      return { kind: "incomplete", reason: "department_report_inputs_invalid" };
    const artifactId = ArtifactIdSchema.parse(randomUUID());
    const parentDigests = built.parentRows.map((row) => row.content_hash);
    const bytes = new TextEncoder().encode(
      canonicalJson(
        singleLocaleReportForStorage(built.report, run.data.locale),
      ),
    );
    const descriptor = await options.cas.put({
      artifactId,
      runId,
      snapshotId: run.data.snapshot_id,
      mediaType: "application/vnd.stocksembly.research-report+json",
      parentDigests,
      bytes,
    });
    database
      .transaction(() => {
        const current = RunSchema.parse(
          database
            .prepare(`SELECT runs.snapshot_id, runs.status, runs.version,
              runs.report_id, research_requests.symbol,
              research_requests.question, research_requests.locale,
              research_requests.research_kind,
              research_requests.department_id
              FROM runs JOIN research_requests USING(run_id)
              WHERE runs.run_id = ?`)
            .get(runId),
        );
        if (current.version !== run.data.version)
          throw new TypeError("department report publication conflict");
        database
          .prepare(`INSERT INTO artifacts(artifact_id, run_id, snapshot_id,
            content_hash, byte_length, media_type, logical_key, input_hash,
            created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            descriptor.artifactId,
            runId,
            descriptor.snapshotId,
            descriptor.digest,
            descriptor.byteLength,
            descriptor.mediaType,
            `report_version:${built.report.versionId}`,
            descriptor.digest,
            publishedAt,
          );
        const edge = database.prepare(`INSERT INTO artifact_edges(
          child_artifact_id, parent_artifact_id, relation)
          VALUES (?, ?, 'derived-from')`);
        for (const row of built.parentRows)
          edge.run(descriptor.artifactId, row.artifact_id);
        database
          .prepare(`INSERT INTO reports(report_id, run_id, snapshot_id,
            state, created_at) VALUES (?, ?, ?, 'published', ?)`)
          .run(built.report.reportId, runId, run.data.snapshot_id, publishedAt);
        const publicPayload = {
          schemaVersion: "workflow-v1",
          reportArtifactDigest: descriptor.digest,
          version: 1,
          priorVersionId: null,
          status: built.report.status,
          claimIds: built.report.claims.map((claim) => claim.claimId),
          sourceIds: built.report.sources.map((source) => source.sourceId),
          limitationIds: built.report.limitations.map(
            (limitation) => limitation.id,
          ),
        };
        database
          .prepare(`INSERT INTO report_versions(version_id, report_id, run_id,
            snapshot_id, version, artifact_id, status, published_at,
            public_payload_json) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`)
          .run(
            built.report.versionId,
            built.report.reportId,
            runId,
            run.data.snapshot_id,
            descriptor.artifactId,
            built.report.status,
            publishedAt,
            serializeSafeJson(publicPayload),
          );
        const changed = database
          .prepare(`UPDATE runs SET status = 'complete-with-limitations',
            report_id = ?, report_published_at = ?, version = version + 1,
            last_event_seq = last_event_seq + 1
            WHERE run_id = ? AND status = 'running' AND version = ?
              AND report_id IS NULL`)
          .run(built.report.reportId, publishedAt, runId, run.data.version);
        if (changed.changes !== 1)
          throw new TypeError("department report publication conflict");
        const sequence = z
          .object({ sequence: z.number().int().positive() })
          .parse(
            database
              .prepare(
                "SELECT last_event_seq AS sequence FROM runs WHERE run_id = ?",
              )
              .get(runId),
          ).sequence;
        database
          .prepare(`INSERT INTO run_events(run_id, sequence, event_id,
            event_type, state_id, occurred_at, payload_json)
            VALUES (?, ?, ?, 'report_published', 'report-published', ?, ?)`)
          .run(
            runId,
            sequence,
            randomUUID(),
            publishedAt,
            serializeSafeJson({
              schemaVersion: "workflow-v1",
              reportId: built.report.reportId,
              reportVersionId: built.report.versionId,
              artifactId: descriptor.artifactId,
              participantIds:
                WORKFLOW_V1_ROLE_REGISTRY.departments[run.data.department_id]
                  .memberIds,
              summary: {
                en: `${DEPARTMENT_COPY[run.data.department_id].name.en} deep-dive report published.`,
                ko: `${DEPARTMENT_COPY[run.data.department_id].name.ko} 심층 리포트가 발행됐습니다.`,
              },
              claimIds: publicPayload.claimIds,
              sourceIds: publicPayload.sourceIds,
              limitationIds: publicPayload.limitationIds,
            }),
          );
      })
      .immediate();
    return {
      kind: "published",
      reportId: built.report.reportId,
      versionId: built.report.versionId,
      artifactId: descriptor.artifactId,
      digest: descriptor.digest,
    };
  } catch (error) {
    return {
      kind: "incomplete",
      reason:
        error instanceof Error ? error.message : "department_publish_failed",
    };
  } finally {
    database.close();
  }
}
