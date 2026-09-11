# Design maintenance contract

The current product is an evidence-backed US-equity research workspace. Preserve its working screens, source attribution, accessibility, and report lineage when changing presentation. [PRODUCT.md](PRODUCT.md) defines product scope.

## Current implementation entry points

| Surface | Owning implementation |
| --- | --- |
| Landing experience | `src/components/landing/`, `src/components/LandingExperience.tsx` |
| Research office and progress | `src/components/research/`, `src/research/officeSceneManifest.ts`, `src/research/officeRenderer.ts` |
| Report and department views | `src/components/research/file/`, `src/research/researchFileEditorialModel.ts` |
| Shared visual tokens | `src/styles/`, `app/layout.tsx` |
| Editorial pages | `src/editorial/`, `src/styles/editorial.css` |

Read the relevant source before applying a historical mockup. Version suffixes do not identify unused code: v7 portraits, the v8 scene, v9 actors/entities, and v10 motion-catalog images all have current consumers. See [public assets](public/README.md).

## Requirements to preserve

- Keep evidence, public progress, disagreement and disclosed limitations understandable. Do not expose private model reasoning as animation or transcript.
- Maintain keyboard operation, visible focus, reduced-motion behavior, and equivalent Korean/English controls.
- Research admission overflow shows its real queue position without an invented completion estimate. Dismissal keeps the request queued; cancellation uses the existing command. The modal closes when the request leaves the queue.
- Preserve report claim/source bindings and canonical publication content when changing layout.
- Inspect the affected page with real content and a narrow viewport after changing layout or an asset consumer.

## Historical material

The prior accumulated layout specifications are preserved in [design history](docs/archive/design-history.md). They include superseded visual iterations and should not override current implementation by default.

Concept artwork and the retired v6 asset pipeline were archived before removal; [the cleanup record](docs/repository-cleanup.md) identifies the source revision and restoration procedure. Keep new exploration outside Git until a selected asset has a current consumer and provenance.
