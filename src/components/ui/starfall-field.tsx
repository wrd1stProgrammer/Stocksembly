"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/src/lib/cn";
import { prefersReducedMotion } from "@/src/research/officeReducedMotion";

const GLOW_SPRITE_SIZE = 64;

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  baseOpacity: number;
  mass: number;
  glow: number;
  glowVelocity: number;
}

interface StarfallFieldProps {
  /** Number of seeded stars [Optional, default: 75] */
  starsCount?: number;
  /** Max star radius in px [Optional, default: 2] */
  starsSize?: number;
  starsOpacity?: number;
  starsColor?: string;
  /** Shadow blur multiplier under the cursor [Optional, default: 15] */
  glowIntensity?: number;
  /** How the glow eases toward its target [Optional, default: "ease"] */
  glowAnimation?: "instant" | "ease" | "spring";
  movementSpeed?: number;
  /** Cursor influence radius in px [Optional, default: 100] */
  mouseInfluence?: number;
  mouseGravity?: "attract" | "repel";
  gravityStrength?: number;
  /** Listen on the page so a background layer can react without blocking UI. */
  globalPointerEvents?: boolean;
  className?: string;
}

/**
 * A small canvas star field for dark surfaces. Stars drift on a damped random
 * walk, react to the cursor, and pause their simulation when off-screen.
 */
