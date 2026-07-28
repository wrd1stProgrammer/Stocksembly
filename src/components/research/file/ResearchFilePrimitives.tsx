import type { ReactNode } from "react";
import type { Locale } from "../../../lib/i18n";
import type { ResearchEvidenceStrength } from "../../../research/compositions/types";
import type { EditorialCallout } from "../../../research/researchFileEditorialModel";

type SectionHeaderProps = {
  readonly number: "01" | "02" | "03" | "04";
  readonly title: string;
  readonly description: string;
};

const strengthLabels = {
  strong: { en: "Strong evidence", ko: "강한 근거" },
  moderate: { en: "Moderate evidence", ko: "보통 근거" },
  limited: { en: "Limited evidence", ko: "제한적 근거" },
  contested: { en: "Contested", ko: "상충 근거" },
  unverified: { en: "Unverified", ko: "검증 불가" },
} as const;

export function ResearchFileSectionHeader({
  number,
  title,
  description,
}: SectionHeaderProps) {
  return (
    <header className="research-editorial-heading">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

export function EvidenceStrength({
  strength,
  locale,
}: {
  readonly strength: ResearchEvidenceStrength;
  readonly locale: Locale;
}) {
  return (
    <span className="research-evidence-strength" data-strength={strength}>
      {strengthLabels[strength][locale]}
    </span>
  );
}

export function EditorialList({
  items,
}: {
  readonly items: readonly EditorialCallout[];
}) {
  return (
    <ol className="research-editorial-list">
      {items.map((item, index) => (
        <li key={`${item.headline}-${index}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>{item.headline}</strong>
            <p>{item.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EditorialCell({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="research-editorial-cell">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}
