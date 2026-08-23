import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/publicInformation/PublicInformationPage", () => ({
  PublicInformationPage: () => null,
}));

import ContactPage, { generateMetadata } from "./page";

describe("contact page route", () => {
  it("renders the contact document and localized metadata", async () => {
    const page = await ContactPage({ searchParams: Promise.resolve({}) });
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ lang: "en" }),
    });

    expect(isValidElement(page)).toBe(true);
    expect(metadata.alternates?.canonical).toBe("/contact?lang=en");
  });
});
