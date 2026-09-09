# Public Static Assets

[Repository guide](../README.md)

Files here are served directly from the website root. `public/brand/stocksembly-mark-v2.png` becomes `/brand/stocksembly-mark-v2.png`; `public/research/...` becomes `/research/...`.

## Contents

| Area | Contents | Consumers |
| --- | --- | --- |
| `brand/` | Application icon and brand mark | Shared branding and metadata |
| `editorial/` | Blog and editorial artwork | Editorial pages and cards |
| `research/office-v6/` | Older scene outputs | Legacy manifest constants and tests |
| `research/office-v7/` | Character atlases, portraits, background and furniture | Current presentation models, scene configuration and CSS |
| `research/office-v8/` | Background and pilot resources | Current scene configuration |
| `research/office-v9/` | Newer actors and entities | Current scene configuration |
| `favicon.svg`, `robots.txt` | Browser icon and crawler directives | Browsers/crawlers |

## Source versus output

These are runtime deliverables, not necessarily editable originals. The [source asset guide](../assets/research/README.md) maps generators and missing source directories. Normal `pnpm build` packages public files; it does not rebuild all office artwork.

Some resource URLs are assembled dynamically from role IDs. Search both literal URLs and the code producing them before removing a file. Version numbers do not establish that a directory is unused.

## Change checklist

Verify dimensions, transparent bounds and expected animation frame layout when replacing a sprite. Check portraits separately from atlases. Confirm the relevant manifest and CSS URLs resolve. Inspect the affected page in both themes if the artwork depends on contrast.

Anything committed here can be publicly downloaded after deployment. Keep private source data, credentials, internal run evidence and database snapshots elsewhere. This README is also a public file; it contains only repository-level information.
