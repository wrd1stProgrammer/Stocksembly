import { ArrowUp, LoaderCircle } from "lucide-react";
import type { KeyboardEventHandler, ReactNode } from "react";
import { useId } from "react";
import { RESEARCH_DIRECTION_MAX_CHARACTERS } from "../research/domain/researchDirection";
import { LiveCaretInput } from "./live-caret-input";

type BorderBeamProps = {
  readonly children: ReactNode;
  readonly active: boolean;
  readonly size: "pulse-outside";
  readonly colorVariant: "colorful";
};

export function BorderBeam({
  children,
  active,
  size,
  colorVariant,
}: BorderBeamProps) {
  return (
    <div
      className="border-beam-card"
      data-active={active || undefined}
      data-border-beam={size}
      data-color-variant={colorVariant}
    >
      {children}
    </div>
  );
}

type SearchFieldProps = {
  readonly value: string;
  readonly label: string;
  readonly placeholder: string;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
  readonly onKeyDown: KeyboardEventHandler<HTMLInputElement>;
};

export function SearchField(props: SearchFieldProps) {
  const id = useId();
  return (
    <label
      className="search-field"
      data-invalid={props.invalid || undefined}
      htmlFor={id}
    >
      <span className="composer-field__label">{props.label}</span>
      <LiveCaretInput
        className="search-field__live-input"
        fieldClassName="search-field__mirror"
        id={id}
        type="search"
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        aria-invalid={props.invalid}
        aria-label={props.label}
        cursorVariant="line"
        charAnimation="spring"
        color="var(--color-accent-bright)"
        onChange={props.onChange}
        onKeyDown={props.onKeyDown}
      />
    </label>
  );
}

type ResearchQuestionFieldProps = {
  readonly value: string;
  readonly label: string;
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
};

export function ResearchQuestionField(props: ResearchQuestionFieldProps) {
  const id = useId();
  return (
    <label className="research-question-field" htmlFor={id}>
      <span className="composer-field__label">{props.label}</span>
      <LiveCaretInput
        className="research-question-field__live-input"
        fieldClassName="research-question-field__mirror"
        multiline
        id={id}
        value={props.value}
        aria-label={props.label}
        placeholder={props.placeholder}
        disabled={props.disabled}
        maxLength={RESEARCH_DIRECTION_MAX_CHARACTERS}
        rows={1}
        cursorVariant="line"
        charAnimation="spring"
        color="var(--color-accent-bright)"
        onChange={props.onChange}
      />
      <small aria-live="polite">
        {Array.from(props.value).length}/{RESEARCH_DIRECTION_MAX_CHARACTERS}
      </small>
    </label>
  );
}

type ResearchButtonProps = {
  readonly label: string;
  readonly loadingLabel: string;
  readonly disabled: boolean;
  readonly loading: boolean;
};

export function ResearchButton({
  label,
  loadingLabel,
  disabled,
  loading,
}: ResearchButtonProps) {
  return (
    <button
      className="research-button"
      type="submit"
      disabled={disabled}
      aria-busy={loading}
    >
      <span className="research-button__lights" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="research-button__surface" aria-hidden="true" />
      <span className="research-button__content">
        <span className="research-button__label">
          {loading ? loadingLabel : label}
        </span>
        {loading ? (
          <LoaderCircle className="spin" aria-hidden="true" size={20} />
        ) : (
          <ArrowUp aria-hidden="true" size={22} strokeWidth={2.2} />
        )}
      </span>
    </button>
  );
}

type TickerChipProps = {
  readonly symbol: string;
  readonly selected: boolean;
  readonly onSelect: (symbol: string) => void;
};

export function TickerChip({ symbol, selected, onSelect }: TickerChipProps) {
  return (
    <button
      className="ticker-chip"
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(symbol)}
    >
      {symbol}
    </button>
  );
}
