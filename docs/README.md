# Documentation index

[Repository guide](../README.md)

Use this directory for system explanations, implementation proposals, review records, and visual references. A plan describes intended work at a point in time; it does not by itself establish what the current application implements. Follow linked code and current configuration when those disagree with older prose.

## Start by task

| Task | Entry point | How to use it |
| --- | --- | --- |
| Navigate source and runtime ownership | [Root guide](../README.md), [source guide](../src/README.md) | Find the module before changing it |
| Understand research processing | [System guide](research-system-guide.ko.md), [committee pipeline](full-committee-research-pipeline.ko.md) | Detailed domain references; originally written in Korean |
| Inspect provider coverage | [Research data catalog](research-data-catalog.ko.html) | HTML catalog of research data |
| Diagnose publication and recovery | [Research source guide](../src/research/README.md) | Start with current execution code, then consult historical plans |
| Run a maintenance script | [Scripts guide](../scripts/README.md) | Check prerequisites and side effects first |
| Understand cleanup decisions | [Repository cleanup record](repository-cleanup.md) | Evidence, retention decisions, and missing inputs |
| Work on infrastructure | [Infrastructure guide](../infra/README.md) | Current deployment files and operational runbooks |

## Subdirectories

| Directory | Contents | Status and usage |
| --- | --- | --- |
| [architecture](architecture/) | Research runtime, admin analytics, system diagrams, AWS HTML diagram | Explanations with different review dates; validate against current implementation |
| [reference](reference/) | Project brief and service overview HTML documents | Product and presentation references, not runtime imports |
| [qa/chart-touch-sidebar](qa/chart-touch-sidebar/) | Desktop and mobile screenshots | Evidence of a specific UI review, not a current regression result |

[research-runtime.md](architecture/research-runtime.md) contains historical WorkflowV1 and scope-verification assumptions. Its opening note points to current navigation and explains the missing baseline required by the old verifier. [admin-analytics.md](architecture/admin-analytics.md) covers the administrative analytics area. The system architecture PNG and SVG are dated exports; keep their source explanation and exports together.

## Plans and evaluation records

| Collection | Documents | Interpretation |
| --- | --- | --- |
| Quality improvement | [Improvement plan](research-quality-improvement-plan.md), [upgrade plan](research-quality-upgrade-plan-2026-09-06.md), [upgrade results](research-quality-upgrade-results-2026-09-06.md), [evaluation](research-quality-evaluation-2026-09-06.md) | Historical proposals and measured outcomes; distinguish the two |
| Publication reliability | [Final-stage recovery](research-final-stage-recovery-2026-09-06.md), [committee flow](publication-and-committee-flow-2026-09-06.md), [publication catch-up](research-publication-catchup-plan.md) | Context for earlier failures and fixes; current handlers remain authoritative |
| Technical charts | [Implementation plan](technical-chart-research-plan-2026-09-06.md), [QA record](technical-chart-research-qa-2026-09-06.md) | Feature rationale and evidence from that iteration |
| Ten-report evaluation | [Evaluation plan](ten-research-evaluation-plan.md), [quality evaluation](ten-research-quality-evaluation.md) | A specific research batch, not an ongoing benchmark guarantee |
| Market expansion | [Korean-equity expansion](korean-equity-expansion-plan.ko.md) | Proposal; do not infer full implementation from its existence |
| Office visuals | [Visual contract](office-agent-visual-contract.ko.md), [v8 image prompts](office-v8-pilot-image-prompts.ko.md) | Production references and intended visual behavior |
| UI scenarios | [Smoke scenarios](ui-smoke-scenarios.ko.md) | Human-readable scenarios; executable coverage lives in tests |

## Images and HTML

The root reference PNGs support design comparison. In particular, `lovable-scale-reference.png` is read by the visual-diff script. Do not relocate it without updating that consumer. HTML files are standalone documents; they are not Next routes simply because they describe application features.

## Documentation conventions

- Write new navigation and maintenance guides in English. Existing Korean historical documents keep their original filenames and content in this pass.
- Link to the owning code, configuration, or runbook instead of copying large implementations.
- Date evaluation evidence and state which revision or environment it covers.
- Separate observed results from proposed work and unresolved requirements.
- When archiving a document, update inbound links and retain context needed to interpret past evidence.
- Never place credentials, production database copies, or private run artifacts in a documentation directory.
