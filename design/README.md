# Design Concepts and Historical References

[Repository guide](../README.md)

This directory contains visual exploration, not production UI code or runtime office images.

## Concept collections

| Directory | Design question represented |
| --- | --- |
| `concepts/research-office-6x5-empty/` | Empty office shell/layout alternatives |
| `concepts/research-office-6x5/` | Populated office atmosphere and arrangement alternatives |
| `concepts/research-office-connected-teams/` | Ways to connect team areas through corridors and shared spaces |

The baseline contains five images in each collection. These are alternatives, not fifteen deployed scenes. Names describe the concept rather than a guaranteed current product feature.

## Related sources

The root [DESIGN.md](../DESIGN.md) records design contracts. Runtime layout and animation are implemented under `src/research` and React components. Runtime images live in `public/research`; processing originals live in `assets/research`.

## Maintenance

Keep new concepts grouped by the question or iteration they address. Record the selected direction and rationale in a design document rather than renaming a concept to imply it shipped. Do not point production code at this directory. It is excluded from the Docker context.

No concept images were deleted during the inventory pass: absence from imports identifies them as references, not automatically disposable files.
