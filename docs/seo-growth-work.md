# SEO growth fixes — work log

Baseline: origin/main 3537374. Worktree: Stocksembly-seo-growth. Existing dirty checkout preserved.

## Plan

- Completed: full-locale stock hub copy, company identity and honest report-language navigation.
- Completed: scenario-analysis education in eight locales, with consistent calculations, limitations and primary SEC sources.
- Completed: source-language public-report canonical/schema; no false translated alternates. Access controls unchanged.
- Completed: eighty concise editorial search titles, index social images, computed reading time and cross-page footer navigation.
- Completed: build-time analytics ID access and eight-language consent copy; optional tracking remains consent-gated.
- Completed: 69 focused regression tests, production web build (Node 20), changed-file Biome and desktop/mobile browser QA.
- In progress: exact-commit review and PR handoff.

## Runtime evidence

- Production standalone build used a dummy GA ID; runtime omitted that variable. The real Chrome page loaded no Google tag before consent and loaded `G-SEOTEST123` after Accept. This validates configuration retention and the consent gate, not receipt by the production GA property.
- English scenario article: complete search title, self-canonical, seven model rows, source links, author and genuine revision date. Japanese article: translated model; at 390px the table scrolls inside its container without page-wide overflow.
- Database-backed catalog tests cover company-name fallback and seven-day eligibility. Report metadata/sitemap tests cover source-language canonical and eight-locale hubs. An empty local database correctly returns 404 for an absent hub.
- Baseline failures reproduced for footer links, scenario table and eight-locale sitemap expectations before the corresponding corrections. Typecheck and all 69 selected tests pass after changes.
- Build has an existing Turbopack NFT tracing warning from next.config.ts; build succeeds. Biome reports one informational computed-key style suggestion, retained for TypeScript index-signature compatibility.

## After merge and deployment

1. Inspect a representative localized stock page and the improved scenario article in Search Console. Request indexing for genuinely updated public URLs only; do not repeatedly resubmit every URL.
2. Verify the correct production GA stream receives a consenting visit, then measure organic landing → signup → completed research using the existing analytics pipeline. No live property settings or production analytics data were changed here.
3. Track 28-day query/page CTR, impressions and conversions; assess the scenario article and stock hubs separately from site-wide average position.
4. Continue source-backed articles around queries already receiving impressions. Native-language keyword demand and editorial review need human/product input; do not publish translated filler to inflate URL counts.
5. Earn relevant independent mentions and directory listings with consistent brand/domain. No purchased links, account registrations or outreach messages were sent.

Intentional exclusions remain: authenticated PDF 401s, genuinely deleted 404s, and gated/private noindex pages. Existing legal/trust pages support Korean and English; other locale footer links explicitly use the English fallback rather than pretending those pages are translated.

No ranking guarantee, external link purchases, fabricated translations/reviews, auth bypasses or production data mutations are part of this work.
