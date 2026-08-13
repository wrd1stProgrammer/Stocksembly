import { describe, expect, it } from "vitest";
import { generateMetadata } from "./page";

const languages = {
  ko: "/research-room",
  en: "/research-room?lang=en",
  "x-default": "/research-room",
};

describe("research room archive metadata", () => {
  it("uses Korean metadata by default", async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        title: "미국 주식 AI 리서치룸",
        alternates: { canonical: "/research-room", languages },
        openGraph: expect.objectContaining({
          locale: "ko_KR",
          alternateLocale: "en_US",
          url: "/research-room",
        }),
      }),
    );
  });

  it("uses English metadata for lang=en", async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ lang: "en" }),
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        title: "US Stock AI Research Room",
        alternates: { canonical: "/research-room?lang=en", languages },
        openGraph: expect.objectContaining({
          locale: "en_US",
          alternateLocale: "ko_KR",
          url: "/research-room?lang=en",
        }),
      }),
    );
  });

  it("gives page two its own crawlable canonical and language alternates", async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ lang: "en", page: "2" }),
    });

    expect(metadata).toEqual(
      expect.objectContaining({
        title: "US Stock AI Research Room - Page 2",
        alternates: {
          canonical: "/research-room?lang=en&page=2",
          languages: {
            ko: "/research-room?page=2",
            en: "/research-room?lang=en&page=2",
            "x-default": "/research-room?page=2",
          },
        },
        openGraph: expect.objectContaining({
          url: "/research-room?lang=en&page=2",
        }),
      }),
    );
  });
});
