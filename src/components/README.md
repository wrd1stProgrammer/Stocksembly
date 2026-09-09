# React Components and Report Surfaces

[Repository guide](../../README.md)

This directory owns rendering and user interaction. It consumes domain/presentation data and server APIs; it should not become a second implementation of research or billing rules.

## Feature map

| Area | Purpose |
| --- | --- |
| `research/` | Live research experience and complete report previews |
| `research/file/` | Report sections, committee/department surfaces, charts and adjacent CSS |
| `researchRoom/` | Research-room and landing-room presentation |
| `home/`, `landing/` | Home and marketing composition |
| `auth/`, `onboarding/` | Authentication and initial account flows |
| `billing/` | Plans and payment-related UI |
| `admin/` | Administrative dashboards and views |
| `briefing/` | Briefing display components |
| `editorial/` | Editorial content presentation |
| `publicInformation/`, `legal/` | Public informational and legal surfaces |
| `analytics/` | Client analytics and consent behavior |
| `seo/` | SEO presentation helpers |
| `ui/` | Shared lower-level UI primitives |

## Report editing entry points

`research/file/CommitteeDecisionCockpit.tsx` composes the committee decision, evidence and valuation sections. `research/file/TechnicalChartResearchPage.tsx` presents technical charts. `research/file/committee-report.css` controls committee-specific layout. Data preparation lives in `src/research`, not in the CSS or JSX.

When a report has missing optional sections, layout must use the actual number of visible items rather than reserve empty columns. Check long content, one-item sections, mobile width, and both report themes. A complete fixture and a reduced report may exercise different layouts.

## Styling and resources

Some styles are colocated; other styles come from `src/styles/`. Inspect both before adding overrides. Character artwork is served from `public/research`, while source PNGs live in `assets/research`. Changing CSS display size does not regenerate source sprites.

## Verification

Use colocated component tests for conditional rendering and interactions. Use a development preview for visual work, then a representative real route when access or loading behavior matters. Do not claim production verification from a fixture-only render. Keep generated screenshots in an evidence directory or a deliberate `docs/qa` record.
