// # noqa: SIZE_OK — the assigned calibration surface must remain in its single owned component file.
import Image, { type ImageProps } from "next/image";
import type { CSSProperties } from "react";
import {
  OFFICE_SCENE_MANIFEST,
  type OfficeFacing,
} from "../../research/officeSceneManifest";

const publicRoot = "/research/office-v7";
const directions: readonly OfficeFacing[] = ["down", "left", "right", "up"];
const furnitureKinds = ["chair", "desk", "monitor"] as const;
type SeatLayerName = "actor" | "desk" | "monitor";
type SeatLayerPosition = {
  readonly x: string;
  readonly y: string;
  readonly z: string;
};
type SeatLayerStyle = CSSProperties & {
  readonly "--office-v7-seat-x": string;
  readonly "--office-v7-seat-y": string;
  readonly "--office-v7-seat-z": string;
};

const seatLayoutByFacing = {
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
  Record<SeatLayerName, SeatLayerPosition>
>;
const vacatedChairStyle: SeatLayerStyle = {
  "--office-v7-seat-x": "50%",
  "--office-v7-seat-y": "27px",
  "--office-v7-seat-z": "1",
};

function seatLayerStyle(
  facing: OfficeFacing,
  layer: SeatLayerName,
): SeatLayerStyle {
  const position = seatLayoutByFacing[facing][layer];
  return {
    "--office-v7-seat-x": position.x,
    "--office-v7-seat-y": position.y,
    "--office-v7-seat-z": position.z,
  };
}

function GalleryImage(props: ImageProps) {
  return <Image {...props} loading="eager" unoptimized />;
}

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SpriteFrame({
  actorId,
  actorName,
  column = 0,
  facing,
}: {
  readonly actorId: string;
  readonly actorName: string;
  readonly column?: number;
  readonly facing: OfficeFacing;
}) {
  const row = directions.indexOf(facing);
  return (
    <span
      className={`office-v7-gallery__sprite office-v7-gallery__sprite--row-${row} office-v7-gallery__sprite--column-${column}`}
    >
      <GalleryImage
        alt={`${actorName}, ${facing} frame ${column + 1}`}
        height={768}
        src={`${publicRoot}/agents/${actorId}.png`}
        width={640}
      />
    </span>
  );
}

function ActorCard({
  member,
}: {
  readonly member: (typeof OFFICE_SCENE_MANIFEST.roster)[number];
}) {
  return (
    <article className="office-v7-gallery__card office-v7-gallery__actor-card">
      <header className="office-v7-gallery__card-header">
        <div>
          <p>{member.departmentId}</p>
          <h3>
            {member.name.en} <span lang="ko">{member.name.ko}</span>
          </h3>
        </div>
        <code>{member.id}</code>
      </header>
      <div className="office-v7-gallery__direction-grid">
        {directions.map((facing) => (
          <figure key={facing}>
            <SpriteFrame
              actorId={member.id}
              actorName={member.name.en}
              facing={facing}
            />
            <figcaption>{facing}</figcaption>
          </figure>
        ))}
      </div>
      <div className="office-v7-gallery__walk-row">
        <span>Walk strip</span>
        <span
          className={`office-v7-gallery__walk-strip office-v7-gallery__sprite--row-${directions.indexOf(member.workSeat.facing)}`}
        >
          <GalleryImage
            alt={`${member.name.en}, ${member.workSeat.facing} idle and walk strip`}
            height={768}
            src={`${publicRoot}/agents/${member.id}.png`}
            width={640}
          />
        </span>
      </div>
    </article>
  );
}

function SeatComposite({
  member,
}: {
  readonly member: (typeof OFFICE_SCENE_MANIFEST.roster)[number];
}) {
  const seatRoot = `${publicRoot}/furniture/seats/${member.id}`;
  return (
    <article className="office-v7-gallery__seat-card">
      <header>
        <h3>{member.name.en}</h3>
        <span>{member.workSeat.facing}</span>
      </header>
      <div className="office-v7-gallery__seat-states">
        <figure>
          <div
            className={`office-v7-gallery__seat-stage office-v7-gallery__seat-stage--${member.workSeat.facing}`}
            data-seat-facing={member.workSeat.facing}
          >
            <GalleryImage
              alt={`${member.name.en} department-tinted desk`}
              className="office-v7-gallery__seat-desk"
              data-seat-layer="desk"
              height={128}
              src={`${seatRoot}-desk.png`}
              style={seatLayerStyle(member.workSeat.facing, "desk")}
              width={128}
            />
            <GalleryImage
              alt={`${member.name.en} department-tinted monitor`}
              className="office-v7-gallery__seat-monitor"
              data-seat-layer="monitor"
              height={128}
              src={`${seatRoot}-monitor.png`}
              style={seatLayerStyle(member.workSeat.facing, "monitor")}
              width={128}
            />
            <span
              className="office-v7-gallery__seat-actor"
              data-seat-layer="actor"
              style={seatLayerStyle(member.workSeat.facing, "actor")}
            >
              <SpriteFrame
                actorId={member.id}
                actorName={member.name.en}
                column={3}
                facing={member.workSeat.facing}
              />
            </span>
          </div>
          <figcaption>Occupied · chair hidden</figcaption>
        </figure>
        <figure>
          <div
            className="office-v7-gallery__vacated-stage"
            data-seat-facing={member.workSeat.facing}
          >
            <GalleryImage
              alt={`${member.name.en} vacated ${member.workSeat.facing} chair`}
              data-seat-layer="chair"
              height={128}
              src={`${seatRoot}-chair.png`}
              style={vacatedChairStyle}
              width={128}
            />
          </div>
          <figcaption>Vacated · chair visible</figcaption>
        </figure>
      </div>
    </article>
  );
}

export function OfficeV7AssetGallery() {
  const departmentIds = Object.keys(OFFICE_SCENE_MANIFEST.departments);
  return (
    <main className="office-v7-gallery">
      <header className="office-v7-gallery__hero">
        <div>
          <p>OFFICE ASSET CALIBRATION · V{OFFICE_SCENE_MANIFEST.version}</p>
          <h1>Department office visual system</h1>
        </div>
        <dl>
          <div>
            <dt>World</dt>
            <dd>
              {OFFICE_SCENE_MANIFEST.world.width} ×{" "}
              {OFFICE_SCENE_MANIFEST.world.height}
            </dd>
          </div>
          <div>
            <dt>Roster</dt>
            <dd>{OFFICE_SCENE_MANIFEST.roster.length} actors</dd>
          </div>
          <div>
            <dt>Atlas</dt>
            <dd>4 directions × 4 states</dd>
          </div>
        </dl>
      </header>

      <section
        aria-labelledby="architecture-heading"
        className="office-v7-gallery__section"
      >
        <div className="office-v7-gallery__section-heading">
          <div>
            <p>01 · Architecture</p>
            <h2 id="architecture-heading">Full-bleed 16:9 office base</h2>
          </div>
          <span>
            People, furniture, labels, and forum objects remain separate.
          </span>
        </div>
        <figure className="office-v7-gallery__base-frame">
          <GalleryImage
            alt="Empty v7 department office architecture with four rooms, chair office, corridors, and central forum"
            height={OFFICE_SCENE_MANIFEST.world.height}
            src={`${publicRoot}/base.png`}
            width={OFFICE_SCENE_MANIFEST.world.width}
          />
          <figcaption>
            Logical world · 48 × 27 cells · 40 px per cell
          </figcaption>
        </figure>
      </section>

      <section
        aria-labelledby="portraits-heading"
        className="office-v7-gallery__section"
      >
        <div className="office-v7-gallery__section-heading">
          <div>
            <p>02 · Portraits</p>
            <h2 id="portraits-heading">Complete bilingual roster</h2>
          </div>
          <span>192 × 192 transparent crops</span>
        </div>
        <div className="office-v7-gallery__portrait-grid">
          {OFFICE_SCENE_MANIFEST.roster.map((member) => (
            <article
              key={member.id}
              className="office-v7-gallery__portrait-card"
            >
              <GalleryImage
                alt={`${member.name.en}, ${member.role.en}`}
                height={192}
                src={`${publicRoot}/portraits/${member.id}.png`}
                width={192}
              />
              <div>
                <h3>
                  {member.name.en} <span lang="ko">{member.name.ko}</span>
                </h3>
                <p>{member.role.en}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="actors-heading"
        className="office-v7-gallery__section"
      >
        <div className="office-v7-gallery__section-heading">
          <div>
            <p>03 · Directional atlases</p>
            <h2 id="actors-heading">Common scale, baseline, and row order</h2>
          </div>
          <span>
            Down · left · right · up / idle · walk A · walk B · seated
          </span>
        </div>
        <div className="office-v7-gallery__actor-grid">
          {OFFICE_SCENE_MANIFEST.roster.map((member) => (
            <ActorCard key={member.id} member={member} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="furniture-heading"
        className="office-v7-gallery__section"
      >
        <div className="office-v7-gallery__section-heading">
          <div>
            <p>04 · Furniture</p>
            <h2 id="furniture-heading">Directional object library</h2>
          </div>
          <span>Transparent 128 × 128 layers</span>
        </div>
        <div className="office-v7-gallery__furniture-grid">
          {furnitureKinds.flatMap((kind) =>
            directions.map((facing) => (
              <figure key={`${kind}-${facing}`}>
                <GalleryImage
                  alt={`${facing} facing ${kind}`}
                  height={128}
                  src={`${publicRoot}/furniture/${kind}-${facing}.png`}
                  width={128}
                />
                <figcaption>
                  {titleCase(kind)} · {facing}
                </figcaption>
              </figure>
            )),
          )}
        </div>
      </section>

      <section
        aria-labelledby="seats-heading"
        className="office-v7-gallery__section"
      >
        <div className="office-v7-gallery__section-heading">
          <div>
            <p>05 · Interaction states</p>
            <h2 id="seats-heading">Manifest-facing seat composites</h2>
          </div>
          <span>Occupied desks never render a second chair.</span>
        </div>
        <div className="office-v7-gallery__seat-grid">
          {OFFICE_SCENE_MANIFEST.roster.map((member) => (
            <SeatComposite key={member.id} member={member} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="markers-heading"
        className="office-v7-gallery__section"
      >
        <div className="office-v7-gallery__section-heading">
          <div>
            <p>06 · Wayfinding</p>
            <h2 id="markers-heading">Area and forum markers</h2>
          </div>
          <span>Programmatic overlays remain independent of the base.</span>
        </div>
        <div className="office-v7-gallery__marker-grid">
          {[...departmentIds, "chair"].map((areaId) => (
            <figure key={areaId}>
              <GalleryImage
                alt={`${titleCase(areaId)} area marker`}
                height={48}
                src={`${publicRoot}/furniture/marker-${areaId}.png`}
                width={96}
              />
              <figcaption>{titleCase(areaId)}</figcaption>
            </figure>
          ))}
          <figure>
            <GalleryImage
              alt="Central forum marker"
              height={160}
              src={`${publicRoot}/furniture/forum-marker.png`}
              width={160}
            />
            <figcaption>Forum</figcaption>
          </figure>
        </div>
      </section>
    </main>
  );
}
