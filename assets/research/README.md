# Research office source assets

[Repository guide](../../README.md) · [Asset tools](../../scripts/README.md#asset-processing) · [Cleanup decisions](../../docs/repository-cleanup.md)

This directory stores production inputs for office illustrations and character sprites. Browsers load the exported files in `public/research`, not these originals. There is no tracked directory named `asset_research`; `assets/research` is the actual path.

## Source and output inventory

| Source | Processor | Output | Status |
| --- | --- | --- | --- |
| [office-v6-sources](office-v6-sources/) | [v6 processor](../../scripts/prepare-office-v6-assets.mjs) | `public/research/office-v6` | Historical office reproduction inputs; retained |
| [office-v7-sources](office-v7-sources/) | [v7 processor](../../scripts/prepare-office-v7-assets.mjs) | `public/research/office-v7` | Inputs for assets still referenced by the application |
| `office-v8-pilot-sources` | [v8 pilot processor](../../scripts/prepare-office-v8-pilot-assets.mjs) | `public/research/office-v8` | Required source directory is not tracked in Git |
| `office-v9-sources` and `office-v8-pilot-sources/entities` | [v9 processor](../../scripts/prepare-office-v9-assets.mjs) | `public/research/office-v9` | Both required source directories are absent from Git |

Alpha images supply transparent processing inputs. Chroma images and other intermediate files preserve production history. A processor reading only a subset of the originals does not establish that the remaining files are disposable.

## Current consumers

- [officeSceneManifest.ts](../../src/research/officeSceneManifest.ts) combines a v8 background, v7 actors, and v9 actors and entities. Version numbers do not indicate an exclusively active generation.
- [mockResearch.ts](../../src/research/mockResearch.ts) and [researchFileEditorialModel.ts](../../src/research/researchFileEditorialModel.ts) construct v7 actor and portrait paths.
- [research-workspace-v2.css](../../src/styles/research-workspace-v2.css) still references the v7 background.
- The v6 `OFFICE_SCENE_ASSETS` constant remains referenced by tests. This review found no non-test importer of that constant; this is not proof that the original production files have no archival value.

## Editing and regeneration

1. Identify the source version and inspect the processor's expected filenames.
2. Make sure every required input exists before running the processor. A fresh clone cannot currently regenerate the v8/v9 outputs using these scripts alone.
3. Run the relevant command from the repository root; processors write or overwrite public assets.
4. Inspect the exported image, transparency, dimensions, and the actual manifest or portrait consumer.
5. Review source and output changes together so the resulting asset can be traced back to its input.

Normal `pnpm build` does not regenerate these assets. Docker excludes `assets` through `.dockerignore`. Moving originals can therefore break regeneration even when the deployed site still renders correctly.

## Cleanup boundary

No originals or exported assets were moved or removed during this documentation pass. Before retiring a generation, resolve its runtime paths, tests, processor input paths, and archival requirements together. Record a durable location for missing v8/v9 inputs before claiming that their generated assets are reproducible.
