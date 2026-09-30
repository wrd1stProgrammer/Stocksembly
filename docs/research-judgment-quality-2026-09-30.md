# Committee judgment and comparison evidence review

## Scope

This review traces repeated balanced committee judgments and missing matched-session comparison prose, then exercises the real local committee workflow with Codex subscription execution. Production data and publishing are not changed.

## Confirmed causes and changes

1. **Comparison evidence was excluded from specialist prompts.** The collector stores matched-session comparisons in `insightsentry_peers`, but the specialist prompt filter excluded that entire dataset. The filter now admits the precise `insightsentry:comparisons` artifact while retaining the exclusion of unqualified valuation peers and request ledgers.
2. **Team agreement votes were interpreted as price direction.** Votes endorse or oppose a department thesis, which can itself be bearish. The chair projection overwrote the model's evidence-based stance using those votes and mapped conditional results to balanced. The projection now preserves the grounded chair stance. A deterministic recovery declares insufficient evidence rather than inventing a direction from votes.
3. **API cooldowns used a frozen research cutoff as a runtime clock.** Initial collection supplied `input.asOf` as the client's current time. After a rate limit, the governor could never observe the cooldown expiring. Collection now uses the client's live clock; the separate research cutoff still controls evidence windows and request identity. A regression test exercises recovery after a 429 and the next comparison request.

Comparison failures now record a safe failure classification so missing history can be distinguished from insufficient overlap. The macOS Codex binary identity was updated to the installed signed 0.159.2 app bundle for the requested local execution; production Linux identity pins were not changed.

4. **Minor citation defects discarded otherwise usable chair output.** Real NVDA output repeated source IDs; AMD output included a malformed claim UUID. Citation arrays are now deduplicated and malformed claim/source IDs removed before strict parsing. Missing required citations still fail validation, and catalog ownership/grounding checks remain in place. The model's narrative and stance are not rewritten by this normalization.

## Local exercise

- Database: isolated PostgreSQL on localhost, `stocksembly_judgment_quality_test`.
- Evidence and output root: `/tmp/stocksembly-quality.judgment-20260930`.
- Execution: Codex CLI, with API research execution disabled.
- Questions: NVDA buyback causality; TSLA medium-term fundamentals and valuation; AMD versus NVDA relative performance and economics.
- An initial three-report exercise exposed the cooldown defect. A second exercise uses the corrected runtime clock. The initial outputs are diagnostic results rather than final quality acceptance evidence.

## Validation

- Specialist comparison qualification: 7 tests passed.
- Final focused suite: 61 tests passed across chair V3, specialist qualification, comparison evidence, and the InsightSentry client. It includes preservation of all four stance values and partial citation normalization.
- Live-clock cooldown recovery: passed.
- Protected Codex execution and trust-boundary prompt: targeted test passed.
- Research worker typecheck and build: passed.
- Changed-file lint: no errors; existing non-null assertion warnings remain.
- The broader repository lint has unrelated pre-existing errors. A broader Codex suite also references an absent local evidence fixture. These are not presented as passing checks.

## Final publication review

All three actual committee workflows published with status `complete-with-limitations`, using Codex CLI rather than API generation. These are not fixture reports. The citation normalization change was made after this exercise exposed its defect; it is covered by the focused regression suite, but these three saved reports were not regenerated with that last change.

| Symbol | Report ID | Published judgment | Quality result |
| --- | --- | --- | --- |
| NVDA | a6a04098-e299-4ae3-b1ac-f0a661b03065 | Insufficient evidence | Matched-session returns now reach the benchmark specialist. Citation fallback still affects this saved report, and the headline answer drifts from buyback causality to competitive erosion. |
| TSLA | c38ef705-9ffa-46a4-bbd3-5037646053de | Downside skewed | The directional judgment survives projection. Toyota comparisons use actual matched periods; cash-flow figures and the summary's treatment of valuation need further reconciliation. |
| AMD | 8ee068ad-84a5-48a9-86df-ac2a4a1a8be8 | Insufficient evidence | The comparison correctly distinguishes strong 20-session performance from weaker 60-session relative performance. Citation fallback and awkward adoption prose remain in the saved report. |

The corrected collection contains concrete comparisons:

- NVDA: 20 sessions, Aug 31–Sep 29, return 2.91% versus XLK 4.29% and TSM 10.02%; 60 sessions, Jul 6–Sep 29, return 16.19% versus XLK 5.95% and TSM 1.14%.
- TSLA: 60 sessions, return -15.94% versus Toyota 3.84%; 250 sessions, -20.66% versus Toyota -2.29%.
- AMD versus NVDA: 20 sessions, 29.07% versus 2.91%; 60 sessions, 10.06% versus 16.19%; 250 sessions, 275.53% versus 21.78%.

Browser review used `/dev/generated-report/<report-id>` and read the actual persisted publications. Screenshots are saved under `/tmp/stocksembly-quality.judgment-20260930/quality-review-final/screenshots/{NVDA,TSLA,AMD}.jpg`. The dark desktop report layout renders, but the chart fetch in this development preview lacks the required authentication; chart visual correctness is not claimed.

## Remaining quality findings

Publication success is not quality acceptance. None of the three reports is represented as fully passing editorial review.

1. `publicationNarrativeRecovery.ts` inserts generic limitation prefixes and raw audit reasons into public narrative. These repeat across team views and summary sections, making the report read like an audit log. Recovery should preserve the specific supported answer and place uncertainty beside the affected claim.
2. Broad-sector financial peer selection admitted unrelated TSLA candidates such as RGR and SDHC. The benchmark specialist used Toyota, but candidate selection should require verified business overlap or an explicitly labeled market proxy before calling a company an operating comparable.
3. TSLA's risk summary states operating cash flow 46.97, capex 57.96 and FCF -10.92 in hundred-million-dollar units; that subtraction gives -10.99. Another section uses capex 57.89, which does reconcile. This cross-section inconsistency needs source-level numeric reconciliation rather than prose smoothing.
4. NVDA's fallback answer does not directly address the user's buyback causality question. Preserving the chair output through citation normalization addresses one trigger, but query relevance needs its own acceptance check.
5. Automated heuristic scores were NVDA 8.5/10, TSLA 9.25/10, AMD 8.5/10. All carried a `raw_public_precision` fatal flag and failed the cross-section thesis-duplication check; NVDA and AMD also failed the direct-directional-answer check. Those scores are diagnostic only and must not be described as a quality pass. A simple manual decimal scan did not reproduce the precision flag, so its classifier also needs investigation.

Raw detail, report, rendered-file and quality JSON outputs are retained under `/tmp/stocksembly-quality.judgment-20260930/quality-review-final` for follow-up. Production publishing and records were not modified by this local exercise.
