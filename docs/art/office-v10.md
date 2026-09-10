# Office v10 character integration

The home office and live research office share `createOfficeMotionRenderer`, `loadAssets`, and `drawActor`. All 12 actor paths now point to the versioned v10 atlases. The previous v9 files remain available.

## Rendering

- Read the 6-by-4 atlas with whitespace-based row boundaries; cache backdrop masks and crop/neck measurements per image.
- Preserve one scale per facing for standing and seated poses. Place the seated hip on the existing chair seat at y=-16.
- Keep chair base behind actors and rear-facing backrests in front using the existing world depth ordering.
- Retain gait phase, sit/stand progress, head-facing state, and small head nods. Use neutral legs for planted evidence poses.
- Exclude known unstable paper/arm frames from several generated cycles; these cycles repeat stable frames and are not full newly authored four-phase locomotion. The seated atlas provides document-reading poses; it does not contain separate typing and handwriting hand-pose artwork.

## Provenance

Built-in image generation, exact model version not exposed. The 11 initial cast prompts and Min's document repair are in `office-v10-generation.json`. Maya uses the approved sample plus a final rear-seated paper removal:

> Precise tiny edit to this Maya 6-column 4-row sprite atlas. ONLY change the bottom-right cell (row4 column6 rear seated pose): remove the paper corner sticking out at the right shoulder. Both hands and entire document must be hidden in front of her torso, invisible from the back. Preserve the seated posture, head, black bob, navy blazer, all body sizes, pure white background and exact grid. Every other cell must stay unchanged. No other edits.

Selected Maya output: `exec-79c7880c-2260-4cf7-86a9-fcdc39fa2bed.png`.

## Prior sample verification

- Browser: all 12 characters seated in all four directions (48 combinations), using actual service chair and actor draw functions. Checked head turns with seated bodies and rechecked final rear occlusion.
- Home: new actors displayed in the live office on port 3000.
- Research: actual `ResearchRoom` fixture replay on `/showcase/refined-research`, gated to development and visibly labelled. No paid run or production worker was started; the live route requires a saved run ID.
- `liveScene.test.ts` and `officeDialogue.test.ts`: 12 tests passed. Test environment emits its existing canvas getContext warning.
- Biome check on changed TypeScript files passed.
- Whole-project TypeScript check is blocked by the pre-existing generated `.next/types/app/api/research/tickers/route.ts` error for exported `createTickerRoute`; no changed-file errors reported.

Local 48-pose check: `http://localhost:4193/experiments/refined-integration/index.html` (Vite). The untracked experiments directory is retained for visual review.

## Front/back gait and local server correction

Front/back walking now renders a fixed upper body and alternates mirrored lower-body contact/passing poses on the second half of the gait cycle. This avoids repeated same-foot generated poses, including Dr Park. Browser checked both contact sides for all 12 in front and rear views.

Port 3000 now runs from the clean `codex/refined-office-main` worktree, based on `origin/main` at `a6c76cc`. The earlier working directories were behind main and served an older home. The latest signed-in home (“오늘은 어떤 종목을 검증해볼까요?”) was observed in browser after switching the server to this worktree. Node 20 is used to match the installed SQLite native module.

Only the actor renderer, two integration files, v10 assets and these art notes are included. No home source files were changed. Existing dirty work and sample artifacts remain in their original working directories. No commits or pushes.

Current-main verification: Biome passed on the three changed TypeScript files; `liveScene.test.ts` and `officeDialogue.test.ts` passed (14 tests). Full-project type checking was not repeated; the generated-type failure above describes the earlier sample worktree only.
