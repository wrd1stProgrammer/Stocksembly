# Stocksembly Design System

## 0. Research Log

- Product brief: global users researching US equities; US and Korea are the first marketing markets. This is a production product, not an MVP demo.
- Virtual-office v8 contract: `docs/reference/ai-research-office-project-brief.html` and `docs/reference/ai-research-office-service-overview.html` are the preserved user briefs. The active implementation uses one typed 1374×1145 manifest for an 11-person, four-department office, with architecture and every interaction object kept in separate layers.
- Rollback reference: the older v6/v7 artwork remains intact only as reference material. It is not the active design contract.
- User reference 1: centered headline and a single wide ticker-search console with popular-symbol shortcuts.
- User reference 2: sparse navigation, a full-viewport atmospheric gradient, and one dominant input surface.
- Generated reference: `docs/home-reference.png`; selected because it combines the first reference's search hierarchy with the second reference's cinematic light field while remaining credible for financial research.
- Scale correction reference: the user's Stocksembly capture showed the hero and console reading roughly 1.6–2× larger than the supplied Lovable screen at the same image size. The corrected desktop contract keeps the cinematic atmosphere but adopts Lovable's quieter 64px-class headline, a 720px focal console, 56px controls, and a larger calm gap below the navigation.
- Direction: **Midnight evidence room**. Near-black space is cut by one cobalt horizon that illuminates a graphite research console. The memorable moment is the search field acquiring a precise blue focus rim as the user begins a company investigation.
- Landing-page reference study: Linear contributes the product-as-explanation structure and quiet dark spacing; Stripe contributes immediate value clarity and a compact trust rail; Fiscal.ai contributes auditability language and a visible research pipeline. Stocksembly keeps its own midnight-blue/graphite system, amber evidence signal, bilingual copy, and animated research-office product truth rather than copying any reference brand.
- Report reference PDF: the seven-page Bullstory NVDA report contributes its strong editorial hierarchy, generous white space, firm rules, dense comparison tables, one-page executive summary, and one-subject-per-page rhythm. Stocksembly keeps section numbers subordinate to the analysis and replaces its recommendation score with a transparent team-conclusion index, a separate evidence-reliability measure, team dissent, and source audit. The index summarizes research direction; it is never a BUY/SELL signal, target price, or expected return.
- Report snapshot reference: `/Users/minsikchae/.codex/generated_images/019f986f-c862-7143-859a-819e20625985/call_tCjY5VvvUz2sKbZlYvZ3Nwhg.png` translates the user's earnings-page reference into Stocksembly's ivory, black, cobalt, mint, and amber system. The extracted grammar is an open 60/40 editorial split: substantive narrative on the left, a ruled company-signal register on the right, and one low-height disagreement band instead of nested cards or recommendation gauges.
- Pinterest desktop study: equity-report references favored paper-like reading surfaces, firm horizontal rules, sparse accent color, large numeric callouts, and asymmetric editorial grids; dark finance dashboards favored restrained black panels with one vivid status color. The final Research File combines a dark cover with ivory report sheets so the web file and downloadable PDF share the same reading grammar.

## 1. Principles

1. Evidence before prediction. Copy promises linked evidence and preserved disagreement, never trading instructions.
2. One first action. The ticker field is the only visual focal point above the fold.
3. Global by default. English and Korean have equal information density and stable geometry.
4. Institutional calm. Atmosphere may be cinematic; controls remain precise and restrained.
5. Production states are visible. Empty, populated, no-result, loading, disabled, and keyboard-focus states are designed.

Primary personas:

- Global self-directed investor researching a US company before making an independent decision.
- Korean bilingual investor who needs English issuer context without losing Korean comprehension.
- Time-constrained returning user who reaches a known ticker through keyboard-first interaction.

## 2. Color

| Token | Value | Role |
|---|---:|---|
| `--color-void` | `#03060d` | page background |
| `--color-night` | `#07101f` | blue-black atmospheric layer |
| `--color-panel` | `#0b111d` | search console |
| `--color-panel-raised` | `#101827` | elevated controls |
| `--color-field` | `#050a12` | search input |
| `--color-text` | `#f7f8fb` | primary text |
| `--color-text-muted` | `#a9b4c8` | supporting text |
| `--color-text-subtle` | `#748099` | placeholders and metadata |
| `--color-border` | `#283650` | control and panel rim |
| `--color-border-bright` | `#6f8fd7` | lit panel edge |
| `--color-accent` | `#4268ff` | primary action |
| `--color-accent-bright` | `#6e89ff` | focus and hover |
| `--color-accent-deep` | `#1838d2` | active action |
| `--color-horizon` | `#145cff` | atmospheric band |
| `--color-magenta` | `#b72f86` | low-intensity lower fringe |
| `--color-positive` | `#52d6a0` | valid ticker state |
| `--color-danger` | `#ff7188` | errors |
| `--billing-void` | `#080808` | subscription dialog background |
| `--billing-surface` | `#151515` | pricing surface and toggle base |
| `--billing-card` | `#1b1b1b` | plan card surface |
| `--billing-card-rim` | `#333333` | plan card separation |
| `--billing-accent` | `#6e89ff` | annual savings and featured plan signal |
| `--billing-accent-ink` | `#07101f` | text on the billing accent |
| `--report-paper` | `#f4f1e9` | editorial report canvas |
| `--report-paper-bright` | `#fbfaf6` | raised report sheet |
| `--report-ink` | `#161616` | report text and rules |
| `--report-ink-muted` | `#606066` | report supporting copy |
| `--report-surface-dark` | `#111214` | dark web report canvas |
| `--report-paper-dark` | `#18191b` | dark web report sheet |
| `--report-ink-dark` | `#f3f3ef` | dark web report text |
| `--report-rule-light` | `#d6d6d0` | light report dividers |
| `--report-rule-dark` | `#3b3c3f` | dark report dividers |
| `--report-accent` | `#315bd6` | report navigation, section markers, and primary conclusions |
| `--report-accent-soft` | `#e8edfc` | light report table headers and selected rows |
| `--report-accent-dark` | `#91a8ff` | dark report links, labels, and section markers |
| `--report-accent-soft-dark` | `#252d49` | dark report tinted surfaces |
| `--report-positive` | `#24765c` | supported evidence and affirmative votes |
| `--report-warning` | `#a46518` | qualified evidence and reservations |

Accent is reserved for actions, focus, and truthful state. Decorative light uses horizon and magenta tokens at low opacity.

