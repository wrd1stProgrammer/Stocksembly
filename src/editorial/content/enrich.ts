import type {
  EditorialDepthContent,
  EditorialEntryCopy,
  EditorialLocaleContent,
} from "../types";

function enrichEntry(
  entry: EditorialEntryCopy,
  addedSections: readonly EditorialEntryCopy["sections"][number][],
): EditorialEntryCopy {
  return {
    ...entry,
    sections: [...entry.sections, ...addedSections],
  };
}

export function enrichEditorialLocale(
  content: EditorialLocaleContent,
  depth: EditorialDepthContent,
): EditorialLocaleContent {
  return {
    ui: content.ui,
    entries: {
      "how-to-read-a-10-k": enrichEntry(
        content.entries["how-to-read-a-10-k"],
        depth["how-to-read-a-10-k"],
      ),
      "earnings-quality-and-cash-conversion": enrichEntry(
        content.entries["earnings-quality-and-cash-conversion"],
        depth["earnings-quality-and-cash-conversion"],
      ),
      "how-to-choose-comparable-companies": enrichEntry(
        content.entries["how-to-choose-comparable-companies"],
        depth["how-to-choose-comparable-companies"],
      ),
      "bull-base-bear-scenario-analysis": enrichEntry(
        content.entries["bull-base-bear-scenario-analysis"],
        depth["bull-base-bear-scenario-analysis"],
      ),
      "counterarguments-in-ai-stock-research": enrichEntry(
        content.entries["counterarguments-in-ai-stock-research"],
        depth["counterarguments-in-ai-stock-research"],
      ),
      "free-cash-flow": enrichEntry(
        content.entries["free-cash-flow"],
        depth["free-cash-flow"],
      ),
      "ev-to-ebitda": enrichEntry(
        content.entries["ev-to-ebitda"],
        depth["ev-to-ebitda"],
      ),
      "earnings-guidance": enrichEntry(
        content.entries["earnings-guidance"],
        depth["earnings-guidance"],
      ),
      "share-dilution": enrichEntry(
        content.entries["share-dilution"],
        depth["share-dilution"],
      ),
      "margin-of-safety": enrichEntry(
        content.entries["margin-of-safety"],
        depth["margin-of-safety"],
      ),
    },
  };
}
