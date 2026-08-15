"use client";

import { BorderBeam } from "border-beam";
import type { ReactNode } from "react";
import { useState } from "react";

export function EditorialCardFrame({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  return (
    <BorderBeam
      className="editorial-card__beam"
      size="pulse-outside"
      colorVariant="mono"
      active={active}
      strength={0.82}
      borderRadius={12}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onPointerDown={() => setActive(true)}
    >
      {children}
    </BorderBeam>
  );
}
