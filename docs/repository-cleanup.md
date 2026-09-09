# Repository organization and legacy review

- Owner: Minsik Chae
- Review date: September 9, 2026
- Baseline: [GitHub main `3aebe39`](https://github.com/wrd1stProgrammer/Stocksembly/tree/3aebe39e0d435f05d4427253163abc5121666872)
- Entry points: [Repository guide](../README.md), [scripts guide](../scripts/README.md), [documentation index](README.md)

## Scope and method

This review compared tracked files with package commands, CI calls, Docker packaging, source/CSS references, and script inputs and outputs. Local-only originals were not described as GitHub content. The expanded navigation guides are written in English; pre-existing historical Korean documents retain their original content.

Classifications used here:

- **Active:** an identifiable source, CSS, package-command, or CI consumer exists.
- **Supporting:** serves a manual development or operational task outside required deployment execution.
- **Historical:** records an earlier design, experiment, or reproduction workflow.
- **Missing inputs:** the tool is tracked, but required source material or baselines are not.

Absence from a static search is not proof that external or manual use is absent.

## Decisions by item

| Item | Evidence and actual purpose | Decision |
| --- | --- | --- |
| `asset_research` | No tracked path by this name; the relevant directory is `assets/research` | Added an explicit source-asset entrypoint with correct naming |
| `assets/research/office-v6-sources` | Direct input to the v6 processor; exported resources remain in compatibility constants and tests | Retain as historical reproduction material |
| `assets/research/office-v7-sources` | Direct processor input; actor/portrait paths are constructed by manifest and report models; CSS references the background | Retain in place as active processing inputs |
| v8/v9 processors | Read untracked v8 pilot and v9 source directories | Mark missing inputs; preserve active exported assets |
| `.agents/skills/react-doctor` | Developer skill with an explanation reference; package command exists, CI does not call it | Retain as an optional coding tool and distinguish it from product research agents |
| `quality-timeseries.ts` usage comment | Referenced a nonexistent package alias, unsupported Node 20 direct-TS invocation, and unavailable design paths | Corrected the comment to the verified Vite bundling route; executable code unchanged |
| `verify-scope-fidelity*` | Requires fixed baseline/anchor files under `.omo/plans`, absent from Git | Label historical and document prerequisites; add a caveat to the old runtime guide |
| `verify-research-quality-plan.mjs` | Binds task/scope/final evidence to historical plan inputs | Document separately from normal quality checks |
| `final-f3-manual-qa.mjs` | Fixed office-v7 scenario on port 4325 | Retain as historical; do not recommend as general smoke coverage |
| Capture scripts | Browser interaction and older presentation scenarios, sometimes including research start | Document effects and unverified current selector compatibility |
| `.artifacts/quality-gates`, `design/concepts`, dated plans | Historical evidence and design references, not established general build inputs | Retain with clear navigation and historical status |

## Evidence entry points

| Question | Source |
| --- | --- |
| Which images are consumed? | [Manifest](../src/research/officeSceneManifest.ts), [mock data](../src/research/mockResearch.ts), [editorial model](../src/research/researchFileEditorialModel.ts), [CSS](../src/styles/research-workspace-v2.css) |
| Which originals are required? | [v6 processor](../scripts/prepare-office-v6-assets.mjs), [v7](../scripts/prepare-office-v7-assets.mjs), [v8](../scripts/prepare-office-v8-pilot-assets.mjs), [v9](../scripts/prepare-office-v9-assets.mjs) |
| Which tools actually run? | [package.json](../package.json), [CI pipeline](../.github/workflows/pipeline.yml) |
| What ships? | [.dockerignore](../.dockerignore), [Dockerfile](../Dockerfile), [standalone packaging](../scripts/prepare-standalone.mjs) |
| Why is scope verification not fresh-clone setup? | [Baseline implementation](../scripts/verify-scope-fidelity-core.mjs) |

## Organization delivered

The root guide maps every tracked root directory and major configuration file. Folder READMEs explain ownership, entrypoints, dependencies, outputs, and maintenance boundaries. Research, report components, and briefing workers have additional source-area guides. The scripts entrypoint accounts for all 38 baseline scripts and tests, including internal modules and historical tools.

No asset, skill, or verifier was deleted or moved. Runtime behavior, dependencies, and deployment configuration are unchanged. Keeping these paths avoids breaking regeneration workflows and manual tooling while making their status explicit.

## Conditions for future removal

1. Retire v6 only after resolving its compatibility constants, tests, and source-reproduction requirements together.
2. Locate and document durable storage for v8/v9 originals before claiming fresh-clone regeneration is supported.
3. Decide whether historical plans and baselines need preservation before removing their verifiers, tests, and references.
4. Retire React Doctor together with its package command and coding-tool configuration if the team no longer uses it.

## Verification boundary

Check local documentation links, folder coverage, script-inventory completeness, English prose, and whitespace. The two newly documented TypeScript audit bundling commands were successfully exercised with Node 20.20.2. The timeseries executable code was compared with the baseline and remains identical.

Database audits, live research generation, production synchronization, image regeneration, and React Doctor fixes are outside this documentation pass and were not executed. Historical evidence is not presented as a current runtime test result.
