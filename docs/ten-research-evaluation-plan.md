# Ten-run research audit and reliability repair

Baseline: PR #57, ac7ae2c. Create ten distinct full-committee researches through the production browser UI. Failures count toward the ten original requests; never substitute a successful sample for a failed one. Preserve private request IDs and snapshots outside Git.

## Fixed scoring rubric (set before submission)

Research content score /10: question-specific answer 2; factual correctness and citation support 3; analytical depth and explicit calculations 2; counterarguments and falsifiable decision conditions 1.5; freshness and source traceability 1; clarity, chart/text consistency and presentation 0.5. Use quarter-point increments. Separate observed evidence from editorial judgment; this is a reproducible rubric, not a claim of absolute objectivity.

Delivery score is separately zero for no delivered report. Content score is N/A for a failed run with no report (do not grade invisible unpublished drafts as finished research). Report both delivered-report mean and all-request delivered-value mean (undelivered =0), plus first-pass publication rate and duration. Do not let graceful publication alone earn a high research score.

For every delivered report, read all sections in the browser, inspect citations and chart presentation, cross-check the decisive claim and at least two material numbers against available primary sources, and record quote/location-specific deductions. State uncertainty where source verification is unavailable. Score all ten including failure status.

## Boundaries

Quality improvements: findings and implementable plan only. Reliability failures: trace real persisted failure codes and inputs, implement the smallest corrective change, reproduce locally with the same inputs, and run focused regression checks. Never lower source integrity merely to produce a successful status. No production deployment or Git push without an explicit request.

## Progress

- [x] Submit 10 browser-created requests and retain their run IDs. All ten accepted through the signed-in production UI, full committee, Pro, English, on 2026-09-07 KST.
- [x] Observe every run to a terminal status; collect logs and report artifacts.
- [x] Score all ten using the fixed rubric and document a quality improvement plan.
- [x] Diagnose and repair actual execution/publication failures; verify locally.

## Question-specific acceptance criteria

| Symbol | Question | Required analytical distinctions |
|---|---|---|
| MSFT | Can AI cloud growth earn back Microsoft's data-center spending without squeezing free cash flow? | Azure/AI 성장과 전체 설비투자를 구분하고, 현금 설비투자·금융리스·감가상각·FCF를 같은 기간으로 연결한다. AI 단독 수익률이 비공개라면 추정 한계를 밝힌다. |
| GOOGL | Is AI search a new profit engine or a threat to Google's search advertising margins? | 검색 광고 성장과 AI 이용량을 혼동하지 않는다. 추론비용·클릭/광고단가·기존 검색 대체 가능성을 검토하며, 미공개 AI 수익성은 단정하지 않는다. |
| TSLA | How much of Tesla's valuation can its car business support before robotaxi profits arrive? | 자동차 본업의 매출·마진·현금흐름으로 지지되는 가치와 로보택시 옵션 가치를 분리한다. 가정에 따른 가치 범위를 제시하고 상용화·규제·수익화 조건을 명시한다. |
| AMD | Can AMD win enough AI accelerator share to justify today's valuation without NVIDIA-like margins? | AI 가속기 매출 또는 공개된 대체 지표, 점유율 가정, 마진, 주식 수를 연결한다. 데이터센터 전체를 AI 가속기 매출로 취급하거나 NVIDIA 마진을 그대로 적용하지 않는다. |
| PLTR | Can Palantir's commercial AI growth outweigh stock-based dilution at today's valuation? | 상업용 성장률·영업현금흐름·주식보상·희석 주식 수를 함께 다룬다. 조정 이익 개선만으로 주당 가치 증가를 단정하지 않는다. |
| COIN | Can Coinbase become less dependent on crypto trading through stablecoins and subscriptions? | 거래 수익과 구독·서비스 수익의 비중을 같은 기간으로 비교하고, 스테이블코인 수익의 금리·유통잔액 의존성을 구분한다. 암호자산 가격과 완전히 독립적이라고 단정하지 않는다. |
| COST | Can Costco's membership economics justify a premium multiple if consumer spending slows? | 회원비·갱신률·객단가/방문빈도·상품 마진의 관계를 설명하고, 높은 멀티플이 요구하는 성장률과 경기 둔화 시 하방을 연결한다. |
| LLY | Can Eli Lilly defend obesity-drug profits as competition and pricing pressure increase? | 물량·가격·제품 믹스·공급능력·경쟁/특허를 분리한다. 약효나 승인 여부를 추정하지 않고 회사·규제기관의 근거로 확인한다. |
| JPM | Can JPMorgan grow earnings if interest income falls and credit losses normalize? | 순이자이익·수수료·비용·대손비용과 자본환원을 은행에 맞는 지표로 연결한다. 산업기업의 일반 FCF/순부채 프레임을 그대로 적용하지 않는다. |
| XOM | Can Exxon fund dividends and buybacks through a lower oil-price cycle without adding debt? | 영업현금흐름에서 설비투자와 배당·자사주매입을 차감하고 유가 하락 민감도를 가정과 함께 제시한다. 현재 유가의 현금흐름을 저유가 국면에 그대로 외삽하지 않는다. |

