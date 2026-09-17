import type { AppLocale } from "../../lib/i18n";
import type { EditorialLocaleContent } from "../types";
import { deEditorialContent } from "./de";
import { deEditorialDepth } from "./depth-de";
import { enEditorialDepth } from "./depth-en";
import { esEditorialDepth } from "./depth-es";
import { frEditorialDepth } from "./depth-fr";
import { jaEditorialDepth } from "./depth-ja";
import { koEditorialDepth } from "./depth-ko";
import { ptBrEditorialDepth } from "./depth-pt-BR";
import { zhTwEditorialDepth } from "./depth-zh-TW";
import { enEditorialContent } from "./en";
import { enrichEditorialLocale } from "./enrich";
import { esEditorialContent } from "./es";
import { frEditorialContent } from "./fr";
import { jaEditorialContent } from "./ja";
import { koEditorialContent } from "./ko";
import { ptBrEditorialContent } from "./pt-BR";
import { zhTwEditorialContent } from "./zh-TW";

export const editorialContent: Readonly<
  Record<AppLocale, EditorialLocaleContent>
> = {
  en: enrichEditorialLocale(enEditorialContent, enEditorialDepth, "en"),
  ko: enrichEditorialLocale(koEditorialContent, koEditorialDepth, "ko"),
  ja: enrichEditorialLocale(jaEditorialContent, jaEditorialDepth, "ja"),
  "zh-TW": enrichEditorialLocale(
    zhTwEditorialContent,
    zhTwEditorialDepth,
    "zh-TW",
  ),
  es: enrichEditorialLocale(esEditorialContent, esEditorialDepth, "es"),
  "pt-BR": enrichEditorialLocale(
    ptBrEditorialContent,
    ptBrEditorialDepth,
    "pt-BR",
  ),
  de: enrichEditorialLocale(deEditorialContent, deEditorialDepth, "de"),
  fr: enrichEditorialLocale(frEditorialContent, frEditorialDepth, "fr"),
};
