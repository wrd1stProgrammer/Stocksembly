import { describe, expect, it } from "vitest";
import { OFFICE_SCENE_MANIFEST } from "../officeSceneManifest";
import {
  WORKFLOW_V1_ATTRIBUTION_ALIASES,
  WORKFLOW_V1_ROLE_ALIASES,
} from "./roleAliases";
import { WORKFLOW_V1_ROLE_REGISTRY } from "./roleRegistry";

describe("WorkflowV1 role aliases", () => {
  it("covers every canonical role ID and exact bilingual scene name", () => {
    // Given
    const aliasEntries = Object.entries(WORKFLOW_V1_ROLE_ALIASES);
    const canonicalRoleIds = WORKFLOW_V1_ROLE_REGISTRY.roles.map(
      (role) => role.id,
    );
    const sceneRoleIds = OFFICE_SCENE_MANIFEST.roster.map((role) => role.id);

    // When / Then
    expect(aliasEntries.map(([roleId]) => roleId)).toEqual(canonicalRoleIds);
    expect(sceneRoleIds).toEqual(canonicalRoleIds);
    for (const [roleId, aliases] of aliasEntries) {
      const sceneRole = OFFICE_SCENE_MANIFEST.roster.find(
        (role) => role.id === roleId,
      );
      if (sceneRole === undefined)
        throw new TypeError(`missing scene role ${roleId}`);
      expect(aliases).toEqual(
        expect.arrayContaining([roleId, sceneRole.name.en, sceneRole.name.ko]),
      );
    }
  });

  it("limits attribution aliases to personas and unmistakable role IDs", () => {
    // Given
    const attributionEntries = Object.entries(WORKFLOW_V1_ATTRIBUTION_ALIASES);

    // When / Then
    expect(attributionEntries.map(([roleId]) => roleId)).toEqual(
      WORKFLOW_V1_ROLE_REGISTRY.roles.map((role) => role.id),
    );
    for (const role of WORKFLOW_V1_ROLE_REGISTRY.roles) {
      const roleId = role.id;
      const aliases = WORKFLOW_V1_ATTRIBUTION_ALIASES[roleId];
      const sceneRole = OFFICE_SCENE_MANIFEST.roster.find(
        (role) => role.id === roleId,
      );
      if (sceneRole === undefined)
        throw new TypeError(`missing scene role ${roleId}`);
      expect(aliases).toEqual(
        expect.arrayContaining([sceneRole.name.en, sceneRole.name.ko]),
      );
      expect(
        aliases.every((alias) =>
          WORKFLOW_V1_ROLE_ALIASES[roleId].some(
            (fullAlias) => fullAlias === alias,
          ),
        ),
      ).toBe(true);
      expect(aliases.some((alias) => alias === roleId)).toBe(
        roleId.includes("_"),
      );
    }
  });
});
