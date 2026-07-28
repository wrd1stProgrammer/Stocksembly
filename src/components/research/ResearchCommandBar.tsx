import {
  ArrowLeft,
  Pause,
  Play,
  Repeat,
  SkipForward,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { Locale } from "../../lib/i18n";
import type { PhaseLabels } from "../../research/compositions/types";
import type { ResearchCompany, ResearchPlayback } from "../../research/types";
import { Brand } from "../Brand";
import { LanguageToggle } from "../LanguageToggle";

type Props = {
  readonly company: ResearchCompany;
  readonly phaseLabels: PhaseLabels;
  readonly locale: Locale;
  readonly playback: ResearchPlayback;
  readonly onLocaleChange: (locale: Locale) => void;
};

export function ResearchCommandBar({
  company,
  phaseLabels,
  locale,
  playback,
  onLocaleChange,
}: Props) {
  const elapsedSeconds = Math.floor(playback.elapsedMs / 1000);
  const elapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(
    elapsedSeconds % 60,
  ).padStart(2, "0")}`;
  const labels =
    locale === "ko"
      ? {
          back: "홈으로",
          pause: "일시정지",
          resume: "계속하기",
          replay: "다시 보기",
          skip: "완료로 이동",
        }
      : {
          back: "Home",
          pause: "Pause",
          resume: "Resume",
          replay: "Replay",
          skip: "Skip to result",
        };

  return (
    <header
      className="research-command"
      data-research-tick={playback.tick}
      data-research-beat={playback.beatId}
      data-research-complete={playback.isComplete ? "true" : "false"}
    >
      <div className="research-command__brand">
        <Brand locale={locale} />
        <span aria-hidden="true" />
        <strong>{company.symbol}</strong>
      </div>
      <div className="research-command__status" aria-live="polite">
        <i className={playback.isPaused ? "is-paused" : ""} />
        <div>
          <span>
            {playback.isComplete
              ? locale === "ko"
                ? "리서치 완료"
                : "Research complete"
              : playback.current.summary[locale]}
          </span>
          <small className="research-command__metrics">
            <span>
              {phaseLabels[playback.current.phase][locale].toUpperCase()}
            </span>
            <span>{playback.current.progress}%</span>
            <span>{elapsed}</span>
          </small>
        </div>
        <progress max={100} value={playback.current.progress}>
          {playback.current.progress}%
        </progress>
      </div>
      <div className="research-command__actions">
        {playback.isComplete ? (
          <button
            type="button"
            onClick={playback.replay}
            aria-label={labels.replay}
          >
            <Repeat size={18} />
            <span>{labels.replay}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={playback.isPaused ? playback.resume : playback.pause}
              aria-label={playback.isPaused ? labels.resume : labels.pause}
            >
              {playback.isPaused ? (
                <Play size={18} weight="fill" />
              ) : (
                <Pause size={18} weight="fill" />
              )}
              <span>{playback.isPaused ? labels.resume : labels.pause}</span>
            </button>
            <button
              type="button"
              onClick={playback.completeNow}
              aria-label={labels.skip}
            >
              <SkipForward size={18} />
              <span className="research-command__optional">{labels.skip}</span>
            </button>
          </>
        )}
        <LanguageToggle locale={locale} onChange={onLocaleChange} />
        <Link href="/" aria-label={labels.back}>
          <ArrowLeft size={18} />
        </Link>
      </div>
    </header>
  );
}
