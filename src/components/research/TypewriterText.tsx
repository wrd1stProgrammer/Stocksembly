"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "../../research/officeReducedMotion";

type Props = {
  readonly text: string;
};

export function TypewriterText({ text }: Props) {
  const glyphs = Array.from(text);
  const [visibleGlyphs, setVisibleGlyphs] = useState(0);

  useEffect(() => {
    const total = Array.from(text).length;
    if (total === 0 || prefersReducedMotion()) {
      setVisibleGlyphs(total);
      return;
    }
    let visible = 0;
    setVisibleGlyphs(0);
    const interval = window.setInterval(() => {
      visible = Math.min(total, visible + 4);
      setVisibleGlyphs(visible);
      if (visible === total) window.clearInterval(interval);
    }, 16);
    return () => window.clearInterval(interval);
  }, [text]);

  const complete = visibleGlyphs >= glyphs.length;
  return (
    <p className="team-question-panel__typed-answer">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{glyphs.slice(0, visibleGlyphs).join("")}</span>
      {complete ? null : (
        <i className="team-question-panel__typing-cursor" aria-hidden="true" />
      )}
    </p>
  );
}
