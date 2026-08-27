# NVIDIA real-run quality scorecard

- Run: `cd1f5861-7690-4230-bb9e-ffdbb1518ed1`
- Report: `c26db9bf-b3d2-46b9-a12d-5627b8fe921e`
- Report version: `076d69a2-73ba-4b4e-9dde-0d189decb64e`
- Artifact: `b931ec21-e1bc-4568-949d-77c2bd12beba`
- Published: `2026-08-27T10:20:57.219Z`
- Status: `complete_with_limitations`
- Coverage: 27 claims, 38 sources, 20 explicit limitations, 10 anticipated questions

## Observed improvements

- Comparator list contains only `NASDAQ:INTC` and `NASDAQ:FORM`; unrelated SHIP/HAS/T/KEY peers no longer enter the report or valuation median.
- The report does not manufacture downside/base/upside price targets from heuristic earnings multiples.
- The earlier same-period revenue-growth contradiction (about 106% versus about 18%) is absent from the reader-facing conclusion.
- The report contains a direct stance, strongest countercase, decision breaker, dated checkpoints, valuation context, and traceable evidence IDs.
- Physical execution completed after 35 real launches; transient retries no longer produced a phantom 42-call preflight failure.

## Remaining defects found by self-audit

- Reader prose exposed provider precision such as `11.353952`, `17.896220057587453%`, and `66.23710000935347%`.
- Korean-only claim terms could miss matching spans in large evidence artifacts because the semantic window used Latin-only tokenization.
- Several interpretations remain `partial` rather than fully supported; this is acceptable only when the limitation is visible and the claim is not presented as verified fact.

Both concrete defects were fixed after this artifact was published: synthesis now rejects reader-facing values with more than two decimal places, and semantic evidence windows tokenize Unicode and search both English and Korean. Focused regressions cover both paths. A fourth paid generation was intentionally not started because the user capped the iteration at three actual runs.

## Objective score

| Dimension | Score | Note |
|---|---:|---|
| Decision usefulness | 8.4/10 | Direct stance, countercase, breaker, and checkpoints are actionable. |
| Comparator and valuation discipline | 8.5/10 | Absurd peers and invented price ranges are gone; peer set is still narrow. |
| Evidence traceability | 8.1/10 | 38 sources and explicit limitations, but some interpretations remain partial. |
| Editorial clarity | 6.8/10 | Structure is strong; raw decimal precision materially hurts polish in this artifact. |
| Reliability and recovery | 8.3/10 | Real run published after durable prompt and budget fixes. |
| **Overall actual artifact** | **7.9/10** | Paid-useful, but this exact artifact is not honestly above 8 because of precision/polish. |

The code path after the final two regressions is expected to clear 8/10 on the next normal run, but that claim is intentionally not marked as real-run proof.
