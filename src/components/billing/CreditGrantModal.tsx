"use client";

import { BorderBeam } from "border-beam";
import { Gift, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../../lib/i18n";
import type { BillingCreditNotice } from "../../lib/whop/contracts";

type Props = {
  readonly locale: Locale;
  readonly open: boolean;
  readonly notice: BillingCreditNotice | undefined;
  readonly onClose: () => void;
  readonly onOpenMyPage: () => void;
};

export function CreditGrantModal({
  locale,
  open,
  notice,
  onClose,
  onOpenMyPage,
}: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("credit-grant-modal-is-open");
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.body.classList.remove("credit-grant-modal-is-open");
      window.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [onClose, open]);

  if (!mounted || !open || notice === undefined) return null;
  const isSignup = notice.kind === "signup";
  const openMyPage = () => {
    onClose();
    onOpenMyPage();
  };

  return createPortal(
    <div className="credit-grant-modal__backdrop" role="presentation">
      <BorderBeam
        className="credit-grant-modal__beam"
        size="pulse-outside"
        colorVariant="colorful"
        theme="dark"
        strength={0.79}
        borderRadius={20}
      >
        <section
          className="credit-grant-modal__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <button
            type="button"
            className="credit-grant-modal__close"
            aria-label={locale === "ko" ? "닫기" : "Close"}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
          <div className="credit-grant-modal__icon" aria-hidden="true">
            <Gift size={28} strokeWidth={1.8} />
          </div>
          <span className="credit-grant-modal__eyebrow">
            {locale === "ko"
              ? isSignup
                ? "가입 보너스"
                : "출석체크 무료 크레딧"
              : isSignup
                ? "WELCOME BONUS"
                : "DAILY CHECK-IN"}
          </span>
          <h2 id={titleId}>
            {locale === "ko"
              ? isSignup
                ? "첫 리서치를 위한 크레딧이 준비됐습니다"
                : "오늘의 크레딧이 도착했습니다"
              : isSignup
                ? "Your first research starts here"
                : "Your daily research credit is ready"}
          </h2>
          <strong className="credit-grant-modal__amount">
            +{notice.amount}
            <small>{locale === "ko" ? "크레딧" : "credits"}</small>
          </strong>
          <p>
            {locale === "ko"
              ? isSignup
                ? "가입 보너스를 잔액에 반영했습니다. 지금 바로 첫 질문을 검증해보세요."
                : "24시간이 지나 오늘의 출석 보상을 잔액에 반영했습니다."
              : isSignup
                ? "Your sign-up bonus is ready. Put it to work on your first question."
                : "Your 24-hour check-in reward has been added to your balance."}
          </p>
          <div className="credit-grant-modal__balance">
            <span>{locale === "ko" ? "현재 잔액" : "Current balance"}</span>
            <strong>
              {notice.balance.toLocaleString()}
              <small>{locale === "ko" ? "크레딧" : "credits"}</small>
            </strong>
          </div>
          <button
            type="button"
            className="credit-grant-modal__confirm"
            onClick={openMyPage}
          >
            {locale === "ko" ? "크레딧 확인하기" : "View my credits"}
          </button>
        </section>
      </BorderBeam>
    </div>,
    document.body,
  );
}
