import {
  ArrowRight,
  CheckCircle,
  Files,
  Question,
} from "@phosphor-icons/react";
import type { Locale } from "../../lib/i18n";

type Props = {
  readonly locale: Locale;
  readonly complete: boolean;
  readonly sourceCount?: number;
  readonly ledgerCount?: number;
  readonly onViewReport: () => void;
};

export function EvidenceSummary({
  locale,
  complete,
  sourceCount = complete ? 47 : 31,
  ledgerCount = complete ? 19 : 12,
  onViewReport,
}: Props) {
  const isKo = locale === "ko";
  return (
    <footer className="evidence-summary" id="evidence">
      <div>
        <Files size={20} weight="duotone" />
        <span>{isKo ? "검토 출처" : "Sources reviewed"}</span>
        <strong>{sourceCount}</strong>
      </div>
      <div>
        <CheckCircle size={20} weight="duotone" />
        <span>{isKo ? "검증된 주장" : "Claims verified"}</span>
        <strong>{complete ? "19 / 22" : `${ledgerCount} / 22`}</strong>
      </div>
      <div>
        <Question size={20} weight="duotone" />
        <span>{isKo ? "미해결 질문" : "Open questions"}</span>
        <strong>3</strong>
      </div>
      <button type="button" disabled={!complete} onClick={onViewReport}>
        {complete
          ? isKo
            ? "최종 리포트 보기"
            : "View research file"
          : isKo
            ? "위원회 진행 중"
            : "Committee in progress"}
        <ArrowRight size={18} />
      </button>
    </footer>
  );
}