## 3. Typography

- Display/body: `Inter`, `Pretendard`, system sans-serif. Inter carries the global interface; Pretendard gives Korean matching weight and width.
- Mono: `ui-monospace`, `SFMono-Regular`, monospace for tickers only.

| Token | Size | Weight | Line height | Use |
|---|---:|---:|---:|---|
| `--type-display` | `clamp(2.5rem, 3.5vw, 4rem)` | 720 | 1 | hero |
| `--type-lead` | `clamp(0.9375rem, 1.2vw, 1.125rem)` | 450 | 1.55 | hero support |
| `--type-title` | `1.25rem` | 680 | 1.25 | component title |
| `--type-body` | `1rem` | 450 | 1.6 | controls/body |
| `--type-label` | `0.875rem` | 650 | 1.4 | nav and metadata |
| `--type-ticker` | `0.8125rem` | 720 | 1 | ticker chips |
| `--type-overlay` | `0.75rem` | 680 | 1.2 | compact product-preview states |

Hero copy stays within two lines at 375px and one line where the locale permits on desktop. Body text never falls below 14px.

## 4. Spacing & Layout

Base unit: 4px.

`--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`, `--space-6: 24px`, `--space-8: 32px`, `--space-10: 40px`, `--space-12: 48px`, `--space-16: 64px`, `--space-20: 80px`.

- Header max width: 1544px; focal search console max width: 720px.
- Page gutters: `clamp(16px, 4vw, 48px)`.
- Landing content max width: 1280px. The page stays intentionally short: hero, live office, compact research-coverage proof, then footer.
- Desktop hero begins lower than the navigation, using a 160–184px opening gap at laptop/desktop heights. The compact console uses 56px controls and a 172px action while retaining ticker shortcuts and status context absent from the simpler Lovable composer.
- Desktop search console is an input/action sidebar layout. At 768px and below it becomes a vertical stack. At 375px ticker shortcuts scroll only within their own row; primary content never scrolls horizontally.

## 5. Components

### Wordmark

- Structure: abstract split-circle mark plus text label.
- States: default, link hover, keyboard focus.
- Accessibility: readable text remains visible; mark is decorative.

### Language Toggle

- Structure: two native buttons in a grouped control.
- States: default, selected, hover, active, focus.
- Accessibility: `aria-label` on the group and `aria-pressed` on each button.
- Motion: 140ms opacity/transform only.

### Ticker Chip

- Structure: button containing an uppercase US ticker.
- States: default, hover, active, focus, selected.
- Accessibility: visible focus and 44px minimum touch target on mobile.

### Search Field

- Structure: compact visible field label and native search input for a US company or ticker.
- States: empty, populated, focus, no-result, disabled.
- Accessibility: persistent screen-reader label, descriptive error, Escape clears.
- Motion: 220ms rim opacity and glow filter.

### Research Question Field

- Structure: compact visible field label and native textarea for the issue the agents should investigate.
- States: empty, populated, focus, disabled.
- Accessibility: the visible label owns the textarea; the prompt remains optional so ticker-only research still works.
- Boundary: the field shows a live character count and accepts at most 100 Unicode characters; empty, punctuation-only, repeated-character, or over-limit input is ignored by the server and broad research continues.
- Layout: it shares the console's primary row with the company field on desktop and moves below it on mobile.

### Research Button

- Structure: label plus arrow icon.
- States: default, hover, active, focus, disabled, loading.
- Accessibility: native button, `aria-busy` while loading.
- Motion: 140ms transform/opacity; glow follows state without layout animation.

### Search Console

- Structure: form containing Company/Ticker Field, Research Question Field, Research Button, popular Ticker Chips, and a company result region.
- Variants: product, showcase.
- States: empty, populated match list, no-result, submitting.
- Surface: mixed depth: tonal layers, one cool rim, restrained shadow, and top sheen.
- Layout: one divided two-field composer row on desktop; the two fields stack inside the same uninterrupted surface on mobile. No nested decorative cards.
- Result slot: a detached, scrollable list opens directly below the console. Each compact row aligns ticker, company/sector, and exchange metadata; the open slot overlays the live office instead of changing page layout or being painted beneath later hero content.

### Product Proof Rail

- A compact source-coverage rail follows the hero and names evidence classes, not partner endorsements.
- Motion is a single slow transform-only ledger drift that communicates continuous evidence intake and stops under reduced motion.
- The public landing page ends after this rail and hands directly to the footer. Detailed debate and Research File explanations live inside the product instead of extending the acquisition page.

### Research File

- The completed report is one editorial document with a cover and four numbered subjects: decision brief, evidence analysis, valuation scenarios, and agent debate with final judgment.
- The web document offers light and dark reading themes. The downloadable PDF is light only so page breaks, contrast, and printing remain deterministic.
- Section numbers use `--research-type-report-number` and never compete with section titles. Horizontal rules and aligned columns provide hierarchy; decorative gauges, red recommendation color, floating card grids, and a standalone sources chapter are prohibited. The cover may use one large 0–100 team-conclusion number when its 40/35/25 formula and separate evidence reliability are disclosed in text.
- Cobalt is the report's editorial accent, mint marks supported evidence, and amber marks qualified or unresolved evidence. These colors identify meaning on both themes; large reading surfaces remain paper or charcoal and never become full-color cards.
- The decision brief contains substantive market expectations, embedded expectations, team judgment, disagreement, and falsification conditions. Provider-coverage diagnostics are not shown in the brief.
- The thesis ledger uses three readable columns: thesis, team judgment, and evidence plus counterpoint plus next verification. Empty-link boilerplate and repeated unavailable-state sentences are prohibited.
- Independent team views expose named column headers for the team/vote, conclusion, and rationale. A vulnerability field renders only when a real vulnerability exists.
- Reader-facing source labels name the underlying filing authority, exchange dataset, or public-news publishers. API marketplaces, internal audit artifacts, request ledgers, and department workflow artifacts never appear as evidence publishers.
- User question, direct answer, market view, agent view, counterargument, decision checkpoint, and claim/source references remain visually distinct. Raw source facts are never presented as agent conclusions.
- Every PDF subject starts on its own page. Evidence and methodology appear as a compact register inside the final subject rather than a fifth major chapter.
- Desktop is the primary reading surface. Narrow screens stack the same semantic rows without adding mobile-only interactions or decorative variants.

### Research Workspace Rails

