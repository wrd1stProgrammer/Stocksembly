# Publication and background catch-up repair

Scope: fix the production NVDA failure and align the office with server progress. Preserve existing work and production runs; reproduce and verify against a local copy before any deployment.

## Evidence

- Deployed commit: `1cacd3cfc66b7b87ea954271deb3486a515ceea9`.
- In the affected NVDA run, all 29 jobs succeeded. Publication failed four times with `chair_primary_claim_missing_from_publication` and ended incomplete.
- The decisive financial claim was audited `partial`, removed by publication eligibility, and still selected by the chair. Retrying the same accepted chair cannot repair this conflict.
- `useOfficePresentation` hides minutes until renderer speech starts. `officeMotion/controller` pauses speech in hidden documents, while the terminal card uses current server status.
- `loadReportAuthority` opens a read-only SQLite connection and passes it to the optional chart writer.

## Work and acceptance

- [x] Reproduce the exact publication failure using an isolated local database/artifact copy. Keep the unmodified snapshot as a baseline.
- [x] Align chair selection, published claims, and final narrative with the same admissible evidence. When the decisive claim is excluded, reconstruct the decision and affected narrative from surviving evidence, preserve limitations/provenance, and never silently attach unrelated evidence to the old conclusion. Keep rejection for absent authenticated evidence.
- [x] Give chart persistence a writable connection at the write boundary and retain idempotent metadata/lineage.
- [x] Catch up minutes and office movement on return/reconnect and terminal states. Keep normal visible live conversations, but do not replay an old backlog after the server advances. Match character placement to the caught-up stage.
- [x] Run focused regression tests and type checks. Publish the copied failing run through the actual persistence/API path; inspect its report and chart. Use a browser to verify hide/return, late events, terminal state, character placement, and normal live dialogue. Do not run broad unrelated tests.

Production retries and deployment are outside this repair PR.

## Implementation results

- Publication reconciles the accepted chair narrative against the exact surviving public claims. A removed decisive claim triggers a new, low-confidence, evidence-limited conclusion; affected prose becomes sourced limitations, and verified findings and concrete re-evaluation conditions remain available. Invented claim identities and absent authenticated evidence still block publication.
- New chair assignments prefer claims with an `entailed` semantic verdict. Chart writes own a writable SQLite connection, including when the authority reader is read-only.
- Durable minutes render immediately. Hidden-tab return, restoration, reconnect, later-stage backlog, and terminal states align both transcript and character placement. Private-event sequence gaps refresh records while preserving newly arriving live speech. Older HTTP responses cannot rewind the current cursor.
- Exact production snapshot: baseline reproduced `chair_primary_claim_missing_from_publication`. The repaired path atomically published the copied run with `complete-with-limitations`; all four chart timeframes persisted. Original audit verdicts were preserved.
- Local API returned HTTP 200, terminal cursor 89, and the published report ID. The browser displayed the report and four charts.
- Browser visibility simulation: independent research at tick 223 → final committee at tick 1541; all five committee participants were seated immediately, no stale bubble or walking backlog. Terminal failure stayed at the latest phase without replay; an external completion refresh replaced its recovery button with the report at tick 1580.
- Visible live speech observed for new continuous event 28 and gap-following event 33, with `speaking` status and one visible bubble. Local staged history was restored; final copied database has no foreign-key violations.
- Focused tests: 109 passed; 4 pre-existing Q&A expectation failures reproduce before this change. Web and research-worker TypeScript checks passed; the actual publication replay bundle built successfully.
- Private replay database/artifacts, scripts, and detailed logs stay ignored under `.stocksembly-verification/publication-catchup/`. No production retry or deployment was performed during verification.
