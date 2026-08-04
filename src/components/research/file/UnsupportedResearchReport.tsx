import { WarningCircle } from "@phosphor-icons/react";
import type { Locale } from "../../../lib/i18n";

export function UnsupportedResearchReport({
  locale,
}: {
  readonly locale: Locale;
}) {
  const ko = locale === "ko";
  return (
    <section className="completed-research-file">
      <div
        className="research-report-unsupported"
        data-report-surface="unsupported"
        role="alert"
        aria-live="assertive"
      >
        <WarningCircle size={28} aria-hidden="true" />
        <div>
          <h1>
            {ko ? "지원하지 않는 리서치 보고서" : "Unsupported research report"}
          </h1>
          <p>
            {ko
              ? "보고서 대상 정보가 올바르지 않아 내용을 표시하지 않았습니다. 새로고침하거나 보고서를 다시 생성해 주세요."
              : "The report target is invalid, so no research content was displayed. Refresh or regenerate the report."}
          </p>
        </div>
      </div>
    </section>
  );
}
