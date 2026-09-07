"use client";

import { useCallback, useEffect, useState } from "react";
import "./local-home-preview.css";

type PreviewMode = "signed-in" | "signed-out" | null;
const STORAGE_KEY = "stocksembly:local-home-preview";

export function useLocalHomePreview() {
  const [available, setAvailable] = useState(false);
  const [mode, setMode] = useState<PreviewMode>(null);
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "development" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
    )
      return;
    setAvailable(true);
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored === "signed-in" || stored === "signed-out") setMode(stored);
  }, []);
  const changeMode = useCallback(
    (next: PreviewMode) => {
      if (!available) return;
      setMode(next);
      if (next === null) window.sessionStorage.removeItem(STORAGE_KEY);
      else window.sessionStorage.setItem(STORAGE_KEY, next);
    },
    [available],
  );
  return { available, mode, changeMode };
}

export function LocalHomePreviewToggle({
  signedIn,
  overridden,
  onChange,
  onReset,
}: {
  readonly signedIn: boolean;
  readonly overridden: boolean;
  readonly onChange: (signedIn: boolean) => void;
  readonly onReset: () => void;
}) {
  return (
    <aside className="local-home-preview" aria-label="로컬 홈 미리보기">
      <div>
        <strong>LOCAL PREVIEW</strong>
        <span>홈 화면만 전환</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={signedIn}
        aria-label="로그인 상태 미리보기"
        onClick={() => onChange(!signedIn)}
      >
        <span className="local-home-preview__track" aria-hidden="true">
          <span />
        </span>
        {signedIn ? "로그인" : "비로그인"}
      </button>
      {overridden ? (
        <button
          type="button"
          className="local-home-preview__reset"
          onClick={onReset}
        >
          실제 세션
        </button>
      ) : null}
    </aside>
  );
}