- Structure: left navigation, central research document, and right transcript/chat rail share one uninterrupted dark workspace. Panel separation uses tonal contrast and the shell gap only; bright outer borders and white corner rims are prohibited. Each rail retains the shared medium shell radius so the workspace remains soft without restoring a visible outline.
- Left navigation: a top-right icon collapses the rail to a compact 52px control strip and restores it without changing the report or right-panel state. The footer keeps feedback and profile actions at the bottom; the compact state preserves their icons and accessible labels.
- Mobile home shell: at the mobile breakpoint the signed-in navigation becomes a full-width top bar. A first-visit mobile session starts collapsed with the app mark/name centered beside a left-side expand control; expanding reveals a left-side drawer over the page with a backdrop. The desktop rail keeps its existing width transition and placement.
- Right navigation: the existing transcript/chat toggle remains independent from the left rail so readers can choose any left/right panel combination.
- Active research state: the right rail keeps the same transcript/chat header and collapse control used by the published report. Transcript remains available and live; Chat stays visibly disabled with an explanatory accessible label until the report is published.
- Live conversation projection: up to three distinct, current-stage transcript speakers may show simultaneous bubbles. Bubble placement must remain collision-free; collaborative-event participants orient toward one another while the durable workflow continues to own movement timing and parallel execution.
- Responsive state: desktop owns independent left and right rail controls. Existing tablet/mobile stacking remains authoritative and may hide the left rail when the right rail occupies the available width.

### Subscription Management Modal

- Structure: the signed-in sidebar profile action opens one centered, compact dialog over the current workspace. The desktop panel is capped at 1000px wide and 700px tall; non-subscribers see three Free/Pro/Ultra cards and subscribers see the same plan surface as a management entry point.
- Surface: black backdrop, charcoal `#151515` shell, and glossy `#1b1b1b` cards derived from the supplied pricing-grid reference. The featured Pro card uses one restrained cobalt-blue accent sleeve and a solid light CTA; there is no decorative gradient or extra status panel.
- Card primitive: `PricingCard` keeps one shared billing toggle at grid level and gives each plan a compact nested pricing panel, truthful annual total, annual savings chip, credit allowance row, ruled feature heading, and stable CTA. All three cards use the existing `BorderBeam` wrapper while preserving the same Stocksembly tokens.
- Header: the modal keeps only the page title and close action, followed immediately by the remaining-credit meter. Promotional eyebrow, duplicate membership copy, sandbox label, and status sentence are intentionally omitted from the visual header.
- Credit meter: a compact remaining-credit value, used percentage, and single horizontal progress bar sit above the plan controls. The default visual value is replaceable by a billing/usage response when that endpoint exists.
- Credit allocation: Free shows a daily 3-credit allowance; Pro shows 100 credits per month; Ultra shows 500 credits per month. The allowance is a visible value row on each card, while the feature list explains the outcome of the plan.
- Usage policy: selecting research options never consumes credits; full-agent research consumes 10 credits after successful completion, department-agent research consumes 5 credits after successful completion, every 100 chat messages consumes 10 credits, and opening a research-room report consumes 3 credits. Chat message counts are server-side and failed research does not consume credits.
- Plan copy: Free communicates delayed research access; Pro communicates selectable research options, unlimited research-room access, and daily briefings for three watchlist names; Ultra communicates ten-name daily briefings and early access to new features.
- State: annual billing is selected initially, with the effective monthly equivalent shown alongside the truthful annual amount and an explicit “billed yearly” note. Monthly selection swaps the displayed amount and Whop checkout URL without changing card order.
- Integration: free is a local access state; paid cards receive sanitized plan data and checkout URLs from `/api/billing/plans`. Whop secrets remain server-only so the sandbox-to-production switch is environment configuration, not client code.
- Scroll ownership: only the inner pricing panel scrolls. Its scrollbar is hidden at rest and becomes visible briefly while the user scrolls or the panel receives focus; the page behind the dialog never scrolls.
- Credit activity: the bottom of the same scroll surface contains a sparse, border-led ledger of the ten most recent grants and debits. Grants use the cobalt billing accent; usage remains neutral so the sign and amount carry the meaning. Entries come from the account database, not fixture copy.
- Accessibility: native dialog semantics, labelled heading, Escape and backdrop close, focus-visible close control, a labelled progressbar, and a polite status region for unavailable pricing. Reduced motion removes panel/card movement while preserving the open state.

### Company Key Metrics Register

- Structure: a ruled two-column register inside the decision brief. Each row pairs one truthful company signal with a compact interpretation drawn from the report's existing market, company, financial, risk, or next-event evidence.
- Required rows: observed price, business/demand signal, profitability signal, market/technical state, downside buffer, and next verification. Current price is mandatory for a publishable stock report; exhausted provider retries terminate the run before a report is sealed. Qualitative evidence is never converted into invented company metrics.
- Visual language: open table geometry, square edges, firm black rules, one ink color for all row values, and a restrained cobalt marker for scan order. Semantic mint and amber remain available elsewhere but never turn this register into rainbow text. No percentage recommendation bar, radial gauge, or nested card.
- Responsive state: the register sits beside the core debate on desktop and stacks below it at narrow widths without horizontal scrolling.

### Hero Ambient Office

- Sits directly below the home research composer at a restrained 820px maximum width, so the multi-agent product mechanism is visible before the first scroll without replacing the search action as the focal point.
- Reuses the production v8 office world, furniture, seats, and complete 11-agent roster. Agents independently alternate between seated work, short room-scale walks, a brief standing pause, and a return to their assigned seat.
- Actor labels and speech bubbles are suppressed in this ambient variant. A compact localized live-status rail is the only overlay; detailed activity remains in the main research workspace.
- The animation pauses when offscreen and resolves to the seated state under reduced motion.

### Site Footer

- Brand purpose, product/search destinations, evidence disclaimer, and locale status only. No dead methodology or legal links are shown before their routes exist.

## 6. Motion & Interaction

### Prism reveal text

- Purpose: the final semantic word in the home hero materializes once on entry, making the product promise land without adding continuous decorative motion.
- Primitive: `PrismRevealText` clips a 300%-wide gradient to the glyphs. Its reveal edge uses the existing accent story as a five-stop refraction band before settling to `--color-text`.
- Tokens: `--prism-coral`, `--prism-amber`, `--prism-mint`, `--prism-lavender`, `--prism-blue`, and `--motion-prism-reveal` define the band and sweep timing.
- Accessibility: the text remains ordinary DOM text; reduced-motion renders the final ink state immediately. The animation never repeats and does not affect layout.

