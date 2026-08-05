"use client";

import { BorderBeam } from "border-beam";
import { ArrowUpRight, LockKeyhole, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../../lib/i18n";

type Props = {
  readonly locale: Locale;
  readonly open: boolean;
  readonly reason: "customize" | "recent-report";
  readonly onClose?: () => void;
};

export function MembershipAccessModal({
  locale,
  open,
  reason,
  onClose,
}: Props) {
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
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("membership-access-modal-is-open");
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.body.classList.remove("membership-access-modal-is-open");
      window.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [dismiss, open]);

  if (!mounted || !open) return null;

  const isCustomize = reason === "customize";
  const copy =
    locale === "ko"
      ? isCustomize
        ? {
            eyebrow: "MEMBER FEATURE",
            title: "맞춤 설정은 구독 사용자 전용입니다",
            description:
              "투자 기간·반론 강도·분석 깊이와 비교기업을 지정하면 같은 질문도 더 목적에 맞게 검증할 수 있습니다.",
          }
        : {
            eyebrow: "MEMBER EDITION",
            title: "최신 리서치는 구독자에게 먼저 공개됩니다",
            description:
              "발행 후 7일 동안은 구독자만 전체 리포트를 볼 수 있습니다. 무료 계정은 7일이 지나면 같은 리서치를 열람할 수 있습니다.",
          }
      : isCustomize
        ? {
            eyebrow: "MEMBER FEATURE",
            title: "Custom settings are for subscribers",
            description:
              "Set the horizon, counterargument strength, depth, and peer set to make each review fit your decision.",
          }
        : {
            eyebrow: "MEMBER EDITION",
            title: "Subscribers get the newest research first",
            description:
              "The full report is subscriber-only for its first seven days. Free accounts can open the same research after the seven-day window.",
          };

  return createPortal(
    <div className="membership-access-modal__backdrop" role="presentation">
      <BorderBeam
        className="membership-access-modal__beam"
        size="pulse-outside"
        colorVariant="colorful"
        theme="dark"
        strength={0.79}
        borderRadius={20}
      >
        <section
          className="membership-access-modal__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            className="membership-access-modal__close"
            aria-label={locale === "ko" ? "닫기" : "Close"}
            onClick={dismiss}
          >
            <X size={18} aria-hidden="true" />
          </button>
          <div className="membership-access-modal__icon" aria-hidden="true">
            <LockKeyhole size={27} strokeWidth={1.8} />
          </div>
          <span className="membership-access-modal__eyebrow">
            {copy.eyebrow}
          </span>
          <h2 id={titleId}>{copy.title}</h2>
          <p>{copy.description}</p>
          <div className="membership-access-modal__actions">
            <button
              type="button"
              className="membership-access-modal__dismiss"
              onClick={dismiss}
            >
              {locale === "ko" ? "나중에" : "Maybe later"}
            </button>
            <Link
              className="membership-access-modal__upgrade"
              href="/?billing=plans"
            >
              {locale === "ko" ? "플랜 확인하기" : "View plans"}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </BorderBeam>
    </div>,
    document.body,
  );
}
