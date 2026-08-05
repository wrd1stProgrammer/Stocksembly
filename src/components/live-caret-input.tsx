"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "../lib/cn";

interface CursorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type CursorState =
  | { type: "hidden" }
  | { type: "caret"; rect: CursorRect }
  | { type: "selection"; rects: CursorRect[] };

export type CharAnimation =
  | "spring"
  | "bounce"
  | "fade"
  | "slide"
  | "wave"
  | "typewriter";

export type CursorVariant = "line" | "block" | "underline" | "glow";

export type InputVariant =
  | "default"
  | "ghost"
  | "outline"
  | "filled"
  | "terminal"
  | "minimal"
  | "pill";

type CharAnimDef = {
  initial: Record<string, number>;
  animate: Record<string, number>;
  exit: Record<string, number>;
  transition: Record<string, unknown>;
};

const CHAR_ANIMATION_MAP: Record<CharAnimation, CharAnimDef> = {
  spring: {
    initial: { opacity: 0, scale: 0.5, y: 6 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.5, y: -6 },
    transition: { type: "spring", stiffness: 500, damping: 22, mass: 0.4 },
  },
  bounce: {
    initial: { opacity: 0, scale: 0.2, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.2, y: -10 },
    transition: { type: "spring", stiffness: 700, damping: 12, mass: 0.3 },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { type: "tween", duration: 0.15, ease: "easeOut" },
  },
  slide: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
    transition: { type: "spring", stiffness: 400, damping: 28 },
  },
  wave: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { type: "spring", stiffness: 450, damping: 24 },
  },
  typewriter: {
    initial: { opacity: 1 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0 },
  },
};

const INPUT_VARIANT_CLASSES: Record<InputVariant, string> = {
  default:
    "rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-500",
  ghost:
    "rounded-xl bg-neutral-900/40 px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-500",
  outline:
    "rounded-xl border border-neutral-600 bg-transparent px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-500",
  filled:
    "rounded-xl bg-neutral-800 px-4 py-3 text-base text-neutral-100 placeholder:text-neutral-500",
  terminal:
    "rounded-md border border-green-900 bg-neutral-950 px-4 py-3 text-sm font-mono text-green-400 placeholder:text-green-900",
  minimal:
    "rounded-none border-b border-neutral-700 bg-transparent px-1 py-2 text-base text-neutral-100 placeholder:text-neutral-500",
  pill: "rounded-full border border-neutral-800 bg-neutral-900/60 px-5 py-3 text-base text-neutral-100 placeholder:text-neutral-500",
};

function measureNativeField(
  field: HTMLInputElement | HTMLTextAreaElement,
  container: HTMLElement,
): CursorState {
  const { selectionStart: ss, selectionEnd: se } = field;
  if (ss === null || se === null) return { type: "hidden" };

  const isTextarea = field.tagName.toLowerCase() === "textarea";
  const fieldRect = field.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const cs = window.getComputedStyle(field);
  const mirror = document.createElement("div");
  Object.assign(mirror.style, {
    position: "fixed",
    top: `${fieldRect.top}px`,
    left: `${fieldRect.left}px`,
    width: `${fieldRect.width}px`,
    height: `${fieldRect.height}px`,
    visibility: "hidden",
    pointerEvents: "none",
    overflow: "hidden",
    whiteSpace: isTextarea ? "pre-wrap" : "pre",
    wordBreak: isTextarea ? "break-word" : "normal",
    overflowWrap: isTextarea ? "break-word" : "normal",
    boxSizing: cs.boxSizing,
    padding: cs.padding,
    border: cs.border,
    font: cs.font,
    fontSize: cs.fontSize,
    fontFamily: cs.fontFamily,
    fontWeight: cs.fontWeight,
    letterSpacing: cs.letterSpacing,
    lineHeight: cs.lineHeight,
    tabSize: cs.tabSize,
  } as Partial<CSSStyleDeclaration>);

  const value = field.value;
  const before = document.createElement("span");
  before.textContent = value.slice(0, ss);
  const middle = document.createElement("span");
  middle.textContent = ss === se ? "\u200b" : value.slice(ss, se);
  const after = document.createElement("span");
  after.textContent = value.slice(se);
  mirror.append(before, middle, after);
  document.body.appendChild(mirror);
  mirror.scrollTop = field.scrollTop;
  mirror.scrollLeft = field.scrollLeft;
  const middleRects = Array.from(middle.getClientRects());
  document.body.removeChild(mirror);

  if (middleRects.length === 0) return { type: "hidden" };
  if (ss === se) {
    const r = middleRects[middleRects.length - 1];
    if (!r) return { type: "hidden" };
    return {
      type: "caret",
      rect: {
        x: r.left - containerRect.left,
        y: r.top - containerRect.top,
        width: 0,
        height: r.height,
      },
    };
  }

  return {
    type: "selection",
    rects: middleRects
      .filter((r) => r.width > 0)
      .map((r) => ({
        x: r.left - containerRect.left,
        y: r.top - containerRect.top,
        width: r.width,
        height: r.height,
      })),
  };
}

