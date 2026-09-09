"use client";

import "../../styles/billing.css";
import { BorderBeam } from "border-beam";
import { ArrowUpRight, CreditCard, X } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../../lib/i18n";
import { SidebarSubscriptionModal } from "./SidebarSubscriptionModal";

type Props = {
  readonly locale: Locale;
  readonly open: boolean;
  readonly onClose?: () => void;
  readonly remaining?: number | undefined;
  readonly required?: number;
  readonly onConfirm?: () => void;
  readonly busy?: boolean;
  readonly error?: string;
};

export function CreditShortageModal({
  locale,
  open,
  onClose,
  remaining,
  required,
  onConfirm,
  busy = false,
  error,
}: Props) {
  const titleId = useId();
  const confirming = onConfirm !== undefined;
  const [mounted, setMounted] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const dismiss = useCallback(() => {
    if (busy) return;
    if (onClose !== undefined) {
      onClose();
      return;
    }
    window.history.back();
  }, [onClose, busy]);

  useEffect(() => {
    setMounted(true);
    if (!open || plansOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.body.classList.add("credit-shortage-modal-is-open");
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("credit-shortage-modal-is-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismiss, open, plansOpen]);

  if (!mounted || !open) return null;

  return (
    <>
      {plansOpen
        ? null
        : createPortal(
            <div
              className="credit-shortage-modal__backdrop"
              role="presentation"
            >
              <BorderBeam
                className="credit-shortage-modal__beam"
                size="pulse-outside"
                colorVariant="colorful"
                theme="dark"
                strength={0.79}
                borderRadius={20}
              >
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
                  <div
                    className="credit-shortage-modal__icon"
                    aria-hidden="true"
                  >
                    <CreditCard size={27} strokeWidth={1.8} />
                  </div>
                  <span className="credit-shortage-modal__eyebrow">
                    {confirming ? "RESEARCH ACCESS" : "CREDIT LIMIT"}
                  </span>
                  <h2 id={titleId}>
                    {confirming
                      ? locale === "ko"
                        ? "이 리서치를 열람할까요?"
                        : "Open this research?"
                      : locale === "ko"
                        ? "크레딧이 부족합니다"
                        : "Not enough credits"}
                  </h2>
                  <p>
                    {confirming
                      ? locale === "ko"
                        ? `${required}크레딧으로 전체 보고서와 에이전트 토론을 확인하세요. 한 번 열람한 보고서는 추가 차감 없이 다시 볼 수 있습니다.`
                        : `Use ${required} credits to read the full report and agent discussions. Return to this report anytime without paying again.`
                      : locale === "ko"
                        ? "이번 리서치에 필요한 크레딧이 현재 잔액보다 많습니다. 플랜을 확인하거나 다음 지급을 기다려 주세요."
                        : "This research needs more credits than your current balance. Review a plan or wait for your next credit grant."}
                  </p>
                  {typeof remaining === "number" &&
                  typeof required === "number" ? (
                    <div className="credit-shortage-modal__balance">
                      <span>
                        {locale === "ko" ? "현재 잔액" : "Current balance"}
                      </span>
                      <strong>
                        {remaining.toLocaleString()}
                        <small>
                          {locale === "ko"
                            ? `크레딧 · ${required} 필요`
                            : `credits · ${required} required`}
                        </small>
                      </strong>
                    </div>
                  ) : null}
                  {error ? <p role="alert">{error}</p> : null}
                  <div className="credit-shortage-modal__actions">
                    <button
                      type="button"
                      className="credit-shortage-modal__dismiss"
                      onClick={dismiss}
                    >
                      {locale === "ko" ? "닫기" : "Close"}
                    </button>
                    <button
                      type="button"
                      className="credit-shortage-modal__upgrade"
                      disabled={busy}
                      onClick={onConfirm ?? (() => setPlansOpen(true))}
                    >
                      {busy
                        ? locale === "ko"
                          ? "여는 중…"
                          : "Opening…"
                        : confirming
                          ? locale === "ko"
                            ? `${required}크레딧 사용`
                            : `Use ${required} credits`
                          : locale === "ko"
                            ? "플랜 보기"
                            : "View plans"}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </section>
              </BorderBeam>
            </div>,
            document.body,
          )}
      <SidebarSubscriptionModal
        open={plansOpen}
        locale={locale}
        initialTier="free"
        onClose={() => setPlansOpen(false)}
      />
    </>
  );
}
