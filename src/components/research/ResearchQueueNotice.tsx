"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import type { ResearchQueueStatus } from "../../research/domain/researchExecution";
import "../../styles/research-queue.css";

type Props = {
  readonly locale: Locale;
  readonly queued: boolean;
  readonly queue?: ResearchQueueStatus | undefined;
  readonly onCancel?: () => Promise<void>;
  readonly full?: boolean;
};

export function ResearchQueueNotice({
  locale,
  queued,
  queue,
  onCancel,
  full = false,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [dismissed, setDismissed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [failed, setFailed] = useState(false);
  const ko = locale === "ko";
  const waiting =
    full ||
    (queued &&
      queue !== undefined &&
      queue.position > Math.max(0, queue.capacity - queue.activeRuns));

  useEffect(() => {
    const element = dialog.current;
    if (waiting && !dismissed) {
      if (element !== null && !element.open) element.showModal();
    } else if (element?.open) element.close();
  }, [waiting, dismissed]);

  const cancel = async () => {
    setCancelling(true);
    setFailed(false);
    try {
      await onCancel?.();
    } catch {
      setFailed(true);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      {waiting && !full && dismissed && (
        <button
          className="research-queue-notice"
          type="button"
          onClick={() => setDismissed(false)}
        >
          <Clock3 size={16} aria-hidden="true" />
          {ko
            ? `리서치 대기 ${queue?.position}번째 · 대기열 보기`
            : `Research queue: ${queue?.position} · View queue`}
        </button>
      )}
      <dialog
        ref={dialog}
        className="research-queue-dialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={() => setDismissed(true)}
      >
        <div className="research-queue-dialog__icon">
          <Clock3 size={24} aria-hidden="true" />
        </div>
        <p className="research-queue-dialog__eyebrow">
          {ko ? "리서치 대기열" : "RESEARCH QUEUE"}
        </p>
        <h2 id={titleId}>
          {full
            ? ko
              ? "지금은 대기열이 가득 찼습니다"
              : "The research queue is full"
            : ko
              ? "순서가 되면 자동으로 시작합니다"
              : "Your research will start automatically"}
        </h2>
        <p id={descriptionId}>
          {full
            ? ko
              ? "아직 요청이 접수되지 않았습니다. 잠시 후 다시 시도해 주세요."
              : "Your request has not been added. Please try again shortly."
            : ko
              ? "현재 리서치가 진행 중입니다. 요청을 다시 보내지 않아도 대기 순서에 따라 시작됩니다."
              : "Research is currently in progress. Your request is saved and will start in queue order. There is no need to submit it again."}
        </p>
        {!full && (
          <div
            className="research-queue-dialog__position"
            aria-live="polite"
            aria-atomic="true"
          >
            <span>{ko ? "현재 대기 순서" : "Your place in line"}</span>
            <strong>
              {queue?.position ?? "—"}
              {ko ? "번째" : ""}
            </strong>
          </div>
        )}
        {!full && (
          <p className="research-queue-dialog__detail">
            {ko
              ? "이 창을 닫아도 대기 순서는 유지됩니다."
              : "Closing this window keeps your place in line."}
          </p>
        )}
        {failed && (
          <p role="alert">
            {ko
              ? "대기 취소에 실패했습니다. 다시 시도해 주세요."
              : "Could not cancel. Please try again."}
          </p>
        )}
        <div className="research-queue-dialog__actions">
          {!full && onCancel !== undefined && (
            <button
              type="button"
              className="research-queue-dialog__cancel"
              disabled={cancelling}
              onClick={() => void cancel()}
            >
              {cancelling
                ? ko
                  ? "취소 중…"
                  : "Cancelling…"
                : ko
                  ? "대기 취소"
                  : "Cancel request"}
            </button>
          )}
          <button
            type="button"
            className="research-queue-dialog__keep"
            onClick={() => setDismissed(true)}
          >
            {full
              ? ko
                ? "확인"
                : "Close"
              : ko
                ? "대기 유지"
                : "Keep my place"}
          </button>
        </div>
      </dialog>
    </>
  );
}