const CARET_SPRING = {
  type: "spring",
  stiffness: 600,
  damping: 20,
  mass: 0.3,
} as const;
const SELECTION_SPRING = {
  type: "spring",
  stiffness: 600,
  damping: 25,
  mass: 0.3,
} as const;
const MOTION_CONFIG_SPRING = {
  type: "spring",
  stiffness: 600,
  damping: 45,
} as const;

const SELECTION_POOL_SIZE = 50;
const SELECTION_KEYS = Array.from(
  { length: SELECTION_POOL_SIZE },
  (_, index) => `selection-slot-${index}`,
);

function CursorOverlay({
  state,
  focused,
  color,
  caretWidth,
  radius,
  variant,
  blinkSpeed,
}: {
  state: CursorState;
  focused: boolean;
  color: string;
  caretWidth: number;
  radius: number;
  variant: CursorVariant;
  blinkSpeed: number;
}) {
  const blinkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blinkVisibleRef = useRef(true);
  const caretRef = useRef<HTMLDivElement>(null);
  const isCaret = focused && state.type === "caret";
  const isSelection = focused && state.type === "selection";

  const applyBlink = useCallback(
    (visible: boolean) => {
      blinkVisibleRef.current = visible;
      const node = caretRef.current;
      if (node) node.style.opacity = isCaret && visible ? "1" : "0";
    },
    [isCaret],
  );

  useEffect(() => {
    if (blinkTimerRef.current) clearInterval(blinkTimerRef.current);
    blinkTimerRef.current = null;
    applyBlink(true);
    if (isCaret) {
      blinkTimerRef.current = setInterval(
        () => applyBlink(!blinkVisibleRef.current),
        blinkSpeed,
      );
    }
    return () => {
      if (blinkTimerRef.current) clearInterval(blinkTimerRef.current);
    };
  }, [isCaret, applyBlink, blinkSpeed]);

  const caretRect = state.type === "caret" ? state.rect : null;
  const selectionRects = state.type === "selection" ? state.rects : [];
  const geometry = (() => {
    const rect = caretRect ?? selectionRects[0];
    if (!rect) return { x: 0, y: 0, width: caretWidth, height: 0 };
    if (variant === "block") {
      return { x: rect.x, y: rect.y, width: 9, height: rect.height };
    }
    if (variant === "underline") {
      return {
        x: rect.x - 2,
        y: rect.y + rect.height - 2,
        width: 10,
        height: 2,
      };
    }
    return {
      x: rect.x,
      y: rect.y,
      width: caretWidth,
      height: rect.height,
    };
  })();
  const glowStyle =
    variant === "glow" ? { boxShadow: `0 0 6px 2px ${color}` } : {};

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <motion.div
        ref={caretRef}
        className="absolute left-0 top-0 origin-left"
        style={{ backgroundColor: color, borderRadius: radius, ...glowStyle }}
        animate={{
          x: geometry.x,
          y: geometry.y,
          width: geometry.width,
          height: geometry.height,
          opacity: isCaret ? 1 : 0,
        }}
        transition={CARET_SPRING}
      />
      {SELECTION_KEYS.map((key, index) => {
        const rect = selectionRects[index];
        return (
          <motion.div
            key={key}
            className="absolute left-0 top-0 origin-left"
            style={{ backgroundColor: color, borderRadius: radius }}
            animate={{
              x: rect?.x ?? caretRect?.x ?? 0,
              y: rect?.y ?? caretRect?.y ?? 0,
              width: rect?.width ?? 0,
              height: rect?.height ?? caretRect?.height ?? 0,
              opacity: isSelection && rect ? 0.28 : 0,
            }}
            transition={SELECTION_SPRING}
          />
        );
      })}
    </div>
  );
}

type CharEntry = { id: string; char: string };
let uidCounter = 0;
function uid() {
  uidCounter += 1;
  return `live-caret-${uidCounter}`;
}

function reconcileChars(previous: CharEntry[], nextValue: string): CharEntry[] {
  const result: CharEntry[] = [];
  let previousIndex = 0;
  let nextIndex = 0;
  while (nextIndex < nextValue.length) {
    const previousEntry = previous[previousIndex];
    if (
      previousEntry !== undefined &&
      previousEntry.char === nextValue[nextIndex]
    ) {
      result.push(previousEntry);
      previousIndex += 1;
      nextIndex += 1;
      continue;
    }
    const foundIndex = previous.findIndex(
      (entry, index) =>
        index > previousIndex && entry.char === nextValue[nextIndex],
    );
    if (foundIndex !== -1) {
      previousIndex = foundIndex;
      continue;
    }
    result.push({ id: uid(), char: nextValue[nextIndex] ?? "" });
    nextIndex += 1;
  }
  return result;
}

const LAYOUT_CLASS_PREFIXES = [
  "p-",
  "px-",
  "py-",
  "pt-",
  "pb-",
  "pl-",
  "pr-",
  "text-",
  "font-",
  "leading-",
  "tracking-",
  "tab-",
  "whitespace-",
  "break-",
  "overflow-wrap",
];

function extractLayoutClasses(className: string) {
  return className
    .split(/\s+/)
    .filter((classToken) =>
      LAYOUT_CLASS_PREFIXES.some((prefix) => classToken.startsWith(prefix)),
    )
    .join(" ");
}

