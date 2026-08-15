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
  en: enrichEditorialLocale(enEditorialContent, enEditorialDepth),
  ko: enrichEditorialLocale(koEditorialContent, koEditorialDepth),
  ja: enrichEditorialLocale(jaEditorialContent, jaEditorialDepth),
  "zh-TW": enrichEditorialLocale(zhTwEditorialContent, zhTwEditorialDepth),
  es: enrichEditorialLocale(esEditorialContent, esEditorialDepth),
  "pt-BR": enrichEditorialLocale(ptBrEditorialContent, ptBrEditorialDepth),
  de: enrichEditorialLocale(deEditorialContent, deEditorialDepth),
  fr: enrichEditorialLocale(frEditorialContent, frEditorialDepth),
};