## Initial operational observation (not a confirmed failure)

Two active runs are admitted. `runLeaseWorkerScheduler` awaits the entire six-poll batch before starting the next batch. During the second run's initial collection, the first run had finished several specialist jobs but its remaining queued jobs did not start until the slow batch member completed. Preserve this observation for the performance improvement plan; do not change scheduling solely to accelerate this audit.

## Quality investigation notes (plan only)

The GOOGL additional-investigation result disputed the Q2 2026 period and replaced it with Q2 2025. Independent primary-source checking supports the original Q2 2026 Search revenue63.271B. The subsequent full browser review confirmed the quality limitation.

Relevant implementation: `followupAndResponseRoundInput.ts::rankedFollowupJobs` passes claim/challenge/falsifier prose and artifact IDs; `FollowupJobPromptSchema` carries neither an explicit snapshot cutoff nor the original primary-source URL/excerpt/period tuple. The prompt forbids reading files, so opaque artifact IDs cannot recover the original evidence. A future quality change should supply compact original source/period/value/unit excerpts and URLs to the follow-up, then require an explicit same-period comparison before substituting a prior-year figure. Native search may add evidence; a search miss must remain unresolved rather than prove the existing source wrong. This is a proposed quality change, not implemented in this audit.

## Confirmed reliability defects and local verification

1. GOOGL completed every model job, then publication returned `chair_content_mismatch`. The accepted V3 brief was460 characters. V3 intentionally preserves full grounded text up to4,000 characters (including its recovery path), but final assembly still applied the legacy360-character brief limit. Assembly now uses the existing V3 limit while retaining sentence, claim and source identity checks. Same accepted production inputs: blocked before, published after, four technical charts saved. A focused test also verifies that missing lineage remains blocked and legacy briefs keep their original limit.
2. MSFT completed every model job, then publication returned `no_grounded_core_answer`. Original semantic verdicts:0 entailed,17 partial,9 not assessable. The source release actually contains FY26 operating cash182,935M and PP&E115,948M, but the1,500-character lexical window omitted the cash-flow table. A numeric-weight regex also matched a literal backslash-d rather than digits. Selection now preserves up to4,000 original characters, locates rounded decimal amounts across common monetary scales, retains nearby financial-table headings/period context as a separately hashed original span, and selects against the same revised claim shown to the auditor. This does not change verdict policy or overwrite old audits. A private copy rewound only downstream audit/chair state, used the real official worker/model, obtained12 entailed/12 partial/2 not assessable, and published with limitations and four charts. Production remains unchanged; existing failed runs whose accepted audit omitted evidence need an audit-stage replay, not repeated assembly against the same stored audit.

Private evidence: `.stocksembly-verification/ten-run-audit/{MSFT,GOOGL}`. Baseline snapshots remain intact. Do not commit those files, request identifiers, account data or credentials.

3. AMD failed before audit after four `memo:company` attempts repeated `specialist_claim_numeric_metric_mismatch`, ultimately `logical_artifact_replacement_exhausted`. The issuer's56% guided margin had no exact registered metric. A corrective prompt alone repeatedly failed to remove it. After a numeric corrective retry, the handler can now omit complete sentences with still-unbound percentages, preserve unchanged remaining observations and citations, mark the affected position uncertain, and append a limitation. If either language would become empty, it retains the original rejection; it never invents substitute facts. The exact last production candidate fails the unchanged validator before and passes after this omission. The focused specialist suite passes27tests, including empty-observation protection. A copied run also completed through the real worker as recorded below; no production verdict was edited.

Quality improvement implementation plan: [research-quality-improvement-plan.md](research-quality-improvement-plan.md). Completed first-pass TSLA report scored4.25/10. Supplemental locally recovered GOOGL3.5/10 andMSFT5.0/10 are not counted as first-pass delivered reports.

