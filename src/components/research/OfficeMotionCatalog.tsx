"use client";

import { useEffect, useRef, useState } from "react";
import type {
  OfficeMotionCatalogController,
  WalkCycleMode,
} from "../../research/officeMotionCatalogScene";
import { OFFICE_SCENE_MANIFEST } from "../../research/officeSceneManifest";

const SCALES = [
  { label: "제품 배율 0.53", value: 0.53 },
  { label: "원본 1×", value: 1 },
  { label: "확대 1.5×", value: 1.5 },
] as const;

export function OfficeMotionCatalog() {
  const hostRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<OfficeMotionCatalogController | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(0.53);
  const [walkCycle, setWalkCycle] = useState<WalkCycleMode>("legacy");
  const [animationSpeed, setAnimationSpeed] = useState(0.15);
  const [moveSpeed, setMoveSpeed] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const abort = new AbortController();
    void import("../../research/officeMotionCatalogScene")
      .then(({ createOfficeMotionCatalog }) =>
        createOfficeMotionCatalog({
          host,
          locale: "ko",
          signal: abort.signal,
          stickyTop: () => controlsRef.current?.offsetHeight ?? 0,
        }),
      )
      .then((controller) => {
        if (abort.signal.aborted) {
          controller.destroy();
          return;
        }
        controllerRef.current = controller;
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (abort.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      abort.abort();
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setScale(scale);
  }, [scale]);
  useEffect(() => {
    controllerRef.current?.setWalkCycle(walkCycle);
  }, [walkCycle]);
  useEffect(() => {
    controllerRef.current?.setAnimationSpeed(animationSpeed);
  }, [animationSpeed]);
  useEffect(() => {
    controllerRef.current?.setMoveSpeed(moveSpeed);
  }, [moveSpeed]);

  return (
    <main
      style={{
        background: "#1f2329",
        color: "#e8eaed",
        fontFamily: "Pretendard, sans-serif",
        minHeight: "100vh",
        padding: "20px 24px 40px",
      }}
    >
      <div
        ref={controlsRef}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#1f2329",
          borderBottom: "1px solid #343a44",
          margin: "0 -24px 14px",
          padding: "12px 24px 10px",
        }}
      >
        <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>
          오피스 캐릭터 모션 카탈로그 (office-v9 · 실제 Pixi 런타임)
        </h1>
        <p style={{ fontSize: 12, color: "#9aa3ad", margin: "0 0 10px" }}>
          런타임이 구분하는 모션은 서 있기 · 앉기 · 걷기 × 4방향뿐입니다 (talk /
          listen / present 등은 idle 또는 sit 프레임으로 매핑). 걷기 줄은 위가
          애니메이션, 아래가 그 사이클의 프레임 순서. 오른쪽 트랙은 신호를 주면
          → ↓ ← ↑ 순서로 한 바퀴 돌고 정면(down)으로 멈춥니다.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          <button
            type="button"
            onClick={() => controllerRef.current?.signal()}
            disabled={!ready}
            style={buttonStyle(true)}
          >
            전체 신호 (시계방향)
          </button>
          <button
            type="button"
            onClick={() => controllerRef.current?.stop()}
            disabled={!ready}
            style={buttonStyle(false)}
          >
            전체 정지
          </button>
          <label style={labelStyle}>
            걷기 사이클
            <select
              value={walkCycle}
              onChange={(event) =>
                setWalkCycle(event.target.value as WalkCycleMode)
              }
              style={selectStyle}
            >
              <option value="stride">제안 — 보폭 A/B만 [1,2]</option>
              <option value="legacy">런타임 현재 — idle 포함 [0,1,2,1]</option>
            </select>
          </label>
          <label style={labelStyle}>
            배율
            <select
              value={scale}
              onChange={(event) => setScale(Number(event.target.value))}
              style={selectStyle}
            >
              {SCALES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            프레임 속도 {animationSpeed.toFixed(2)}
            <input
              type="range"
              min={0.03}
              max={0.3}
              step={0.01}
              value={animationSpeed}
              onChange={(event) =>
                setAnimationSpeed(Number(event.target.value))
              }
            />
          </label>
          <label style={labelStyle}>
            이동 속도 ×{moveSpeed.toFixed(2)}
            <input
              type="range"
              min={0.1}
              max={2}
              step={0.05}
              value={moveSpeed}
              onChange={(event) => setMoveSpeed(Number(event.target.value))}
            />
          </label>
        </div>
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12 }}
        >
          {OFFICE_SCENE_MANIFEST.roster.map((member) => (
            <button
              key={member.id}
              type="button"
              disabled={!ready}
              onClick={() => controllerRef.current?.signal(member.id)}
              style={buttonStyle(false)}
            >
              {member.name.ko} 신호
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p role="alert" style={{ color: "#ff8a80" }}>
          렌더러를 불러오지 못했습니다: {error}
        </p>
      ) : null}
      {!ready && !error ? (
        <p style={{ color: "#9aa3ad", fontSize: 13 }}>
          스프라이트를 불러오는 중…
        </p>
      ) : null}
      <div
        ref={hostRef}
        data-motion-catalog-ready={ready ? "true" : "false"}
        style={{ borderRadius: 8 }}
      />
    </main>
  );
}

function buttonStyle(primary: boolean): React.CSSProperties {
  return {
    background: primary ? "#3b82f6" : "#343a44",
    border: "1px solid #4a5260",
    borderRadius: 6,
    color: "#f2f3f5",
    cursor: "pointer",
    font: "inherit",
    padding: "6px 12px",
  };
}

const labelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#c7cdd4",
};

const selectStyle: React.CSSProperties = {
  background: "#343a44",
  border: "1px solid #4a5260",
  borderRadius: 6,
  color: "#f2f3f5",
  font: "inherit",
  padding: "4px 8px",
};
