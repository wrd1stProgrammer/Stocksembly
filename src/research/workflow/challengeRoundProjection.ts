import type { z } from "zod";
import type {
  DepartmentConsolidationOutputSchema,
  MemoOutputSchema,
} from "../domain/agentOutputs";
import type { ArtifactIdSchema } from "../domain/ids";
import {
  WORKFLOW_V1_ATTRIBUTION_ALIASES,
  WORKFLOW_V1_ROLE_ALIASES,
} from "../domain/roleAliases";
import {
  type SpecialistRoleId,
  WORKFLOW_V1_ROLE_REGISTRY,
} from "../domain/roleRegistry";
import {
  type CHALLENGE_ASSIGNMENTS,
  type ChallengeJobPrompt,
  ChallengeJobPromptSchema,
} from "./challengeRoundContracts";

type AuthenticatedMemo = {
  readonly roleId: SpecialistRoleId;
  readonly payload: z.infer<typeof MemoOutputSchema>;
  readonly artifactId: z.infer<typeof ArtifactIdSchema>;
  readonly contentHash: string;
};

type AuthenticatedConsolidation = {
  readonly logicalArtifactId: string;
  readonly payload: z.infer<typeof DepartmentConsolidationOutputSchema>;
  readonly artifactId: z.infer<typeof ArtifactIdSchema>;
  readonly contentHash: string;
};

type ProjectionInputs = {
  readonly memos: readonly AuthenticatedMemo[];
  readonly consolidations: readonly AuthenticatedConsolidation[];
};

type PositionEntry = {
  readonly memo: AuthenticatedMemo;
  readonly position: AuthenticatedMemo["payload"]["positions"][number];
};

const SEVERE_SLURS = [
  /\b(?:clueless|idiots?|liars?|morons?|stupid)\b/iu,
  /(?:거짓말쟁이|멍청이|바보|얼간이)/u,
] as const;
const AMBIGUOUS_PERSONA_ALIASES = new Set([
  "June",
  "준",
  "Hana",
  "하나",
  "Min",
  "민",
]);
const ENGLISH_HUMAN_REFERENCE =
  "(?:agent|analyst|author|chair|lead|researcher)";
const ENGLISH_CLAIM_REFERENCE = "(?:analysis|claim|take)";
const ENGLISH_EVALUATIVE_ATTACK =
  "(?:absurd|biased|careless|dishonest|foolish|ignorant|incompetent|lazy|misleading|reckless|ridiculous|unqualified|wrong)";
const ENGLISH_HARSH_RHETORIC = "(?:absurd|foolish|ridiculous|stupid)";
const ENGLISH_HUMAN_ATTACK = new RegExp(
  `(?:\\b${ENGLISH_HUMAN_REFERENCE}\\b[^.!?\\n]{0,48}\\b${ENGLISH_EVALUATIVE_ATTACK}\\b|\\b${ENGLISH_EVALUATIVE_ATTACK}\\b[^.!?\\n]{0,48}\\b${ENGLISH_HUMAN_REFERENCE}\\b)`,
  "iu",
);
const ENGLISH_CLAIM_ATTACK = new RegExp(
  `(?:\\b${ENGLISH_CLAIM_REFERENCE}\\b[^.!?\\n]{0,48}\\b${ENGLISH_HARSH_RHETORIC}\\b|\\b${ENGLISH_HARSH_RHETORIC}\\b[^.!?\\n]{0,48}\\b${ENGLISH_CLAIM_REFERENCE}\\b)`,
  "iu",
);
const KOREAN_HUMAN_REFERENCE =
  "(?:분석가|작성자|저자|에이전트|책임자|리드|의장|연구원|연구자)";
const KOREAN_CLAIM_REFERENCE = "(?:주장|견해|의견|분석)";
const KOREAN_EVALUATIVE_ATTACK =
  "(?:게으르|무능|무모|무지|부정직|부주의|어리석|오도|우스꽝|자격\\s*없|잘못됐|터무니없|틀렸|편향|황당)";
