import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorialIndexPage } from "@/src/components/editorial/EditorialIndexPage";
import { EditorialWorkspaceShell } from "@/src/components/editorial/EditorialWorkspaceShell";
import { editorialLocalePaths, editorialPath } from "@/src/editorial/catalog";
import { editorialIndexMetadata } from "@/src/editorial/metadata";
import { editorialWorkspaceAccess } from "@/src/editorial/server/editorialWorkspaceAccess";
import { isLocale } from "@/src/lib/i18n";

export const dynamic = "force-dynamic";

type Props = Readonly<{ params: Promise<{ readonly locale: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? editorialIndexMetadata(locale, "blog") : {};
}

export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const access = await editorialWorkspaceAccess(editorialPath(locale, "blog"));
  return (
    <EditorialWorkspaceShell
      access={access}
      activeItem="blog"
      locale={locale}
      localePaths={editorialLocalePaths("blog")}
    >
      <EditorialIndexPage locale={locale} kind="blog" />
    </EditorialWorkspaceShell>
  );
}
