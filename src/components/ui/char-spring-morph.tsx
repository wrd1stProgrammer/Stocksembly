"use client";

import { motion, useSpring, useTransform } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { cn } from "../../lib/cn";

type Token = {
  key: string;
  char: string;
  isAnimatable: boolean;
};

function tokenize(value: string): Token[] {
  let digitPlace = 0;
  const symbols = new Map<string, number>();
  return value
    .split("")
    .map((char, index) => ({
      char,
      index,
      isDigit: /\d/.test(char),
      isLetter: /\p{L}/u.test(char),
    }))
    .reverse()
    .map(({ char, index, isDigit, isLetter }) => {
      if (isDigit) {
        const key = `digit-${digitPlace}`;
        digitPlace += 1;
        return { key, char, isAnimatable: true };
      }
      if (isLetter) return { key: `letter-${index}`, char, isAnimatable: true };
      const seen = symbols.get(char) ?? 0;
      symbols.set(char, seen + 1);
      return { key: `symbol-${char}-${seen}`, char, isAnimatable: false };
    })
    .reverse();
}

function numericValue(value: string): number | undefined {
  const number = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : undefined;
}

function AnimatedChar({
  token,
  animateOnMount,
  animationKey,
  animationDelay,
  direction,
}: {
  readonly token: Token;
  readonly animateOnMount: boolean;
  readonly animationKey: string;
  readonly animationDelay: number;
  readonly direction: "up" | "down";
}) {
  const previousChar = useRef(token.char);
  const previousAnimationKey = useRef(animationKey);
  const isFirst = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const springConfig = { stiffness: 170, damping: 10 };
  const y = useSpring(0, springConfig);
  const opacity = useSpring(1, springConfig);
  const scale = useSpring(1, springConfig);
  const blur = useSpring(0, springConfig);
  const filter = useTransform(blur, (value) => `blur(${value}px)`);

  useLayoutEffect(() => {
    if (!token.isAnimatable) return;
    const changed =
      previousChar.current !== token.char ||
      (animationKey !== "" && previousAnimationKey.current !== animationKey);
    previousChar.current = token.char;
    previousAnimationKey.current = animationKey;

    const settle = () => {
      y.set(0);
      opacity.set(1);
      scale.set(1);
      blur.set(0);
    };
    const enter = () => {
      y.jump(direction === "up" ? 32 : -32);
      opacity.jump(0);
      scale.jump(0.7);
      blur.jump(52);
      if (animationDelay <= 0) settle();
      else timer.current = setTimeout(settle, animationDelay * 1000);
    };

    if (isFirst.current) {
      isFirst.current = false;
      if (animateOnMount) enter();
    } else if (changed) {
      if (timer.current) clearTimeout(timer.current);
      enter();
    }
  }, [
    animationDelay,
    animateOnMount,
    animationKey,
    blur,
    direction,
    opacity,
    scale,
    token,
    y,
  ]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!token.isAnimatable) {
    return (
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
      >
        {token.char}
      </motion.span>
    );
  }

  return (
    <motion.span
      layout
      className="relative inline-grid place-items-center"
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
    >
      <motion.span style={{ opacity, scale, filter, y }}>
        {token.char}
      </motion.span>
    </motion.span>
  );
}

export function CharSpringMorph({
  value,
  gap = 2,
  className,
  staggerDelay = 0.04,
  direction,
  animateOnMount = false,
}: {
  readonly value: string;
  readonly gap?: number;
  readonly className?: string;
  readonly staggerDelay?: number;
  readonly direction?: "up" | "down";
  readonly animateOnMount?: boolean;
}) {
  const hasMounted = useRef(false);
  const previousValue = useRef(value);
  const tokens = useMemo(() => tokenize(value), [value]);
  const previousTokens = new Map(
    tokenize(previousValue.current).map((token) => [token.key, token]),
  );
  const delays = new Map<string, number>();
  let order = 0;
  for (const token of tokens) {
    const previous = previousTokens.get(token.key);
    if (
      token.isAnimatable &&
      ((animateOnMount && !hasMounted.current) ||
        (hasMounted.current &&
          (previous === undefined || previous.char !== token.char)))
    ) {
      delays.set(token.key, order);
      order += 1;
    }
  }

  const nextNumber = numericValue(value);
  const previousNumber = numericValue(previousValue.current);
  const enterDirection: "up" | "down" =
    direction ??
    (nextNumber !== undefined &&
    previousNumber !== undefined &&
    nextNumber < previousNumber
      ? "down"
      : "up");

  useEffect(() => {
    hasMounted.current = true;
    previousValue.current = value;
  }, [value]);

  return (
    <motion.span
      layout
      className={cn("inline-flex items-center tabular-nums", className)}
      style={{ gap }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
    >
      {tokens.map((token) => (
        <AnimatedChar
          key={token.key}
          token={token}
          animateOnMount={animateOnMount}
          animationKey={delays.has(token.key) ? value : ""}
          animationDelay={(delays.get(token.key) ?? 0) * staggerDelay}
          direction={enterDirection}
        />
      ))}
    </motion.span>
  );
}
