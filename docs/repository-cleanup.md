# Repository cleanup and recovery

Reviewed and implemented September 11, 2026, from commit `47b0b22782ddd043abd6b987f4f2e7b5b51d77b5`. GitHub Organization transfer is deferred; repository ownership, permissions, workflows and deployment configuration have not been changed.

## Removed from the current tree

| Collection | Reason | Recovery |
| --- | --- | --- |
| Fifteen PNGs in `design/concepts/` | Unused visual alternatives, not deployed scenes | External archive or source commit |
| v6 source and public PNGs, preparation script and raster-only tests | Retired generation; no current rendering consumer of its asset constant | External archive or source commit |
| `scripts/final-f3-manual-qa.mjs` | Historical fixed-port scenario | External archive or source commit |
| `scripts/verify-scope-fidelity*` and `verify-research-quality-plan.mjs` | Historical plan/baseline tools, not the current CI path; missing fresh-clone inputs | External archive or source commit |
| `.artifacts/quality-gates/` | Old experiment logs | External archive or source commit |

The archive contains 63 files totaling 54,818,189 source bytes (about52.28MiB); use the manifest as the authoritative byte inventory. Each archive member was read back and compared with its original SHA-256 before removal. Existing v6 tests passed before retirement. The mixed V7 wrong-dimension test now uses a synthetic image, preserving rejection coverage without keeping a retired PNG.

Archive name: `retired-assets-and-tools.tar.gz`.
SHA-256: `db1331f217f898932e4b1177c4bc1eff86b8d9a8a84470a8193a7bf858c097b3`.
The maintainer holds the verified local archive outside all worktrees; a shared team asset-store location has not been selected. The tracked [file manifest](archive/retired-files-2026-09-11.json) records every original path, size and hash. The original source commit is also retained in Git history.

## Restore without changing your checkout

The source commit provides a team-accessible recovery path while no shared archive URL exists:

```sh
# Run from a clone containing the source commit. Use a new output location.
git archive --format=tar --output=/tmp/stocksembly-retired-art.tar \
  47b0b22782ddd043abd6b987f4f2e7b5b51d77b5 \
  design/concepts assets/research/office-v6-sources public/research/office-v6
```

Use `git show 47b0b22782ddd043abd6b987f4f2e7b5b51d77b5:path/to/file` to inspect any retired tool, or add its manifest path to `git archive`. Extract into a separate directory; do not overwrite a dirty worktree. Moving files out of the current tree does not erase Git history or automatically reduce old clone object storage.

## Preserved boundaries

- V7 portraits/atlases/background/furniture, V8 scene/briefing art, V9 actors/entities and V10 motion-catalog artwork retain current consumers. Dynamic URLs were considered; version suffixes are not deletion evidence.
- Legacy seat/roster fields remain where active bubble/config code uses them. Only the unused v6 asset constant is removed.
- V7 generation inputs are retained. V8/V9 originals remain absent from Git; existing local originals were not changed. Arrange durable shared storage before claiming full fresh-clone regeneration.
- Product policy, current design entry points, recent research audits, test fixtures, database migrations, React Doctor development guidance, CI, AWS deployment and test-account provisioning remain.
- The accumulated design specifications moved intact to [design history](archive/design-history.md); root [DESIGN.md](../DESIGN.md) now points to current implementation and invariants.
- Personal presentations, local databases, unfinished worktrees and caches were not deleted. The original dirty checkout is preserved. Ignore rules prevent new local captures from being accidentally added; they do not erase existing files.

## Ongoing policy

Use ignored `.artifacts/` for temporary investigations. Promote only sanitized summaries with command, revision, input and limitations to `docs/audits/`. Keep design exploration and presentation binaries outside Git until deliberately selected. Do not use force-add for raw credentials or production database copies.

For another retirement, identify runtime and manual consumers, archive and verify source material, update connected code/tests/docs, then run the affected checks. Deleting currently failing tests to conceal a regression is not cleanup.

## Collaboration and deferred Organization transfer

[CONTRIBUTING.md](../CONTRIBUTING.md) specifies PR-based collaboration. Keep workflow and infrastructure ownership explicit during review. No target Organization or team handles have been selected, so no guessed CODEOWNERS entries or permission changes are introduced.

When transfer resumes, check the actual AWS OIDC trust against the new owner name/ID and repository identity in `infra/aws/stocksembly-cicd.yaml`. Confirm Actions variable/secret access before the first main deployment, and preserve the required `quality` check and main ruleset. Do not change application domains or AWS resources merely because the GitHub owner changes.

The historical document-checker assertion in `src/research/designContract.test.ts` is retired with the checker: it depended on untracked baseline inputs and asserted outdated document values (including unavailable market data). The independent source-backed world, roster, clock, and public-event privacy checks remain. Current workflow contract tests and CI are unchanged.
