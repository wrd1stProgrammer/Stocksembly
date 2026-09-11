# Individual research quality implementation

Baseline: a83cecf. Branch: codex/individual-research-quality. Existing worktrees are preserved.

## Completed work

1. Shared metric safeguards: retain provider definitions and optional fiscal boundaries, reconcile OCF/capex/FCF, and suppress unverified derived FCF ratios in financial cards and generated Q&A. Specialist and consolidation prompts require explicit accounting definitions. No report-wide rejection was added.
2. Risk semantics: separate thesis from its reversal condition, exclude mitigants from the downside register, remove visible pseudo-precision scores, and mark current alert state unknown rather than infer red/green from a thesis vote. Department headers no longer imply automatic trade direction.
3. Evidence planning: add deterministic question-specific requirements and excerpt search terms for relative returns, adoption, competitors, cash conversion and regulatory milestones. Preserve distinct supported facts during consolidation. Normalize provider comparison keys; partial qualified operating comparisons remain visible. Absolute returns do not establish benchmark outperformance.
4. Presentation: reduce oversized question headings and repeated decision text, collapse expert details and Q&A, enlarge portraits and body text, clarify audit percentages, retain source dates, and improve mobile financial diagnostic layout. Share department office scoping between home and research; correct stale history state and company labels.
5. Verification: application typecheck, worker typecheck/build and 30 focused tests across eight files passed. Four team previews were rendered at desktop 1440x1000 and mobile 390x844. Q&A expanded in each; no page exceptions or document horizontal overflow. Light/dark screenshots were inspected. Financial mobile diagnostic columns were corrected after visual inspection.

## Evidence

Local preview: http://localhost:3107/dev/team-report/financial (team navigation included).

Screenshots: /Users/minsikchae/.codex/visualizations/2026/09/05/01a07191-5e46-74d3-98a7-42e5a2471570/individual-quality-implementation/

Focused suites: researchQualityConsistency, RiskReportModel, ResearchFileQuestions, MarketCompanyReportProducts, publishDepartmentReportForRun, LiveOfficeResearchRoom, FinancialReportModel.quality, metricSnapshot.

## Scope and remaining measurement

These changes improve common generation instructions, metric interpretation and presentation. They do not create missing provider data, guarantee model compliance, or implement measured real-time risk thresholds. Provider and issuer FCF are kept distinct; there is no automatic replacement of provider values with narrative numbers. Fiscal boundaries are retained when supplied, not invented. Source retrieval time is not treated as proof of freshness.

Browser QA used existing deterministic development fixtures, not newly generated production reports. The previous four-report audit remains the baseline; a quality-score improvement requires a new live generation sample. Full production Next.js build, PDF export, live office animation and deployment were not exercised in this pass. Existing office-scoping regressions were tested. No commit, push, PR or production mutation was made.
