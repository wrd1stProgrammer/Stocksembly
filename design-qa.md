# Design QA

final result: passed — office v6 full-bleed standing-committee rebuild

## Current iteration

- The former v4/v5 layered seating model is superseded and removed. It duplicated chairs, retained a committee table, and could not represent the requested standing discussion.
- The v6 base is a full-bleed opaque 1448×1086 modern research room with no outer mat, baked people, chairs, or committee furniture.
- Six role-specific perimeter workstations use cyan, indigo, green, violet, amber, and cobalt monitor accents while sharing the same restrained graphite-and-oak office system.
- Six 640×768 actor atlases provide padded 160×192 cells for down, left, right, and up idle, walking, and seated poses. Asset tests require zero alpha on every cell edge and one shared foot baseline.
- Work directions are Maya and Ethan up, Noah left, Sofia right, and Liam and Dr. Park down. Each work vector is validated against its actual monitor target.
- During gathering, the seated actor-plus-chair sprite swaps for the matching empty work chair before orthogonal walking begins. No chair appears late and no second chair is rendered.
- Committee and complete states contain no table or meeting chairs. All six agents stand at separated points and face the shared center; one public speech bubble rotates at a time.
- Desktop uses distortion-free cover rendering and mobile uses a native 4:3 stage, so the office fills its slot without white or empty bands.

## Fresh evidence

- Production preview: `http://127.0.0.1:4175/research/NVDA`
- Work seats: `.omo/evidence/office-v6/work-seats.png`
- Gathering sequence: `.omo/evidence/office-v6/gathering-t1.png`, `gathering-t2.png`, `gathering-t3.png`
- Standing committee: `.omo/evidence/office-v6/standing-committee.png`
- Product desktop: `.omo/evidence/office-v6/research-desktop-work-final.png`, `research-desktop-complete-final.png`
- Product mobile: `.omo/evidence/office-v6/research-mobile-work-final.png`
- Fresh Chrome runs produced no console warnings, page errors, clipping, scale jumps, duplicate chairs, or pale edge pixels.

## Automated verification

- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm build`: passed
- Targeted office unit suite: 23 tests passed
- Office Playwright/Chrome suite: 2 tests passed
- Full Playwright/Chrome suite: 9 tests passed before the final cover/mobile-aspect repair; the office subset passed again after the repair.
