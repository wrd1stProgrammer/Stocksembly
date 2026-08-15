import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorialArticlePage } from "@/src/components/editorial/EditorialArticlePage";
import { EditorialWorkspaceShell } from "@/src/components/editorial/EditorialWorkspaceShell";
import {
  editorialDefinition,
  editorialEntries,
  editorialLocalePaths,
  editorialPath,
} from "@/src/editorial/catalog";
import { editorialEntryMetadata } from "@/src/editorial/metadata";
import { editorialWorkspaceAccess } from "@/src/editorial/server/editorialWorkspaceAccess";
import { isLocale, locales } from "@/src/lib/i18n";

export const dynamic = "force-dynamic";

type Props = Readonly<{
  params: Promise<{ readonly locale: string; readonly slug: string }>;
}>;

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    editorialEntries("glossary").map(({ slug }) => ({ locale, slug })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const definition = editorialDefinition(slug);
  return isLocale(locale) && definition?.kind === "glossary"
    ? editorialEntryMetadata(locale, definition)
    : {};
}

export default async function GlossaryEntryPage({ params }: Props) {
  const { locale, slug } = await params;
  const definition = editorialDefinition(slug);
  if (!isLocale(locale) || definition?.kind !== "glossary") notFound();
  const access = await editorialWorkspaceAccess(
    editorialPath(locale, "glossary", definition.slug),
  );
  return (
    <EditorialWorkspaceShell
      access={access}
      activeItem="glossary"
      locale={locale}
      localePaths={editorialLocalePaths("glossary", definition.slug)}
    >
      <EditorialArticlePage locale={locale} definition={definition} />
    </EditorialWorkspaceShell>
  );
}
