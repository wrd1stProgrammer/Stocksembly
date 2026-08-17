"use client";

import { BellRing, House, LibraryBig } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "../lib/i18n";

export type MobileBottomNavItem = "home" | "research-room" | "briefing-room";

type Props = {
  readonly activeItem: MobileBottomNavItem;
  readonly locale: Locale;
  readonly hidden?: boolean;
};

const labels = {
  ko: {
    home: "홈",
    researchRoom: "리서치룸",
    briefingRoom: "브리핑룸",
    navigation: "주요 화면 이동",
  },
  en: {
    home: "Home",
    researchRoom: "Research room",
    briefingRoom: "Briefing room",
    navigation: "Primary navigation",
  },
} as const;

function readScrollPosition(): number {
  return Math.max(
    window.scrollY,
    document.documentElement.scrollTop,
    document.body.scrollTop,
  );
}

export function MobileBottomNav({ activeItem, locale, hidden = false }: Props) {
  const [compact, setCompact] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const lastScrollPosition = useRef(0);
  const frame = useRef<number | null>(null);
  const copy = labels[locale];

  useEffect(() => {
    lastScrollPosition.current = readScrollPosition();

    const handleScroll = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        const currentPosition = readScrollPosition();
        const delta = currentPosition - lastScrollPosition.current;

        if (delta > 6 && currentPosition > 36) {
          setCompact(true);
        } else if (delta < -6) {
          setCompact(false);
        }
        lastScrollPosition.current = currentPosition;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, []);

  useEffect(() => {
    const isTextEntry = (target: EventTarget | null): boolean =>
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        ![
          "button",
          "checkbox",
          "color",
          "file",
          "radio",
          "range",
          "reset",
          "submit",
        ].includes(target.type)) ||
      (target instanceof HTMLElement && target.isContentEditable);
    const handleFocusIn = (event: FocusEvent) =>
      setKeyboardOpen(isTextEntry(event.target));
    const handleFocusOut = (event: FocusEvent) =>
      setKeyboardOpen(isTextEntry(event.relatedTarget));

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  if (hidden) return null;

  const items = [
    {
      id: "home" as const,
      href: `/?lang=${locale}#product`,
      label: copy.home,
      Icon: House,
    },
    {
      id: "research-room" as const,
      href: `/research-room?lang=${locale}`,
      label: copy.researchRoom,
      Icon: LibraryBig,
    },
    {
      id: "briefing-room" as const,
      href: `/briefing-room?lang=${locale}`,
      label: copy.briefingRoom,
      Icon: BellRing,
    },
  ];

  return (
    <nav
      className="mobile-bottom-nav"
      data-compact={compact ? "true" : "false"}
      data-keyboard-open={keyboardOpen ? "true" : undefined}
      aria-label={copy.navigation}
    >
      {items.map(({ id, href, label, Icon }) => {
        const active = id === activeItem;
        return (
          <Link
            className={`mobile-bottom-nav__item${active ? " is-active" : ""}`}
            href={href}
            key={id}
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
