import { describe, expect, it } from "vitest";
import { hashBytes } from "../domain/contractHelpers";
import {
  fallbackResearchBrief,
  groundedResearchBrief,
} from "../domain/researchBrief";
import { researchEvidenceExcerpt } from "../domain/researchEvidenceExcerpt";
import { DEFAULT_RESEARCH_PROFILE } from "../domain/researchProfile";
import {
  earningsExhibitDocuments,
  selectCurrentReports,
} from "../server/data/sec/earningsEvidence";
import {
  SemanticAuditPromptSchema,
  semanticAuditModelPrompt,
} from "./semanticAuditContracts";
import { allocateSpecialistClaimSlots } from "./specialistRoundInput";
import { makeSqliteRoundHarness } from "./specialistRoundSqlite.testSupport";
import { prepareSpecialistJobs } from "./specialistRoundSqliteStage";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("question-specific research boundaries", () => {
  it("preserves every financial citation and measurement when compacting repeated metadata", async () => {
    const harness = await makeSqliteRoundHarness("none");
    const jobs = prepareSpecialistJobs(harness.input, harness.sources);
    const values = harness.input.snapshot.valueRegistry.records;
    for (const job of jobs) {
      const payload = JSON.parse(job.prompt.split("\n")[0] ?? "null");
      for (const value of payload.request.registeredValues) {
        const original = values.find((item) => item.valueId === value.valueId);
        expect(original).toMatchObject(value);
        expect(value).not.toHaveProperty("hash");
        expect(value).not.toHaveProperty("runId");
      }
      expect(Buffer.byteLength(job.prompt)).toBeLessThan(256 * 1024);
    }
  });

  it("selects the relevant filing body beyond the first 12000 characters", () => {
    const text = `${"Cover and legal boilerplate. ".repeat(800)}\nCustomer retention reached a new high as product monetization improved.\n${"Unrelated appendix. ".repeat(100)}`;
    const excerpt = researchEvidenceExcerpt(
      text,
      ["customer retention", "product monetization"],
      4_000,
    );
    expect(excerpt).toContain("Customer retention reached a new high");
    expect(excerpt.length).toBeLessThanOrEqual(4_000);
    expect(researchEvidenceExcerpt(text, ["customer"], 0)).toBe("");
  });

  it("keeps only an entity definition with a literal source quote and question term", () => {
    const question = "Orion의 투자 효율을 평가해줘";
    const brief = {
      ...fallbackResearchBrief(question, DEFAULT_RESEARCH_PROFILE),
      entities: [
        {
          term: "Orion",
          meaning: "An issuer product",
          evidenceId: "filing:one",
          exactQuote: "Orion is our new product.",
        },
      ],
    };
    const sources = [
      { evidenceId: "filing:one", text: "Orion is our new product." },
    ];
    expect(
      groundedResearchBrief(brief, question, sources).entities[0]?.meaning,
    ).toBe("An issuer product");
    expect(
      groundedResearchBrief(brief, question, [
        { evidenceId: "another", text: "Orion is our new product." },
      ]).entities[0]?.meaning,
    ).toBeNull();
    expect(
      groundedResearchBrief(brief, "재무를 평가해줘", sources).entities[0]
        ?.meaning,
    ).toBeNull();
  });

  it("changes the role-owned first claim with the question's priority", () => {
    const brief = fallbackResearchBrief("재투자 효율을 평가해줘", {
      ...DEFAULT_RESEARCH_PROFILE,
      investmentHorizon: "long",
    });
    const slots = allocateSpecialistClaimSlots(
      { runId: id(1), snapshotId: id(2), roleId: "financial" },
      DEFAULT_RESEARCH_PROFILE,
      brief,
    );
    expect(slots[0]?.decisionDimension).toBe("reinvestment");
    expect(slots[0]?.analyticalAngle).toContain("required reinvestment");
    const financial = fallbackResearchBrief(
      "재무 건전성을 평가해줘",
      DEFAULT_RESEARCH_PROFILE,
    );
    expect(financial.objective).toBe("financial_health");
    expect(financial.priorityDimensions[0]).toBe("cash_conversion");
  });

  it("includes the latest earnings filing even when two newer 8-Ks concern other events", () => {
    const records = [3, 2, 1].map((n) => ({
      accessionNumber: id(n),
      primaryDocument: `filing${n}.htm`,
      form: "8-K",
      acceptedAt: `2026-08-0${n}T12:00:00.000Z`,
      filedAt: `2026-08-0${n}T00:00:00.000Z`,
      period: `2026-08-0${n}`,
      items: n === 1 ? "2.02,9.01" : "5.02",
    }));
    expect(
      selectCurrentReports(records).map((filing) => filing.primaryDocument),
    ).toEqual(["filing1.htm", "filing3.htm", "filing2.htm"]);
  });

  it("only follows observed earnings links inside the same SEC accession", () => {
    const html =
      '<table><tr><td><a href="ex99-1.htm">99.1</a></td><td>Earnings release</td></tr></table><a href="https://external.test/ex99.htm">Earnings</a><a href="../other/ex99-2.htm">Results</a><a href="ex99-1.htm">Duplicate</a><a href="agreement.htm">Agreement</a>';
    expect(
      earningsExhibitDocuments(
        html,
        "https://www.sec.gov/Archives/edgar/data/1/00001/main.htm",
      ),
    ).toEqual(["ex99-1.htm"]);
  });

  it("delivers the original question and reversed falsifier to the semantic auditor", () => {
    const exactText = "Operating margin fell from 60% to 40%.";
    const falsifier = {
      en: "If margin declines, the temporary-margin thesis weakens.",
      ko: "마진이 하락하면 고마진이 일시적이라는 판단이 약화됩니다.",
    };
    const prompt = SemanticAuditPromptSchema.parse({
      kind: "semantic_audit_input_v1",
      question: "재무 건전성을 평가해줘",
      structuralAuditHash: "a".repeat(64),
      sourceArtifactIds: [id(1)],
      questions: [],
      claims: [
        {
          claimId: id(2),
          materiality: "material",
          text: {
            en: "High margins appear temporary.",
            ko: "고마진은 일시적으로 보입니다.",
          },
          falsifier,
          evidence: [
            {
              artifactId: id(1),
              evidenceId: "filing:one",
              source: "sec_primary_filing",
              retrievedAt: "2026-08-01T00:00:00.000Z",
              availableAt: "2026-08-01T00:00:00.000Z",
              locatorHash: "b".repeat(64),
              span: {
                start: 0,
                end: exactText.length,
                textHash: hashBytes(exactText),
              },
              exactText,
              relation: "supporting",
            },
          ],
        },
      ],
    });
    const modelInput = JSON.parse(semanticAuditModelPrompt(prompt));
    expect(modelInput.question).toBe("재무 건전성을 평가해줘");
    expect(modelInput.claims[0].falsifier).toEqual(falsifier);
    expect(modelInput.instructions).toContain("reinforce the thesis");
  });
});
