import type { AppLocale } from "../lib/supportedLocales";
import type { EditorialEntryCopy } from "./types";

export function editorialReadingMinutes(
  copy: EditorialEntryCopy,
  locale: AppLocale,
): number {
  const text = [
    copy.title,
    copy.description,
    ...copy.sections.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...(section.bullets ?? []),
      ...(section.table
        ? [
            section.table.caption,
            ...section.table.headers,
            ...section.table.rows.flat(),
          ]
        : []),
    ]),
  ].join(" ");
  // CJK text has no reliable whitespace word boundaries; estimate by characters.
  const cjk = locale === "ja" || locale === "zh-TW";
  const units = cjk
    ? Array.from(text.replace(/\s/gu, "")).length
    : text.split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(units / (cjk ? 500 : 220)));
}
