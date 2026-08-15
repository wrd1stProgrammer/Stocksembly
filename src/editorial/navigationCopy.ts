import type { AppLocale } from "../lib/i18n";

export const editorialNavigationCopy: Readonly<
  Record<AppLocale, { readonly blog: string; readonly glossary: string }>
> = {
  en: { blog: "Blog", glossary: "Glossary" },
  ko: { blog: "블로그", glossary: "용어사전" },
  ja: { blog: "ブログ", glossary: "用語集" },
  "zh-TW": { blog: "部落格", glossary: "詞彙表" },
  es: { blog: "Blog", glossary: "Glosario" },
  "pt-BR": { blog: "Blog", glossary: "Glossário" },
  de: { blog: "Blog", glossary: "Glossar" },
  fr: { blog: "Blog", glossary: "Glossaire" },
};