### Gradient party research button

- Purpose: the primary home research action reveals a controlled field of blue, lavender, mint, and white light on hover/focus, signaling that the workspace is ready to launch.
- Primitive anatomy: an inset night surface sits above six blurred light blobs; label and arrow remain on the top content layer. The disabled state suppresses the light field and retains clear muted affordance.
- Motion: light blobs move with transform and opacity only while the enabled action is hovered or keyboard-focused. Reduced-motion reveals a static gradient field.
- Tokens: the party field reuses the named prism palette and existing text/accent colors instead of introducing page-local colors.

### Search border beam

- The home search console uses the reference's `Line / Mono / 61%` treatment: one restrained white line travels around a neutral graphite perimeter without washing over the inner surface.
- The beam is clipped to the border with a mask, remains pointer-transparent, and never changes the console geometry or search interaction. Reduced-motion keeps a static illuminated edge.
- Motion uses `--motion-border-beam`; the beam is intentionally colorless so it does not compete with the product's blue actions.

### Home research composer

- The home search surface follows a compact prompt-composer grammar: one uninterrupted graphite shell, a borderless input zone, an unlabeled ticker shortcut row, and a circular submit action anchored at the lower right.
- The composer hugs the ticker row with a 10px lower inset instead of preserving an empty minimum-height reserve. The desktop submit control is a compact 40px circle aligned slightly above the ticker baseline; mobile retains a practical 40px target inside the same tightened shell.
- Ticker shortcuts remain functional as a compact left-aligned row without a visible section label. Default helper copy, invalid-result copy, the decorative leading plus, and the inline clear control are omitted; Escape still clears the query.
- The Mono Line border beam and Gradient Party submit treatment remain the two signature effects; the larger shell does not introduce another competing animation.

### Consultation activity wave

- `Thinking...` and `Searching...` render as ordinary accessible status text split into visual character spans. Characters rise by 2px while opacity travels from 0.3 to 1 and back over 1.5 seconds with a 90ms stagger.
- `Thinking...` is reserved for report-grounded composition; `Searching...` appears only while API or web evidence is being gathered.
- A 24px state orb precedes the character wave: `solving` for composition and `searching` for external lookup. The orb and text form one compact status line.
- The wave animates transform and opacity only. Reduced-motion users receive stable full-opacity text without vertical movement.

### Subscription modal transition

- The overlay fades in and the centered panel rises by a small distance; the featured card's accent sleeve rises on hover to carry the supplied component's signature depth.
- The billing toggle uses a spring-loaded light thumb and annual savings chip. Price changes use a masked blur-roll; plan-card hover only changes rim/transform and does not change layout.
- All three plan cards use the installed `BorderBeam` primitive with its restrained ocean palette; the effect stays pointer-transparent, follows the existing card rim, and respects reduced motion.
- The close action, billing toggle, and checkout buttons retain the standard 140–220ms motion tokens. Reduced motion snaps the overlay, thumb, price roll, and card sleeve to their settled states.

- Micro: 140ms ease-out for buttons, chips, and language selection.
- Standard: 220ms ease-in-out for results.
- Emphasis: 520ms cubic-bezier(0.16, 1, 0.3, 1) for initial hero reveal.
- Only `transform`, `opacity`, and `filter` animate.
- `prefers-reduced-motion: reduce` removes reveal and movement while preserving state changes.
- Landing motion is limited to one evidence-ledger drift and the hero office status pulse. Offscreen sections do not depend on animation to become visible.
- The hero ambient office uses interpolated actor translation on the existing office grid. Routes and seating change state at fixed steps; rendering remains transform-based and pauses outside the viewport.

## 7. Depth & Surface

Strategy: mixed, constrained to focal task surfaces.

- Atmosphere: near-black base, faint magenta lower fringe, grid mask, vignette, and fine grain. The former elongated cobalt horizon behind the search composer is intentionally removed.
- Console: graphite tint, subtle backdrop blur, cool 1px rim, inset sheen, blue reflected light below the input, and one broad soft shadow.
- Subscription modal: black backdrop, charcoal shell, glossy charcoal cards, a single cobalt-blue billing accent, and restrained tinted shadow; pricing cards are tonal subdivisions inside that panel rather than separate floating windows.
- Other elements use borders and tonal shift only. No competing floating glass cards.

## 8. Accessibility Constraints & Accepted Debt

- Target WCAG 2.2 AA: 4.5:1 body contrast, 3:1 large text and component boundaries.
- All interactions are keyboard reachable with a visible 3px focus treatment.
- Form outcomes use `aria-live`; color never carries the result alone.
- English/Korean switching changes `document.documentElement.lang`.
- Reduced motion is respected; browser zoom and 200% text remain usable.
- The semantic DOM transcript is the authoritative accessible projection when Canvas is unavailable.
- Every public event has a stable bilingual ID; locale changes never change ordering, counts, or ownership.
- Publication focus moves to the Research File heading only when no form control owns focus; cancellation, failure, and recovery remain announced in a polite live region.
- No accessibility debt is accepted for the live-research contract.

## 9. Production Architecture

- Framework: Next.js App Router with React Server Components by default.
- `app/layout.tsx` owns static metadata, viewport configuration, global CSS, local Inter through `next/font/local`, and unicode-ranged Pretendard subsets so English users never download the full Korean font payload.
- `app/page.tsx` stays a Server Component and renders one client island for locale switching and ticker-search interactions.
- `/showcase` is a dedicated App Router page; product routing is never inferred from `window.location`.
- Development inspection tools remain development-only and are excluded from production bundles.
- Production research is a loopback local service: a Next web projection process reads commands and projections, while a separate long-lived Node worker owns collection, Codex launches, durable jobs, and recovery.
- SQLite WAL stores run, job, lease, snapshot, event, and report metadata. Immutable filesystem SHA-256 CAS blobs store raw/normalized evidence and accepted role/report artifacts; a content hash is the artifact identity.
- Route handlers validate bounded commands and read projections only. They never execute research, fetch sources, launch Codex, or publish directly.
- The worker reaches official SEC, BLS, and Treasury adapters through narrow ports, and reaches the isolated Codex CLI through a server-only port. Licensed market and consensus adapters remain explicit unavailable capabilities until rights are provisioned.
- Clients bootstrap from a durable snapshot and resume public events through replayable SSE. Pixi receives the same committed public events as the semantic DOM transcript; it never becomes a second clock or source of truth.

