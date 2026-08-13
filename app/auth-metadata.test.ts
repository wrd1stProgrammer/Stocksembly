import { describe, expect, it } from "vitest";
import { metadata as callbackMetadata } from "./auth/callback/page";
import { metadata as briefingRoomMetadata } from "./briefing-room/page";
import { metadata as confirmMetadata } from "./confirm/page";
import { metadata as forgotPasswordMetadata } from "./forgot-password/page";
import { metadata as loginMetadata } from "./login/page";
import { generateMetadata as generateResearchMetadata } from "./research/[symbol]/page";
import { metadata as signupMetadata } from "./signup/page";

describe("authentication page metadata", () => {
  it.each([
    ["login", loginMetadata],
    ["signup", signupMetadata],
    ["forgot password", forgotPasswordMetadata],
    ["email confirmation", confirmMetadata],
    ["auth callback", callbackMetadata],
    ["briefing room", briefingRoomMetadata],
  ])("keeps the %s page out of search results", (_page, metadata) => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("keeps private research runs out of search results", async () => {
    const metadata = await generateResearchMetadata({
      params: Promise.resolve({ symbol: "NVDA" }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
