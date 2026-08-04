"use client";

import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../../lib/i18n";

type Props = {
  readonly locale: Locale;
  readonly open: boolean;
  readonly onClose?: () => void;
};

export function CreditShortageModal({ locale, open, onClose }: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const dismiss = useCallback(() => {
    if (onClose !== undefined) {
      onClose();
      return;
    }
    window.history.back();
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.body.classList.add("credit-shortage-modal-is-open");
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("credit-shortage-modal-is-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismiss, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="credit-shortage-modal__backdrop" role="presentation">
      <section
        className="credit-shortage-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          type="button"
          className="credit-shortage-modal__close"
          aria-label={locale === "ko" ? "닫기" : "Close"}
          onClick={dismiss}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <span className="credit-shortage-modal__eyebrow">
          {locale === "ko" ? "CREDIT LIMIT" : "CREDIT LIMIT"}
        </span>
        <h2 id={titleId}>
          {locale === "ko" ? "크레딧이 부족합니다" : "Not enough credits"}
        </h2>
        <p>
          {locale === "ko"
            ? "이 기능을 계속 이용하려면 플랜을 업그레이드해 주세요."
            : "Upgrade your plan to keep using this feature."}
        </p>
        <div className="credit-shortage-modal__actions">
          <button
            type="button"
            className="credit-shortage-modal__dismiss"
            onClick={dismiss}
          >
            {locale === "ko" ? "닫기" : "Close"}
          </button>
          <Link
            className="credit-shortage-modal__upgrade"
            href="/?billing=plans"
          >
            {locale === "ko" ? "플랜 보기" : "View plans"}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>,
    document.body,
  );
}