<!-- stocksembly:live-research-contract:v1 -->
```json
{
  "schema": "stocksembly.live-research.v1",
  "world": { "width": 1374, "height": 1145, "camera": "overview", "activeFollow": false, "aspectRatio": "1374:1145" },
  "clock": { "tickMs": 50, "owner": "officeChoreographyV7Contract", "secondClock": false },
  "roster": { "specialistIds": ["market", "market_news", "benchmark", "company", "company_product", "company_competition", "financial", "valuation", "financial_quality", "risk", "risk_policy"], "chairId": "chair", "count": 12 },
  "production": { "mockOnly": false, "camera": "overview", "activeFollow": false, "worldAspectRatio": "1374:1145" },
  "transcriptGroups": [
    { "id": "briefing", "beatIds": ["briefing"] },
    { "id": "evidence-collection", "beatIds": ["parallel-work"] },
    { "id": "department-analysis", "beatIds": ["department-talk"] },
    { "id": "cross-team-challenge", "beatIds": ["visit-wave-a", "return-a", "visit-wave-b"] },
    { "id": "evidence-audit", "beatIds": ["return-b"] },
    { "id": "gathering", "beatIds": ["representative-gathering"] },
    { "id": "committee", "beatIds": ["forum"] },
    { "id": "complete", "beatIds": ["complete"] }
  ],
  "beatRanges": { "briefing": { "startTick": 0, "endTick": 39 }, "parallel-work": { "startTick": 40, "endTick": 239 }, "department-talk": { "startTick": 240, "endTick": 359 }, "visit-wave-a": { "startTick": 360, "endTick": 639 }, "return-a": { "startTick": 640, "endTick": 719 }, "visit-wave-b": { "startTick": 720, "endTick": 999 }, "return-b": { "startTick": 1000, "endTick": 1079 }, "representative-gathering": { "startTick": 1080, "endTick": 1299 }, "forum": { "startTick": 1300, "endTick": 1579 }, "complete": { "startTick": 1580, "endTick": 1580 } },
  "eventGroupMap": { "run_created": "briefing", "collection_started": "briefing", "evidence_cutoff_recorded": "briefing", "snapshot_sealed": "briefing", "mandate_sealed": "briefing", "specialist_memo_committed": "evidence-collection", "department_consolidation_committed": "department-analysis", "challenge_committed": "cross-team-challenge", "followup_committed": "cross-team-challenge", "owner_response_committed": "cross-team-challenge", "structural_audit_completed": "evidence-audit", "semantic_audit_committed": "evidence-audit", "gathering_started": "gathering", "department_ballot_committed": "committee", "chair_synthesis_committed": "committee", "report_published": "complete" },
  "legacyEventGroupMap": { "mandate": "briefing", "progress": "evidence-collection", "checkpoint": "department-analysis", "handoff": "cross-team-challenge", "summary": ["cross-team-challenge", "evidence-audit"], "gathering": "gathering", "presentation": "committee", "synthesis": "committee", "complete": "complete" },
  "lifecycleStates": ["created", "admitted", "collecting", "snapshot_sealed", "mandate_sealed", "running", "auditing", "publishing", "published", "limited", "incomplete", "failed", "cancelled"],
  "recoveryStates": ["paused", "draining", "quiesced", "recovering", "requeued", "retry_child", "follow_up_child", "sse_reconnecting"],
  "publicationStates": ["pending", "complete", "complete_with_limitations", "incomplete"],
  "allAgentTruth": { "specialistIds": ["market", "market_news", "benchmark", "company", "company_product", "company_competition", "financial", "valuation", "financial_quality", "risk", "risk_policy"], "chairId": "chair", "acceptedArtifacts": 12, "privateReasoning": false },
  "capabilities": { "currentMarketData": "available_when_alpaca_credentials_are_configured", "consensus": "unavailable", "professionalNews": "unavailable", "options": "unavailable", "shortInterest": "unavailable" },
  "identityParity": { "stableIds": true, "rosterCount": 11, "locales": ["en", "ko"], "equalGroupCount": true },
  "accessibility": { "domProjection": true, "canvasDecorative": true, "reducedMotion": true, "zoom200": true, "localeParity": true },
  "reportIA": ["identity-and-data-posture", "ten-second-brief", "version-delta", "supported-analysis", "operational-scenarios", "dissent-and-unknowns", "change-conditions", "audit-denominators", "claim-register", "source-library", "methodology", "disclaimer"],
  "architectureDoc": "docs/architecture/research-runtime.md"
}
```

## 10. Research Room

Visual contracts: the two preserved HTML briefs in `docs/reference/`, `docs/research-room-reference.png`, and the user's Bullstory dashboard capture. The surrounding interface is an almost-black operational dashboard (`#0c0c0e` canvas, `#121214` panels, `#1d1d20` raised controls) with thin neutral rims and a restrained amber status accent. Blue is confined to office monitors and source links. The office shows public actions, evidence transfers, disagreements, and status summaries only; private model reasoning is never displayed.

Research-room personas:

- A time-constrained investor who must understand which department produced each claim and where representatives disagree.
- A Korean bilingual investor who needs names, roles, statuses, and evidence summaries to retain equal information in Korean and English.
- A keyboard or reduced-motion user who needs the same timeline, final ownership, and report outcome without depending on spatial animation.

### Layout and scroll ownership

- Desktop at `>=1280px` is a command-bar-free three-pane shell: `280px minmax(0, 1fr) minmax(340px, 390px)`. A restrained 8px canvas gutter and a one-pixel neutral rim make each pane read as an independent workspace surface without turning the layout into floating cards.
- The shell is bounded by `100dvh`. The left navigation and right meeting minutes own independent vertical scrolling. The central office owns no document scroll and uses all remaining block space below its single-line room heading.
- The live office is always shown as a stable, full-world overview at its authored `1374:1145` ratio. The central workbench may scroll vertically when the viewport is shorter than the authored world plus its research desk; the renderer never squeezes that world into a wider frame, introduces black letterboxing, auto-focuses, pans, or zooms during playback.
- From `768px` through `1279px`, the shell becomes a two-column layout: the left navigation remains a compact rail while the room and meeting minutes stack in the main track without horizontal page overflow.
- Below `768px`, navigation, room, and minutes reflow into one document column. No fixed pane may force two-dimensional scrolling.
- At `390px`, the fixed overview remains stable with 64px world padding. A persistent bilingual Overview toggle exposes `aria-pressed`; it changes semantic emphasis only and never activates an actor-follow camera.
- Mobile preserves the authored near-square `1374:1145` world ratio. The named camera viewport and semantic department/activity representation carry equivalent information at every breakpoint.