const KOREAN_HARSH_RHETORIC = "(?:어리석|우스꽝|터무니없|황당)";
const KOREAN_HUMAN_ATTACK = new RegExp(
  `(?:${KOREAN_HUMAN_REFERENCE}[^.!?。！？\\n]{0,40}${KOREAN_EVALUATIVE_ATTACK}|${KOREAN_EVALUATIVE_ATTACK}[^.!?。！？\\n]{0,40}${KOREAN_HUMAN_REFERENCE})`,
  "u",
);
const KOREAN_CLAIM_ATTACK = new RegExp(
  `(?:${KOREAN_CLAIM_REFERENCE}[^.!?。！？\\n]{0,40}${KOREAN_HARSH_RHETORIC}|${KOREAN_HARSH_RHETORIC}[^.!?。！？\\n]{0,40}${KOREAN_CLAIM_REFERENCE})`,
  "u",
);

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsAttributionAlias(text: string, alias: string): boolean {
  const escaped = escapedRegex(alias);
  const leadingBoundary = "(?:^|[^\\p{L}\\p{N}_])";
  const trailingBoundary =
    "(?=$|[^\\p{L}\\p{N}_]|(?:은|는|이|가|을|를|의|께서|에게|와|과|도|만))";
  return new RegExp(
    `${leadingBoundary}${escaped}${trailingBoundary}`,
    "iu",
  ).test(text);
}

function attributesCanonicalTitle(text: string, title: string): boolean {
  const escaped = escapedRegex(title);
  const leadingBoundary = "(?:^|[^\\p{L}\\p{N}_])";
  const trailingBoundary = "(?=$|[^\\p{L}\\p{N}_])";
  const boundedTitle = `${leadingBoundary}${escaped}${trailingBoundary}`;
  const englishVerb =
    "(?:argued|argues|claimed|claims|noted|notes|reported|reports|said|says)";
  const english = new RegExp(
    `(?:\\baccording\\s+to\\s+(?:the\\s+)?${escaped}${trailingBoundary}|${boundedTitle}[\\s,;:\\-—]+${englishVerb}\\b)`,
    "iu",
  );
  const koreanVerb =
    "(?:말했다|말한다|주장했다|주장한다|언급했다|언급한다|보고했다|보고한다|밝혔다|밝힌다|설명했다|설명한다)";
  const korean = new RegExp(
    `${leadingBoundary}${escaped}(?:(?:은|는|이|가|께서)\\s*(?:${koreanVerb}|[^.!?。！？\\n]{1,30}(?:라고|다고)\\s*${koreanVerb})|(?:에\\s*따르면|의\\s+말에\\s+따르면))`,
    "iu",
  );
  return english.test(text) || korean.test(text);
}

function containsPersonalRhetoric(text: string): boolean {
  return (
    SEVERE_SLURS.some((pattern) => pattern.test(text)) ||
    ENGLISH_HUMAN_ATTACK.test(text) ||
    ENGLISH_CLAIM_ATTACK.test(text) ||
    KOREAN_HUMAN_ATTACK.test(text) ||
    KOREAN_CLAIM_ATTACK.test(text)
  );
}

export function challengePromptIsBlindSafe(
  prompt: ChallengeJobPrompt,
): boolean {
  const text = [
    prompt.target.publicSummary.en,
    prompt.target.publicSummary.ko,
    prompt.counterpoint.publicSummary.en,
    prompt.counterpoint.publicSummary.ko,
  ].join(" ");
  const aliases = Object.values(WORKFLOW_V1_ATTRIBUTION_ALIASES).flat();
  const unconditionalAliases = aliases.filter(
    (alias) => !AMBIGUOUS_PERSONA_ALIASES.has(alias),
  );
  const roleTitles = Object.values(WORKFLOW_V1_ROLE_ALIASES).flatMap(
    (roleAliases) => roleAliases.slice(-2),
  );
  return (
    !unconditionalAliases.some((alias) =>
      containsAttributionAlias(text, alias),
    ) &&
    ![...roleTitles, ...AMBIGUOUS_PERSONA_ALIASES].some((speaker) =>
      attributesCanonicalTitle(text, speaker),
    ) &&
    !containsPersonalRhetoric(text)
  );
}

