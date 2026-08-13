"use client";

import { X } from "lucide-react";
import type { BriefingEditionPayload } from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { DotsRing } from "../ui/dots-ring";
import { BriefingDetailBody } from "./BriefingDetailBody";
import { briefingCopy } from "./briefingPresentation";

type Props = {
  readonly briefing: BriefingEditionPayload | undefined;
  readonly locale: Locale;
  readonly open: boolean;
  readonly onClose: () => void;
};

export function BriefingDetail({ briefing, locale, open, onClose }: Props) {
  const copy = briefingCopy(locale);
  if (!open) return null;
  return (
    <div className="briefing-detail-backdrop">
      <aside
        className="briefing-detail"
        aria-modal="true"
        aria-labelledby="briefing-detail-title"
        role="dialog"
      >
        <button
          type="button"
          className="briefing-detail__close"
          onClick={onClose}
          aria-label={copy.close}
        >
          <X size={18} />
        </button>
        {briefing === undefined ? (
          <div className="briefing-detail__loading">
            <DotsRing />
          </div>
        ) : (
          <BriefingDetailBody edition={briefing} locale={locale} />
        )}
      </aside>
    </div>
  );
}
