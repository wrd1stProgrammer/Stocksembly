# Source Artwork and Asset Processing

[Repository guide](../README.md)

This directory stores artwork used as input to asset preparation scripts. The tracked baseline contains `research/`, with v6 and v7 source sets. It is excluded from the Docker context and is not a public web URL directory.

## Ownership and flow

Read [research/README.md](research/README.md) for version-specific source and output mappings. A typical change starts with an original PNG here, runs a matching `scripts/prepare-office-*.mjs` tool, and updates generated files under `public/research/`.

## What belongs here

Keep editable/generated source artwork that is needed to reproduce published assets, along with provenance or processing notes. Runtime-ready assets belong in `public/`. Layout concepts belong in `design/`. QA screenshots belong in a deliberate evidence location such as `docs/qa/`.

## Missing inputs

The v8 pilot and v9 preparation scripts refer to source directories absent from the tracked baseline. Existing runtime outputs remain usable, but a fresh clone cannot necessarily recreate them. Do not invent substitute originals or delete the outputs to make the directory versions appear consistent.

## Maintenance

Before moving source artwork, update generator input paths and document where the originals went. Keep original and output changes reviewable. Source files that are not directly consumed by a current script may still explain cropping, transparency or prior generation steps; classify them before deleting them.