### Research-room semantic tokens

- Surfaces: `--research-bg`, `--research-bg-deep`, `--research-surface`, `--research-surface-raised`, and `--research-surface-soft` follow the near-black Bullstory hierarchy. Panels are separated by tone and a one-pixel neutral border, not blue glow.
- Structure: `--research-line`, `--research-line-soft`, and `--research-line-strong`.
- Meaning: `--research-accent` and `--research-warning` use amber for live work and focus; `--research-blue` is secondary evidence/link color; positive and negative remain market-semantic only.
- Type: `--research-type-label` (12px), `--research-type-body` (14px), `--research-type-title`, `--research-type-company`, and responsive report display tokens. Research styles never set a literal font size.
- Recurrent geometry uses `--research-space-*`, `--research-radius-*`, and `--research-shadow-*`. Component-specific tracks, fixed viewport dimensions, and pixel-art coordinates remain local because they are not reusable design decisions.
- The complete runtime values live in `src/styles/tokens.css`; this document names their semantic responsibilities instead of duplicating values.

### Research-room primitives

- `ResearchSidebar` uses a documentation-tree navigation grammar: quiet section separators, controlled collapsible company groups, dashed child guides, a coral active rail for the live run, and softly lifted hover rows. The tree preserves the existing conversation controls.
- Tree hierarchy is communicated by indentation, guide lines, and text in addition to color. The live analysis uses `aria-current="page"`; carets rotate with the disclosure state and stop animating under reduced motion.

#### Research Navigation

- The left pane starts with the Stocksembly identity and a stock snapshot containing ticker, company name, and explicit data-capability posture. Locale is fixed for the opened research result, so this pane does not repeat a language control; no current-price field is rendered without a licensed provider.
- Completed-report navigation omits the former specialist-question composer so the rail stays focused on company identity and analysis history.
- Analysis history uses the issuer's stock logo when the symbol image is available and falls back to the ticker initial when it is not; a missing third-party image never breaks navigation.
- Analysis history is grouped by ticker. Repeated runs appear as nested slots inside an expandable native `details` disclosure, with the active run explicitly identified in text.

#### Meeting Minutes

- The right pane is a restrained transcript, not an operational ledger: one title, one debate-status line, then avatar/name/role/summary/body entries.
- During research, source links, source-state badges, participant footers, tabs, progress percentages, and colored left rails are prohibited in this surface.
- Publication opens the right pane automatically. Its only disclosure control lives in the pane header; collapsing it leaves a narrow control rail so the report never needs a duplicate toolbar icon.
- After completion only, the pane header gains a low-profile two-option segmented control: `회의록 / 채팅` (`Meeting log / Chat`) with no completion dot or divider. This is a mode change between the preserved audit trail and report-grounded consultation, not a return to the former Activity/Debate/Sources ledger.
- `Chat` begins directly with its message field; it does not repeat a title or icon below the pane-level `회의록 / 채팅` control. It targets one named specialist at a time. Visible agent labels use names only while the fixed roster slots and hidden role context remain intact. The composer is one compact uninterrupted rounded surface with a two-line question area, a name-only agent selector, an optional advanced-reasoning mode, and a circular send action. Advanced reasoning routes only that question to `gpt-5.6-sol` with light reasoning; the default remains the faster consultation runtime. The official `border-beam` `md / mono / 0.99` primitive marks the active input perimeter without changing its geometry. It remains fixed below the independently scrolling message history. One failed answer may be retried once, while transient status reads continue polling instead of immediately replacing the response with an error.
- The completed report owns its vertical scroll surface. Its narrow thumb overlays the report edge, stays transparent at rest, and appears only on hover or keyboard focus; the dark workbench does not reserve a separate right gutter.
- `--research-radius-composer` owns the chat composer's larger continuous shell radius; nested controls stay borderless so the surface reads as one input rather than stacked cards.
- The empty state introduces the selected specialist and offers concise starter questions about counterarguments, assumptions, and judgment-change conditions. Report interpretation stays inside the published file and shows a visual 24px `ThinkingOrb` in its slower `solving` state beside `Thinking...`. Questions asking for current prices, current market state, news, or announcements switch to the orb's `searching` state and `Searching...`; live market fields use the licensed quote API first, while audited web search opens only for current facts or gaps that API and report evidence cannot answer. Completed text appears through a fast glyph reveal with a temporary caret, while reduced motion renders it immediately. Replies identify the specialist and expose only the smallest set of published claims and captured external sources actually used in that exact answer; private model reasoning and chain-of-thought are never exposed.
- A normal question never restarts analysis. `Start follow-up research` is a visually secondary, explicitly separate action that appends a new version to the same Research File and returns the office to its live state.

#### Pixel Office Game

- The central room is a dedicated PixiJS v8 client renderer of pure simulator snapshots; semantic React/DOM remains the accessible product surface.
- The production `PixelOfficeGame` component is the lifecycle bridge only. It passes immutable playback snapshots into `createOfficeSnapshotRenderer`; it never authors percentage positions, alternate seat coordinates, CSS sprite movement, or a second behavioral clock.
- Simulation, navigation, furniture, actors, labels, and bubbles share the manifest's single `1374×1145` world space. DOM percentage maps and composite furniture placement are retired from the product path.
- Its visible heading contains only the localized `LIVE RESEARCH ROOM` label. Phase names, focus pills, progress percentages, objective overlays, footer progress, and result controls are not part of the room frame.
- Product playback uses the fixed overview camera only. Focus and activity-follow cameras remain renderer tooling for calibration, not user-facing research-room behavior.
- Logical world: `1374×1145`, `43×35` cells at `32px`, full-bleed near-square. The canvas uses up to 2× device-pixel density with linear sampling for the painted office and character atlas, one fixed `0.46` actor scale, fixed feet pivots, and feet-y depth.
- `src/research/officeSceneManifest.ts` is the only owner of roster IDs, departments, rooms, doors, seats, talk anchors, visitor anchors, and standing-forum anchors. `AgentId` is inferred from that roster.
- The base raster contains architecture only: no people, chairs, desks, monitors, signs, labels, bubbles, or forum furniture. Actors, seats, desks, monitors, chairs, department labels, bubbles, and forum markers are separate render layers.
- The active v8 architecture uses the selected contemporary daylight office: five connected rooms, explicit paired door openings, light wood and pale tile floors, glass edges, restrained research displays, and no baked interactive furniture. Procedural navy and neutral furniture provides the foreground contrast.
- Department identity is communicated by shallow wall-mounted research instrumentation rather than freestanding clutter: market regime and news displays for Market, product and competitor maps for Company, statements and valuation charts for Financial, scenario and event-risk boards for Risk, and a compact evidence-audit display for the Chair. These decorations never occupy walkable cells or alter doors, corridors, anchors, or navigation geometry.
- Each room also owns one compact bilingual department plaque. A reusable transparent SVG frame supplies the contemporary brushed-metal and frosted-glass material; live Pixi text supplies the localized department name and a short work scope so text is never baked into the asset. Plaques sit in the quiet upper floor band of each department, behind actors and furniture, and are non-interactive: no status, member count, progress, motion, or collision footprint.

