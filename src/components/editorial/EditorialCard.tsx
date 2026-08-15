import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { editorialPath } from "../../editorial/catalog";
import type {
  EditorialDefinition,
  EditorialEntryCopy,
} from "../../editorial/types";
import type { AppLocale } from "../../lib/i18n";
import { intlLocale } from "../../lib/i18n";
import { EditorialCardFrame } from "./EditorialCardFrame";

type EditorialCardProps = Readonly<{
  locale: AppLocale;
  definition: EditorialDefinition;
  copy: EditorialEntryCopy;
  action: string;
  priority?: boolean;
}>;

function dateLabel(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function EditorialCard({
  locale,
  definition,
  copy,
  action,
  priority = false,
}: EditorialCardProps) {
  const href = editorialPath(locale, definition.kind, definition.slug);
  return (
    <EditorialCardFrame>
      <article className="editorial-card">
        <Link
          className="editorial-card__image"
          href={href}
          aria-label={copy.title}
        >
          <Image
            src={definition.image}
            alt={copy.imageAlt}
            fill
            priority={priority}
            sizes="(max-width: 720px) 100vw, (max-width: 1080px) 50vw, 360px"
          />
        </Link>
        <div className="editorial-card__body">
          <div className="editorial-card__meta">
            <span>{copy.category}</span>
            <time dateTime={definition.publishedAt}>
              {dateLabel(definition.publishedAt, locale)}
            </time>
          </div>
          <h2>
            <Link href={href}>{copy.title}</Link>
          </h2>
          <p>{copy.description}</p>
          <Link className="editorial-card__action" href={href}>
            {action}
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </article>
    </EditorialCardFrame>
  );
}
