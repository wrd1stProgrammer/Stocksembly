"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "../../lib/i18n";
import { CreditShortageModal } from "../billing/CreditShortageModal";

export function ResearchRoomCreditGate({
  reportId,
  locale,
  remaining,
  required,
  allowed,
}: {
  readonly reportId: string;
  readonly locale: Locale;
  readonly remaining: number;
  readonly required: number;
  readonly allowed: boolean;
}) {
  const router = useRouter();
  const [credit, setCredit] = useState({ remaining, required, allowed });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/research-room/${reportId}/credit`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("ACCESS_FAILED");
      const result = (await response.json()) as typeof credit & {
        authenticated: boolean;
      };
      if (!result.authenticated) {
        router.refresh();
        return;
      }
      if (result.allowed) router.refresh();
      else setCredit(result);
    } catch {
      setError(
        locale === "ko"
          ? "열람하지 못했습니다. 다시 시도해 주세요."
          : "Could not open this report. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <CreditShortageModal
      locale={locale}
      open
      {...credit}
      busy={busy}
      {...(error ? { error } : {})}
      onClose={() => router.push(`/research-room?lang=${locale}`)}
      {...(credit.allowed ? { onConfirm: () => void confirm() } : {})}
    />
  );
}