AMD local service replay also reached `complete-with-limitations` with all four charts ready. It reused the copied snapshot and retained successful upstream jobs. The model itself removed the disputed percentage in that live replay, so this is distinct from the deterministic saved-candidate replay which directly exercised sentence omission. Both evidence paths are retained privately; neither counts as production first-pass success. Worker TypeScript check passed after these changes. Temporary local UI configuration and publication timestamps used for viewing the MSFT/GOOGL recovery copies were restored; the temporary QA server was stopped.

4. PLTR reproduced the same V3 brief-limit defect with493characters. All29jobs succeeded in production, then `chair_content_mismatch`. The existing length-contract fix published the same accepted payload in a private local replay, with three ready chart frames and a partial310-bar weekly frame. No additional source edit was needed.

5. COIN first failed the same360-character boundary with547characters. Local replay exposed a second blocker, `workflow_v3_canonical_grounding_invalid`: a generated audit limitation retained8.874billion while the public prose validator requires at most2decimal places. `publicationNarrativeRecovery` now applies the existing display-precision normalizer to generated units and separates decision-versus-section limitation IDs. The unchanged raw audit remains evidence; no verdict is upgraded. Same-input replay now publishes. A focused3-test reconciliation suite covers surviving evidence, invented-ID rejection, precision, and distinct generated IDs.
6. COST exhausted a logical artifact's replacement budget. Latest benchmark memo repeats unregistered Treasury yields4.78%/5.24%; risk-policy memo repeats worldwide renewal89.7%. Successful upstream work was not itself defective. The same corrective-retry sentence-omission repair was checked against these actual saved outputs, without increasing the launch budget.

COST saved-candidate replay: both terminally failed memos (`benchmark`, `risk_policy`) pass the unchanged numeric validator after the same sentence omission. Across11 captured rejected memo attempts,10 have recoverable remaining observations; one earlier risk-policy draft still rejects because removing the unbound sentence would empty an observation. This retained failure is intentional, not bypassed. No full COST downstream live replay was run; the matching memo boundary was exercised on actual production outputs.

7. JPM completed all jobs, then failed `chair_content_mismatch` with a368-character V3 brief. The same length-contract fix published the unchanged accepted payload locally with all four chart frames ready. No additional source change was needed. Full browser reading scored the supplemental recovery4.25/10; original production remains N/A/0.

8. LLY failed `followup:company` four times with durable worker retry code `invalid_model_output`, then exhausted that logical artifact's replacement budget. Attempt directories contain tool transcripts but no validated final candidate; the exact malformed field was not retained, so no field-level cause is claimed. A successful transcript followed by absent validated output narrows this to final JSON/schema acceptance. Optional follow-up parse failures already degrade in the round handler, but `CodexRunnerError(output_invalid)` escaped to the required-job repair router. The handler now degrades only this optional output error; authentication, policy, cancellation and required owner responses retain their original routing. Two focused regression checks pass for optional degradation/no invented evidence and authentication remaining a failure. A copied LLY run completed through the real worker with successful upstream results preserved.

The follow-up corrective suite exposed two pre-existing budget-expectation failures. Both were reproduced against an untouched archive of baseline `ac7ae2c`: `followupAllowance(6)` returns3 while the old test expects incomplete; invalid required ballots launch7 while the old test expects5. These tests and production budget limits were not weakened or changed. The new optional-output and authentication tests pass.

LLY local official-worker continuation completed publication with limitations and four ready charts. The live model returned a valid optional response on this replay; the focused typed-error regression separately verifies the original error's new degradation path. Full browser review of this supplemental report scored5.25/10. This is not a production first-pass success.

9. XOM completed all jobs, then failed `chair_content_mismatch` with a473-character V3 brief. The same saved-input publication replay completed after the existing length-contract fix, with all four charts ready. Supplemental full browser quality score6.25/10.

## Final task state

All10 original browser requests reached terminal state:1 published with limitations,9 incomplete. All nine failures have recorded root causes and targeted repairs. Eight local full reports were published and read; COST was checked on its two actual failed memo boundaries without a full downstream rerun. No extra original requests were used to replace failures. Source changes are prepared for PR submission on `codex/ten-run-reliability`; production deployment is not included. All temporary QA servers/configuration and locally adjusted visibility timestamps were restored. Private snapshots, attempt records, and per-report grading notes remain ignored. Final scores and timings: [ten-research-quality-evaluation.md](ten-research-quality-evaluation.md).
