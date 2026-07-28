import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfficeV7AssetGallery } from "../../../src/components/research/OfficeV7AssetGallery";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeFacing,
} from "../../../src/research/officeSceneManifest";
import OfficeV7AssetGalleryPage from "./page";

const seatLayers = ["desk", "monitor", "actor"] as const;
const expectedSeatLayout = {
  up: {
    desk: { x: "50%", y: "48px", z: "3" },
    monitor: { x: "50%", y: "6px", z: "1" },
    actor: { x: "50%", y: "28px", z: "2" },
  },
  down: {
    desk: { x: "50%", y: "58px", z: "3" },
    monitor: { x: "50%", y: "40px", z: "2" },
    actor: { x: "50%", y: "12px", z: "1" },
  },
  left: {
    desk: { x: "44%", y: "35px", z: "2" },
    monitor: { x: "29%", y: "29px", z: "1" },
    actor: { x: "65%", y: "45px", z: "3" },
  },
  right: {
    desk: { x: "56%", y: "35px", z: "2" },
    monitor: { x: "71%", y: "29px", z: "1" },
    actor: { x: "35%", y: "45px", z: "3" },
  },
} as const satisfies Record<
  OfficeFacing,
  Record<(typeof seatLayers)[number], { x: string; y: string; z: string }>
>;

describe("office v7 asset gallery route", () => {
  it("installs an isolated route backed by the canonical manifest", () => {
    // Given
    const actorCount = `${OFFICE_SCENE_MANIFEST.roster.length} actors`;

    // When
    render(<OfficeV7AssetGalleryPage />);

    // Then
    expect(
      screen.getByRole("heading", { name: "Department office visual system" }),
    ).toBeInTheDocument();
    expect(screen.getByText(actorCount)).toBeInTheDocument();
  });

  it("routes every gallery font size through a named research typography token", () => {
    // Given
    const stylesheet = readFileSync(
      resolve(process.cwd(), "src/styles/office-v7-asset-gallery.css"),
      "utf8",
    );

    // When
    const fontSizes = Array.from(
      stylesheet.matchAll(/font-size:\s*([^;]+);/g),
      (match) => match[1]?.trim(),
    ).filter((value): value is string => value !== undefined);
    const offContractValues = fontSizes.filter(
      (value) => !/^var\(--research-type-[a-z0-9-]+\)$/.test(value),
    );

    // Then
    expect(fontSizes.length).toBeGreaterThan(0);
    expect(offContractValues).toEqual([]);
  });

  it("renders every generated public asset path for browser decode inspection", () => {
    // Given
    const root = "/research/office-v7";
    const directions = ["down", "left", "right", "up"];
    const furnitureKinds = ["chair", "desk", "monitor"];
    const expectedPaths = [
      `${root}/base.png`,
      ...OFFICE_SCENE_MANIFEST.roster.flatMap((member) => [
        `${root}/agents/${member.id}.png`,
        `${root}/portraits/${member.id}.png`,
        ...furnitureKinds.map(
          (kind) => `${root}/furniture/seats/${member.id}-${kind}.png`,
        ),
      ]),
      ...furnitureKinds.flatMap((kind) =>
        directions.map((facing) => `${root}/furniture/${kind}-${facing}.png`),
      ),
      ...Object.keys(OFFICE_SCENE_MANIFEST.departments).map(
        (departmentId) => `${root}/furniture/marker-${departmentId}.png`,
      ),
      `${root}/furniture/marker-chair.png`,
      `${root}/furniture/forum-marker.png`,
    ];

    // When
    render(<OfficeV7AssetGallery />);
    const renderedPaths = new Set(
      screen
        .getAllByRole("img")
        .map((image) => image.getAttribute("src"))
        .filter((value): value is string => value !== null),
    );

    // Then
    expect(expectedPaths).toHaveLength(74);
    expect([...renderedPaths].sort()).toEqual([...expectedPaths].sort());
  });

  it("keeps every occupied and vacated seat on its manifest-facing spatial contract", () => {
    // Given
    render(<OfficeV7AssetGallery />);
    const facingSignatures = new Map<OfficeFacing, string>();

    for (const member of OFFICE_SCENE_MANIFEST.roster) {
      const card = screen
        .getByRole("heading", { name: member.name.en })
        .closest(".office-v7-gallery__seat-card");
      const stage = card?.querySelector(".office-v7-gallery__seat-stage");
      const vacatedStage = card?.querySelector(
        ".office-v7-gallery__vacated-stage",
      );
      if (
        !(stage instanceof HTMLElement) ||
        !(vacatedStage instanceof HTMLElement)
      ) {
        throw new TypeError(`Missing seat stages for ${member.id}`);
      }
      const vacatedChair = vacatedStage.querySelector('img[alt*="chair"]');
      if (!(vacatedChair instanceof HTMLElement)) {
        throw new TypeError(`Missing vacated chair for ${member.id}`);
      }

      // When
      const signature = seatLayers
        .map((layer) => {
          const element = stage.querySelector(
            `.office-v7-gallery__seat-${layer}`,
          );
          if (!(element instanceof HTMLElement)) {
            throw new TypeError(`Missing ${layer} layer for ${member.id}`);
          }
          const expected = expectedSeatLayout[member.seat.facing][layer];
          const actual = {
            x: element.style.getPropertyValue("--office-v7-seat-x"),
            y: element.style.getPropertyValue("--office-v7-seat-y"),
            z: element.style.getPropertyValue("--office-v7-seat-z"),
          };

          // Then
          expect(actual.x).toBe(expected.x);
          expect(actual.y).toBe(expected.y);
          expect(actual.z).toBe(expected.z);
          return `${actual.x}/${actual.y}/${actual.z}`;
        })
        .join("|");

      expect(stage).toHaveAttribute("data-seat-facing", member.seat.facing);
      expect(vacatedStage).toHaveAttribute(
        "data-seat-facing",
        member.seat.facing,
      );
      expect(stage.querySelectorAll('img[alt*="chair"]')).toHaveLength(0);
      expect(vacatedChair).toHaveAttribute(
        "src",
        `/research/office-v7/furniture/seats/${member.id}-chair.png`,
      );
      expect(vacatedChair.style.getPropertyValue("--office-v7-seat-x")).toBe(
        "50%",
      );
      expect(vacatedChair.style.getPropertyValue("--office-v7-seat-y")).toBe(
        "27px",
      );
      expect(vacatedChair.style.getPropertyValue("--office-v7-seat-z")).toBe(
        "1",
      );
      facingSignatures.set(member.seat.facing, signature);
    }

    const authoredFacings = new Set(
      OFFICE_SCENE_MANIFEST.roster.map((member) => member.seat.facing),
    );
    expect(facingSignatures.size).toBe(authoredFacings.size);
    expect(new Set(facingSignatures.values()).size).toBe(authoredFacings.size);
  });
});
