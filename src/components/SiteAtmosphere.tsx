"use client";

import { StarfallFieldBackground } from "./ui/starfall-field";

export function SiteAtmosphere() {
  return (
    <div className="atmosphere" aria-hidden="true">
      <StarfallFieldBackground
        className="atmosphere__starfall"
        starsCount={220}
        starsSize={1.7}
        starsOpacity={0.82}
        starsColor="#f4f4f5"
        glowIntensity={11}
        movementSpeed={0.16}
        mouseInfluence={140}
        gravityStrength={44}
        globalPointerEvents
      />
    </div>
  );
}