export function StarfallFieldBackground({
  starsCount = 75,
  starsSize = 2,
  starsOpacity = 0.75,
  starsColor = "#f4f4f5",
  glowIntensity = 15,
  glowAnimation = "ease",
  movementSpeed = 0.3,
  mouseInfluence = 100,
  mouseGravity = "attract",
  gravityStrength = 75,
  globalPointerEvents = false,
  className,
}: StarfallFieldProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const starsRef = useRef<Star[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const visibleRef = useRef(true);
  const capRef = useRef(Math.max(80, starsCount));
  const [dpr, setDpr] = useState(1);
  const sizeRef = useRef({ width: 800, height: 600 });
  const spriteRef = useRef<HTMLCanvasElement | null>(null);

  const makeStar = useCallback(
    (x: number, y: number, speed: number, glow = 1): Star => {
      const angle = Math.random() * Math.PI * 2;
      return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * starsSize + 1,
        opacity: starsOpacity,
        baseOpacity: starsOpacity,
        mass: 0.5 * Math.random() + 0.5,
        glow,
        glowVelocity: 0,
      };
    },
    [starsSize, starsOpacity],
  );

  const seed = useCallback(
    (width: number, height: number) => {
      starsRef.current = Array.from({ length: starsCount }, () =>
        makeStar(
          Math.random() * width,
          Math.random() * height,
          movementSpeed * (0.5 + 0.5 * Math.random()),
        ),
      );
    },
    [makeStar, movementSpeed, starsCount],
  );

  const spawn = useCallback(
    (x: number, y: number, count = 4) => {
      const burst = Array.from({ length: count }, () =>
        makeStar(x, y, 2 + Math.random(), 2),
      );
      const next = [...starsRef.current, ...burst];
      starsRef.current =
        next.length > capRef.current
          ? next.slice(next.length - capRef.current)
          : next;
    },
    [makeStar],
  );

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const rect = host.getBoundingClientRect();
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    setDpr(ratio);
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    sizeRef.current = { width: rect.width, height: rect.height };
    if (starsRef.current.length === 0) seed(rect.width, rect.height);
  }, [seed]);

  const step = useCallback(() => {
    const { width, height } = sizeRef.current;
    const mouse = mouseRef.current;
    for (const star of starsRef.current) {
      const dx = mouse.x - star.x;
      const dy = mouse.y - star.y;
      const distance = Math.hypot(dx, dy);

      if (distance < mouseInfluence && distance > 0) {
        const force = (mouseInfluence - distance) / mouseInfluence;
        const acceleration = 0.001 * gravityStrength * force;
        const sign = mouseGravity === "repel" ? -1 : 1;
        star.vx += (dx / distance) * acceleration * sign;
        star.vy += (dy / distance) * acceleration * sign;
        star.opacity = Math.min(1, star.baseOpacity + 0.4 * force);
        const target = 1 + 2 * force;
        if (glowAnimation === "instant") star.glow = target;
        else if (glowAnimation === "ease") {
          star.glow += (target - star.glow) * 0.15;
        } else {
          star.glowVelocity =
            0.85 * star.glowVelocity + (target - star.glow) * 0.2;
          star.glow += star.glowVelocity;
        }
      } else {
        star.opacity = Math.max(0.3 * star.baseOpacity, star.opacity - 0.02);
        if (glowAnimation === "instant") star.glow = 1;
        else if (glowAnimation === "ease") {
          star.glow = Math.max(1, star.glow + (1 - star.glow) * 0.08);
        } else {
          star.glowVelocity = 0.9 * star.glowVelocity + (1 - star.glow) * 0.15;
          star.glow = Math.max(1, star.glow + star.glowVelocity);
        }
      }

      star.x += star.vx;
      star.y += star.vy;
      star.vx += (Math.random() - 0.5) * 0.001;
      star.vy += (Math.random() - 0.5) * 0.001;
      star.vx *= 0.999;
      star.vy *= 0.999;
      if (star.x < 0) star.x = width;
      if (star.x > width) star.x = 0;
      if (star.y < 0) star.y = height;
      if (star.y > height) star.y = 0;
    }
  }, [glowAnimation, gravityStrength, mouseGravity, mouseInfluence]);

  // One radial glow sprite replaces a per-star `shadowBlur`, which is the most
  // expensive 2D canvas operation and used to run 220 times per frame.
  const glowSprite = useCallback(() => {
    if (spriteRef.current) return spriteRef.current;
    const sprite = document.createElement("canvas");
    sprite.width = GLOW_SPRITE_SIZE;
    sprite.height = GLOW_SPRITE_SIZE;
    const context = sprite.getContext("2d");
    if (!context) return null;
    const half = GLOW_SPRITE_SIZE / 2;
    const gradient = context.createRadialGradient(
      half,
      half,
      0,
      half,
      half,
      half,
    );
    gradient.addColorStop(0, starsColor);
    gradient.addColorStop(0.18, starsColor);
    gradient.addColorStop(
      0.45,
      `color-mix(in srgb, ${starsColor} 28%, transparent)`,
    );
    gradient.addColorStop(
      1,
      `color-mix(in srgb, ${starsColor} 0%, transparent)`,
    );
    context.fillStyle = gradient;
    context.fillRect(0, 0, GLOW_SPRITE_SIZE, GLOW_SPRITE_SIZE);
    spriteRef.current = sprite;
    return sprite;
  }, [starsColor]);

  useEffect(() => {
    spriteRef.current = null;
  }, [glowSprite]);

  const draw = useCallback(
    (context: CanvasRenderingContext2D) => {
      context.clearRect(0, 0, context.canvas.width, context.canvas.height);
      const sprite = glowSprite();
      if (!sprite) return;
      for (const star of starsRef.current) {
        // The sprite's core matches the old solid dot; its halo scales with the
        // former blur radius so hover glow still swells.
        const radius = (star.size + glowIntensity * star.glow * 0.35) * dpr;
        context.globalAlpha = star.opacity;
        context.drawImage(
          sprite,
          star.x * dpr - radius,
          star.y * dpr - radius,
          radius * 2,
          radius * 2,
        );
      }
      context.globalAlpha = 1;
    },
    [dpr, glowIntensity, glowSprite],
  );

  useEffect(() => {
    if (
      typeof ResizeObserver === "undefined" ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    resizeCanvas();
    const host = hostRef.current;
    const resizeObserver = new ResizeObserver(resizeCanvas);
    if (host) resizeObserver.observe(host);
    const reducedMotion = prefersReducedMotion();

    // The loop only runs while the field is on screen and the tab is visible;
    // otherwise no frame is scheduled at all.
    const loop = () => {
      rafRef.current = null;
      const context = canvasRef.current?.getContext("2d");
      if (!context || !visibleRef.current || document.hidden) return;
      step();
      draw(context);
      if (!reducedMotion) rafRef.current = requestAnimationFrame(loop);
    };
    const schedule = () => {
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(loop);
    };
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry?.isIntersecting ?? false;
        if (visibleRef.current) schedule();
      },
      { threshold: 0 },
    );
    if (host) intersectionObserver.observe(host);
    const handleVisibility = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    schedule();

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [draw, resizeCanvas, step]);

  const track = useCallback((clientX: number, clientY: number) => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const resetPointer = useCallback(() => {
    mouseRef.current = { x: -9999, y: -9999 };
  }, []);

  useEffect(() => {
    if (!globalPointerEvents) return;

    const handlePointerMove = (event: PointerEvent) => {
      track(event.clientX, event.clientY);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const rect = hostRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      spawn(x, y);
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerdown", handlePointerDown, {
      passive: true,
    });
    window.addEventListener("blur", resetPointer);
    document.addEventListener("mouseleave", resetPointer);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("blur", resetPointer);
      document.removeEventListener("mouseleave", resetPointer);
    };
  }, [globalPointerEvents, resetPointer, spawn, track]);

  return (
    <div
      ref={hostRef}
      className={cn("relative size-full overflow-hidden", className)}
      role="application"
      aria-label="Interactive star field"
      onMouseMove={(event) => track(event.clientX, event.clientY)}
      onTouchMove={(event) => {
        const touch = event.touches[0];
        if (touch) track(touch.clientX, touch.clientY);
      }}
      onClick={(event) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) spawn(event.clientX - rect.left, event.clientY - rect.top);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) spawn(rect.width / 2, rect.height / 2);
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