export interface LiveCaretInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "value" | "defaultValue"
  > {
  color?: string;
  caretWidth?: number;
  radius?: number;
  cursorVariant?: CursorVariant;
  blinkSpeed?: number;
  charAnimation?: CharAnimation;
  inputVariant?: InputVariant;
  className?: string;
  fieldClassName?: string;
  multiline?: boolean;
  value?: string;
  defaultValue?: string;
  rows?: number;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export const LiveCaretInput = function LiveCaretInput({
  ref,
  color = "hsl(220, 100%, 60%)",
  caretWidth = 2,
  radius = 2,
  cursorVariant = "line",
  blinkSpeed = 530,
  charAnimation = "spring",
  inputVariant,
  className,
  fieldClassName = "",
  multiline = false,
  placeholder,
  value: controlledValue,
  defaultValue = "",
  onChange,
  ...nativeProps
}: LiveCaretInputProps & { ref?: React.Ref<HTMLDivElement> }) {
  const isControlled = controlledValue !== undefined;
  const instanceId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [cursorState, setCursorState] = useState<CursorState>({
    type: "hidden",
  });
  const [focused, setFocused] = useState(false);
  const [chars, setChars] = useState<CharEntry[]>(() =>
    (isControlled ? (controlledValue ?? "") : defaultValue)
      .split("")
      .map((char) => ({ id: uid(), char })),
  );
  const charsRef = useRef(chars);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!isControlled) return;
    const nextValue = controlledValue ?? "";
    const currentValue = charsRef.current.map((entry) => entry.char).join("");
    if (nextValue === currentValue) return;
    const nextChars = reconcileChars(charsRef.current, nextValue);
    charsRef.current = nextChars;
    setChars(nextChars);
  }, [controlledValue, isControlled]);

  const measure = useCallback(() => {
    if (!fieldRef.current || !wrapperRef.current) return;
    setCursorState(measureNativeField(fieldRef.current, wrapperRef.current));
  }, []);
  const schedule = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextChars = reconcileChars(charsRef.current, event.target.value);
      charsRef.current = nextChars;
      setChars(nextChars);
      schedule();
      onChange?.(event.target.value);
    },
    [onChange, schedule],
  );

  const variantBase = inputVariant ? INPUT_VARIANT_CLASSES[inputVariant] : "";
  const resolvedFieldClass = cn(variantBase, fieldClassName);
  const fieldProps = {
    ref: fieldRef,
    ...(isControlled ? { value: controlledValue } : { defaultValue }),
    style: {
      caretColor: "transparent",
      color: "transparent",
    } as React.CSSProperties,
    className: cn(
      "absolute inset-0 h-full w-full resize-none bg-transparent outline-none",
      extractLayoutClasses(resolvedFieldClass),
    ),
    onFocus: () => {
      setFocused(true);
      schedule();
    },
    onBlur: () => {
      setFocused(false);
      setCursorState({ type: "hidden" });
    },
    onKeyUp: schedule,
    onMouseUp: schedule,
    onMouseMove: (event: React.MouseEvent) => {
      if (event.buttons === 1) schedule();
    },
    onSelect: schedule,
    onChange: handleChange,
    placeholder,
    ...nativeProps,
  };

  const setWrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <MotionConfig transition={MOTION_CONFIG_SPRING}>
      <style>{`[data-lci="${instanceId}"]::selection,[data-lci="${instanceId}"]::-moz-selection{background:transparent;color:transparent;}[data-lci="${instanceId}"]::placeholder{color:transparent;}`}</style>
      <div ref={setWrapperRef} className={cn("relative", className)}>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none w-full select-none",
            multiline
              ? "whitespace-pre-wrap wrap-break-word"
              : "whitespace-pre overflow-hidden",
            resolvedFieldClass,
          )}
        >
          {chars.length === 0 && placeholder ? (
            <span className="text-zinc-500 opacity-50">{placeholder}</span>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {chars.map((entry, index) => {
                const preset = CHAR_ANIMATION_MAP[charAnimation];
                const waveDelay =
                  charAnimation === "wave" ? { delay: index * 0.018 } : {};
                return (
                  <motion.span
                    key={entry.id}
                    layout
                    layoutId={entry.id}
                    initial={preset.initial}
                    animate={preset.animate}
                    exit={preset.exit}
                    transition={{ ...preset.transition, ...waveDelay }}
                    className="inline-block whitespace-pre"
                    style={{ transformOrigin: "bottom center" }}
                  >
                    {entry.char}
                  </motion.span>
                );
              })}
            </AnimatePresence>
          )}
        </div>
        {multiline ? (
          <textarea
            data-lci={instanceId}
            {...(fieldProps as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            data-lci={instanceId}
            type="text"
            {...(fieldProps as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
        <CursorOverlay
          state={cursorState}
          focused={focused}
          color={color}
          caretWidth={caretWidth}
          radius={radius}
          variant={cursorVariant}
          blinkSpeed={blinkSpeed}
        />
      </div>
    </MotionConfig>
  );
};