| Area | Inclusive cell rectangle | Door |
|---|---|---|
| Market | `(1..16, 1..16)` | `(16,9)`, `(16,10)` |
| Company | `(29..41, 1..16)` | `(29,9)`, `(29,10)` |
| Financial | `(1..19, 17..33)` | `(19,23)`, `(19,24)` |
| Risk | `(23..41, 17..33)` | `(23,23)`, `(23,24)` |
| Chair | `(17..28, 1..16)` | left, right, and bottom paired openings |
| Forum | `(18..27, 10..16)` | standing area |

- Circulation uses the authored room interiors plus the central `(20..22, 15..33)` connector. Cross-room routes can cross boundaries only through the paired door cells; table footprints are removed from the navigation grid.
- Market: Maya/마야 — Market Lead/시장 책임, representative; June/준 — Technical Analyst/기술적 분석가 (the durable internal ID `market_news` remains for WorkflowV1 compatibility); Alex/알렉스 — Benchmark & Cross-Asset Analyst/벤치마크·크로스에셋 분석가.
- Company: Ethan/이든 — Company Lead/기업 책임, representative; Aria/아리아 — Product Analyst/제품 분석가; Leo/레오 — Competitive Intelligence/경쟁 정보.
- Financial: Noah/노아 — Financial Lead/재무 책임, representative; Sofia/소피아 — Valuation Analyst/가치평가 분석가; Hana/하나 — Earnings Quality/이익의 질.
- Risk: Liam/리암 — Risk Lead/리스크 책임, representative; Min/민 — Policy & Scenario/정책·시나리오.
- Independent chair: Dr. Park/박 의장 — Research Chair/리서치 의장.
- Every work seat is on the top or bottom edge of its table; side chairs and side-facing seated poses are prohibited. North-edge seats reserve one clear cell between the actor's feet and the tabletop so their fixed nameplates never overlap furniture. Work seats use `(seat)/(input)/facing`: Maya `(7,6)/(7,7)/down`; June `(9,11)/(9,10)/up`; Alex `(12,11)/(12,10)/up`; Ethan `(35,6)/(35,7)/down`; Aria `(34,11)/(34,10)/up`; Leo `(37,11)/(37,10)/up`; Noah `(7,23)/(7,24)/down`; Sofia `(11,23)/(11,24)/down`; Hana `(9,28)/(9,27)/up`; Liam `(31,23)/(31,24)/down`; Min `(34,28)/(34,27)/up`; Dr. Park `(22,11)/(22,10)/up`.
- Talk anchors are grouped near each room portal so visits finish within the authored beat: Market `(14,10)`, `(12,10)`; Company `(31,10)`, `(33,12)`, `(34,14)`; Financial `(17,24)`, `(15,24)`, `(15,26)`; Risk `(25,24)`, `(27,24)`.
- Visitor anchors sit one cell from the host lead and face inward: Market `(15,10)`, Company `(30,10)`, Financial `(18,24)`, and Risk `(24,24)`. The host lead turns toward the visitor so every cross-team visit reads as a face-to-face exchange.
- Forum anchors gather around target `(22,14)`: Maya `(20,12)/down`, Ethan `(24,12)/down`, Noah `(20,15)/up`, Liam `(24,15)/up`, and Dr. Park `(22,14)/down` toward `(22,15)`.
- Department work is visibly concurrent. Talk anchors turn teammates toward one another; visitor anchors preserve host/visitor facing; forum anchors turn Maya, Ethan, Noah, Liam, and Dr. Park toward `(24,14)`.
- At completion exactly five actors remain standing in the forum and six non-representatives remain at their department seats. Every chair exists from the first frame; occupancy changes its subtle highlight only.
- Every actor owns a transparent `4×4` directional atlas with a common 160×192 frame and foot baseline, displayed at the fixed `0.46` world scale. Work uses a seated frame; walking, talks, visits, and forum presentation use standing frames without changing actor scale.
- Public bubbles stay under two short lines and report source counts, task summaries, evidence handoffs, disagreement, and open questions only.
- The product renderer maps the simulator's fixed-tick actor snapshots into the selected near-square office overview. Position interpolation is transform-only; work, team-talk, visits, returns, gathering, and forum actions remain visible without camera zoom or pan.
- Parallel research starts visibly at tick 40 with two rotating, department-separated progress bubbles. Later bubbles are owned by public `talk`, `summarize`, `present`, and `chair-synthesis` actions, never hidden chain-of-thought.
- Compact 14px nameplates use a dark squared plate with a neutral one-pixel rim and remain fixed on the row one pixel below each actor's feet, including while that actor has a progress bubble. Only crowded nameplates may shift sideways on that same row; bubbles avoid every visible actor body and move around the anchored plates rather than pushing names into furniture. Progress bubbles use a larger white speech surface above the head, while non-travelling actors hold a static directional frame instead of looping a walk cycle.
- Department furniture is generated from the same manifest as five independent Pixi clusters: compact tables use varied widths and offsets near the usable center of each room, laptops placed only on tabletops, and one persistent direction-specific chair aligned to each top/bottom work anchor. Top and bottom laptops use separately authored top-down geometry rather than rotating one perspective; north-edge laptops sit deeper on the surface so the required foot-level nameplate never masks their screens. Chair cushions render behind seated actors, while only the lower up-facing backrest crosses in front to make the body read as seated inside the chair. Furniture footprints are physical obstacles; doors and cross-room routes remain unobstructed.
- Pause freezes ticks. Replay resets ticks, routes, occupancy, reservations, ledger, camera, and trace. Skip synchronously retains the full public ledger and lands on the exact five-forum/six-home final state.

