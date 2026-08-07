import { describe, expect, it } from "vitest";
import {
  conversationRoleFor,
  officeVisualPoseFor,
  sharesPhysicalConversationSpace,
} from "./officeAgentVisualState";

describe("office agent visual state", () => {
  it("keeps a remote conversation participant seated at a work seat", () => {
    expect(
      officeVisualPoseFor({
        action: "seated-work",
        atWorkSeat: true,
        conversationRole: "listener",
      }),
    ).toBe("seated-listen");
  });

  it("only treats nearby actors in one room as a physical conversation", () => {
    expect(
      sharesPhysicalConversationSpace({ x: 12, y: 10 }, { x: 14, y: 10 }),
    ).toBe(true);
    expect(
      sharesPhysicalConversationSpace({ x: 14, y: 10 }, { x: 31, y: 10 }),
    ).toBe(false);
  });

  it("derives speaker and listener roles without changing semantic actions", () => {
    const conversation = {
      speakerId: "market" as const,
      participantIds: ["market", "company"] as const,
    };
    expect(conversationRoleFor("market", conversation)).toBe("speaker");
    expect(conversationRoleFor("company", conversation)).toBe("listener");
    expect(conversationRoleFor("risk", conversation)).toBeNull();
  });
});
