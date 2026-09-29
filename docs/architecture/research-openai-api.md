# Direct OpenAI research

Set `STOCKSEMBLY_RESEARCH_PROVIDER=openai` on both web and worker. Production
Docker images and environment examples select this provider. It uses the OpenAI
Responses endpoint directly with `gpt-6-luna` for collection classification,
research planning, all research rounds, final synthesis, questions and translation.
The existing Codex implementation remains available through an explicit
`STOCKSEMBLY_RESEARCH_PROVIDER=codex` rollback. API failures never invoke it.

Credentials come from `OPENAI_API_KEY`, or the existing API-only JSON file at
`STOCKSEMBLY_CODEX_API_AUTH_PATH`. The latter must be worker-owned, mode 0600,
contain `OPENAI_API_KEY`, and contain no ChatGPT tokens. No subscription login or
Codex executable is needed in API mode. Never place keys in public environment
variables, source control, process arguments, or logs.

API mode admits six active research runs and shares six model-call slots across
all runs and auxiliary jobs. `STOCKSEMBLY_CODEX_API_CONCURRENCY` controls call slots.
Subscription capacity is zero regardless of the legacy API-enabled flag.
Queued work waits for capacity; provider failures go through existing durable
retry handling. Requests have a ten-minute timeout and honor cancellation.

Streaming bytes renew activity. Responses use `store: false`; generated JSON must
pass the existing output schema before acceptance. Audited stages retain web search,
record source URLs, and use the existing public-HTTPS evidence collector for up to
four sources. Unavailable pages are not invented or treated as captured evidence.
Other stages receive no tools. Existing citation validation remains in force.

Migration 006 adds Luna to model constraints and permits research-brief usage
records. Legacy database column names are retained: `cli_version` records
`openai-responses-v1`, and `binary_hash` records the adapter identity hash, not a
Codex executable hash. Token usage and response ID are recorded per attempt.

Roll out the migration and matching application image together. Drain active
research before changing providers; an in-flight attempt's trusted runtime must
not change between generation and commit. Validate one research after deployment.
