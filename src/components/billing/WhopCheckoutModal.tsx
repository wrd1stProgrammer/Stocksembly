"use client";

import { WhopCheckoutEmbed } from "@whop/checkout/react";
import { ExternalLink, ShieldCheck, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../../lib/i18n";
import { DotsRing } from "../ui/dots-ring";
import type { EmbeddedWhopCheckout } from "./useWhopCheckout";

type Props = {
  readonly checkout: EmbeddedWhopCheckout | undefined;
  readonly locale: Locale;
  readonly onClose: () => void;
};

export function WhopCheckoutModal({ checkout, locale, onClose }: Props) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [failedSessionId, setFailedSessionId] = useState<string>();

  useEffect(() => {
    if (checkout === undefined) return;
    const previouslyFocused = document.activeElement;
    document.body.classList.add("whop-checkout-modal-is-open");
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.classList.remove("whop-checkout-modal-is-open");
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [checkout]);

  if (checkout === undefined || typeof document === "undefined") return null;
  const paymentError = failedSessionId === checkout.sessionId;

  return createPortal(
    <dialog
      open
      className="whop-checkout-modal__backdrop"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") onClose();
      }}
    >
      <section className="whop-checkout-modal__dialog">
        <header className="whop-checkout-modal__header">
          <div>
            <span className="whop-checkout-modal__security">
              <ShieldCheck size={15} aria-hidden="true" />
              {locale === "ko" ? "Whop 보안 결제" : "Secure checkout by Whop"}
            </span>
            <h2 id={titleId}>
              {locale === "ko"
                ? `${checkout.label} 시작하기`
                : `Start ${checkout.label}`}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="whop-checkout-modal__close"
            aria-label={locale === "ko" ? "결제창 닫기" : "Close checkout"}
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="whop-checkout-modal__embed">
          <WhopCheckoutEmbed
            key={checkout.sessionId}
            sessionId={checkout.sessionId}
            returnUrl={checkout.returnUrl}
            environment={checkout.environment}
            locale={locale}
            theme="dark"
            styles={{ container: { paddingY: 8, paddingX: 4 } }}
            themeOptions={{
              accentColor: "#f4f4f5",
              backgroundColor: "#111113",
              borderRadius: 14,
              buttonText: locale === "ko" ? "구독 시작" : "Start subscription",
            }}
            {...(checkout.email === undefined
              ? {}
              : { prefill: { email: checkout.email } })}
            fallback={
              <div className="whop-checkout-modal__loading" role="status">
                <DotsRing />
                <span>
                  {locale === "ko"
                    ? "안전한 결제창을 불러오는 중입니다."
                    : "Loading secure checkout."}
                </span>
              </div>
            }
            onPaymentError={() => setFailedSessionId(checkout.sessionId)}
          />
        </div>

        <footer className="whop-checkout-modal__footer">
          <p className={paymentError ? "is-error" : undefined}>
            {paymentError
              ? locale === "ko"
                ? "결제를 완료하지 못했습니다. 정보를 확인하거나 보안 결제창에서 다시 시도해 주세요."
                : "Payment was not completed. Check your details or retry in secure checkout."
              : locale === "ko"
                ? "결제 정보는 Stocksembly에 저장되지 않습니다."
                : "Stocksembly does not store your payment details."}
          </p>
          <a href={checkout.purchaseUrl} target="_blank" rel="noreferrer">
            {locale === "ko"
              ? "새 창에서 결제하기"
              : "Open checkout in a new tab"}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </footer>
      </section>
    </dialog>,
    document.body,
  );
}