#### Public Transcript

- The right pane renders exactly eight ordered semantic groups from the contract JSON above. Each group exposes public action summaries, evidence labels, timestamps, and verification states; never raw reasoning.
- Every durable public event maps to one group and is rendered once in event-sequence order. Progress percentages, ETAs, source-link clutter, and a second transcript clock are prohibited.
- The transcript is append-only during playback. New entries announce through a polite live region without stealing focus; snapshot plus SSE cursor replay reconstructs the same sequence after reload.

#### Evidence Summary

- Sources linked, claims verified, open questions, and the result CTA after completion.
- Completion transitions from live work to a readable report preview without replacing the stable `/research/[symbol]` URL.

#### Research File

- The result is one versioned Research File, not a recommendation card and not a transcript dump. It explicitly avoids BUY/SELL labels, entry prices, or target prices.
- Layer A, the ten-second brief, appears first: current company condition, operating expectations, three positives, three concerns, valuation posture limited to supported evidence, next material event, conditions that would change the judgment, and data freshness.
- Layer B, the analysis body, covers business and competitive position, financial trend, supported peer evidence, operating volatility, catalysts and schedule, market expectations versus operating reality, and bull/base/bear scenarios. Every scenario exposes its revenue, margin, EPS, and operating assumptions; it does not invent a current price, target, consensus, or price-derived multiple when the licensed capability is unavailable.
- Layer C, the Evidence & Debate Appendix, records each department's original position, strongest counterargument, unresolved issues, removed claims and removal reasons, claim-level sources, Evidence Auditor outcome, and the Research Chair's final rationale. This appendix proves report reliability; it does not replace the report.
- Reanalysis appends versions to the same file: initial analysis, earnings update, material-news update, judgment change, and an explicit delta versus the previous version.

#### Completed Research Workspace

- Completion is an automatic in-place state change on `/research/[symbol]`; it does not require a modal confirmation or navigate to a disconnected page.
- The completed desktop shell uses a disclosure-driven report/transcript split: the left navigation remains stable at wide widths, the report owns the fluid center track, and the meeting log owns a bounded right track with independent vertical scrolling. At narrower desktop widths, opening the transcript temporarily yields the navigation track so the report remains readable.
- While the transcript is open, dense editorial splits such as the core debate and company metrics reflow into a single readable column while the report type scale remains unchanged; one- or two-word Korean columns are prohibited.
- The live office remains in the central pane as a compact contextual preview above the Research File. Its aspect ratio, camera, final actor positions, and renderer lifecycle remain unchanged; only its containing surface transitions with `transform` and `opacity`.
- The Research File opens immediately below the compact room with a version header, evidence-audit state, 10-second brief, operating-expectations posture, positive and concern columns, supported valuation evidence, next event, freshness, and a visible route into the analysis and evidence appendix.
- Expanded report sections use native `details` disclosures so keyboard and screen-reader users can inspect analysis, scenarios, audit decisions, and version history without losing the office or the right-side conversation.
- Completion announces report availability through a polite live region and programmatically focuses the Research File heading without stealing focus from a currently active form control.
- Replaying or requesting follow-up research restores the full live office and research desk. Reduced-motion users move directly between the two settled states.

### Research state machine

One `50ms` fixed-tick simulator owns behavior and elapsed labels. Render interpolation is `accumulator / 50`, catch-up is capped at five ticks, and browser gaps clamp at `250ms`.

| Ticks | Public beat |
|---|---|
| `0..39` | chair briefing; eleven specialists seated |
| `40..239` | four departments work in parallel |
| `240..359` | all departments talk at their own anchors |
| `360..639` | Maya→Company and Noah→Risk visits |
| `640..719` | visitors return and summarize |
| `720..999` | Ethan→Financial and Liam→Market visits |
| `1000..1079` | representatives return; four department summaries publish |
| `1080..1299` | four representatives and chair gather |
| `1300..1579` | Maya→Ethan→Noah→Liam present; chair synthesizes |
| `1580` | complete; report action unlocks |

- Actor states are `seated-work → stand → walk → orient → talk|listen → return → summarize`, plus `present`, `chair-synthesis`, and `idle`. Same-beat revisions update immediately.
- Navigation is deterministic four-neighbor A* with one-cell occupancy, next-cell reservations, no head-on swaps, stable roster tie-breaks, bounded wait/replan/yield, and a public route-failure status.
- Reduced motion preserves identical ticks, events, destinations, final ownership, and ledger content while snapping spatial interpolation to semantic destinations.

### Accessibility and accepted debt

- `prefers-reduced-motion` preserves directionally correct frames, department rows, progress, ledger entries, meeting status, and the exact final split.
- Keyboard users can reach language, new conversation, agent selection, message submission, grouped history, mobile camera control, and transcript content in reading order.
- Canvas is decorative to assistive technology; equivalent actor, department, visit, forum, progress, disagreement, and completion state is exposed through semantic headings, text, and polite live regions.
- Korean and English provide equal member, department, bubble, activity, debate, source, and completion content with natural CJK wrapping.
- Licensed current-market and consensus fields remain explicit `unavailable` states, never placeholders. Optional macro degradation is disclosed in the report and does not change the publication gate for mandatory evidence.
- Sequencing note: v6/v7 visual assets remain available only for comparison and rollback; office-v8 is the active product surface.

### Landing footer and legal surfaces

- The landing footer is a spacious, border-led four-column information surface: brand and product promise, working product anchors, operator contact, and live legal routes. Links to nonexistent marketing pages and unconfigured social accounts are prohibited.
- The operator is displayed as `SERN`, based in South Korea. The public address uses an English transliteration and remains concise until city, province, and postal code are confirmed.
- The lower footer carries copyright, compact legal navigation, locale availability, and a restrained research-risk notice. It must not imply licensed investment advice, guaranteed real-time data, buy/sell recommendations, or target prices.
- `/terms`, `/privacy`, `/disclaimer`, and `/risk-disclosure` share one quiet legal-document layout with a home return, last-updated metadata, a pre-launch review notice, readable section measure, and direct operator contact.
- Legal copy treats user questions as research-scope customization rather than portfolio-specific investment advice. Payment, analytics, prompt storage, third-party processing, retention, and data-timing limits are disclosed without inventing providers that have not been selected.
- On narrow screens, footer columns and legal metadata stack in reading order; links keep generous touch targets and long addresses or email addresses wrap safely.