function departmentPositions(
  assignment: (typeof CHALLENGE_ASSIGNMENTS)[number],
  memos: readonly AuthenticatedMemo[],
): readonly PositionEntry[] {
  const memberIds =
    WORKFLOW_V1_ROLE_REGISTRY.departments[assignment.targetDepartmentId]
      .memberIds;
  return memos
    .filter((memo) => memberIds.some((memberId) => memberId === memo.roleId))
    .flatMap((memo) =>
      memo.payload.positions.map((position) => ({ memo, position })),
    );
}

export function projectChallengePrompt(
  assignment: (typeof CHALLENGE_ASSIGNMENTS)[number],
  inputs: ProjectionInputs,
): ChallengeJobPrompt | undefined {
  const consolidation = inputs.consolidations.find(
    (item) =>
      item.logicalArtifactId ===
      `consolidation:${assignment.targetDepartmentId}`,
  );
  const targetClaimId = consolidation?.payload.strongestClaimIds[0];
  if (consolidation === undefined || targetClaimId === undefined)
    return undefined;
  const positions = departmentPositions(assignment, inputs.memos);
  const target = positions.find(
    (entry) => entry.position.claimId === targetClaimId,
  );
  if (target === undefined) return undefined;
  const classifiedCounterClaims = new Set([
    ...consolidation.payload.disagreementClaimIds,
    ...consolidation.payload.weakestClaimIds,
    ...consolidation.payload.revisedClaimIds,
    ...consolidation.payload.removedClaimIds,
  ]);
  const counterCandidates = positions.filter(
    (entry) =>
      entry.position.claimId !== targetClaimId &&
      (entry.position.stance === "opposes" ||
        entry.position.stance === "uncertain" ||
        classifiedCounterClaims.has(entry.position.claimId)),
  );
  const counter =
    counterCandidates.find((entry) =>
      entry.position.evidenceArtifactIds.some(
        (artifactId) =>
          !target.position.evidenceArtifactIds.includes(artifactId),
      ),
    ) ??
    counterCandidates[0] ??
    positions.find((entry) => entry.position.claimId !== targetClaimId);
  if (counter === undefined) return undefined;
  const distinctCounterevidence = counter.position.evidenceArtifactIds.filter(
    (artifactId) => !target.position.evidenceArtifactIds.includes(artifactId),
  );
  const counterevidence =
    distinctCounterevidence.length > 0
      ? distinctCounterevidence
      : counter.position.evidenceArtifactIds;
  const sourceArtifacts = [
    {
      artifactId: consolidation.artifactId,
      contentHash: consolidation.contentHash,
      relation: "target_consolidation",
    },
    {
      artifactId: target.memo.artifactId,
      contentHash: target.memo.contentHash,
      relation: "target_memo",
    },
    {
      artifactId: counter.memo.artifactId,
      contentHash: counter.memo.contentHash,
      relation: "counter_memo",
    },
  ];
  return ChallengeJobPromptSchema.parse({
    kind: "blind_challenge_input_v1",
    assignment: {
      challengerId: assignment.challengerId,
      targetScope: assignment.targetScope,
    },
    sourceArtifactIds: [
      ...new Set(sourceArtifacts.map((source) => source.artifactId)),
    ],
    sourceArtifacts,
    target: {
      claimId: target.position.claimId,
      publicSummary: target.position.publicSummary,
      evidenceArtifactIds: target.position.evidenceArtifactIds,
      candidateCounterevidenceArtifactIds: counterevidence,
      materiality: "material",
    },
    counterpoint: {
      claimId: counter.position.claimId,
      publicSummary: counter.position.publicSummary,
      evidenceArtifactIds: counterevidence,
    },
  });
}
