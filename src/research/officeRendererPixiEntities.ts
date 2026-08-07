import { Assets, Container, Sprite, type Texture } from "pixi.js";
import { OFFICE_ENTITY_MANIFEST } from "./officeEntityManifest";
import { OFFICE_SCENE_MANIFEST } from "./officeSceneManifest";

export async function createOfficeSceneEntities(
  world: Container,
): Promise<readonly Container[]> {
  const forumTexture = await Assets.load<Texture>(
    `${OFFICE_SCENE_MANIFEST.assets.entitiesRoot}/evidence-forum.png`,
  );
  forumTexture.source.scaleMode = "linear";
  const entities = OFFICE_ENTITY_MANIFEST.flatMap((entity) => {
    if (entity.kind !== "evidence-forum") return [];
    const root = new Container();
    root.label = entity.id;
    root.position.set(entity.position.x, entity.position.y);
    root.zIndex = entity.zIndex;
    const forum = new Sprite(forumTexture);
    forum.anchor.set(0.5);
    forum.width = entity.size.width;
    forum.height = entity.size.height;
    forum.roundPixels = true;
    root.addChild(forum);
    world.addChild(root);
    return [root];
  });
  return Object.freeze(entities);
}
