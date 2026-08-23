import type { AppLocale } from "../i18n";
import { copy, intlLocale } from "../i18n";

const SITE_URL = "https://stocksembly.com";
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const APPLICATION_ID = `${SITE_URL}/#application`;

export function homeStructuredData(locale: AppLocale) {
  const content = copy[locale];
  const description = `${content.hero.descriptionLead} ${content.hero.descriptionTail}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: "Stocksembly",
        legalName: "SERN",
        description,
        url: SITE_URL,
        logo: `${SITE_URL}/brand/stocksembly-app-icon.png`,
        email: "kicoa24@gmail.com",
        address: {
          "@type": "PostalAddress",
          streetAddress: "Room 306, 32-4, Banryong-ro 18beon-gil",
          addressCountry: "KR",
        },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "kicoa24@gmail.com",
          availableLanguage: ["English", "Korean"],
          url: `${SITE_URL}/contact?lang=en`,
        },
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: "Stocksembly",
        alternateName: "Stocksembly AI Research",
        description,
        url: SITE_URL,
        inLanguage: intlLocale(locale),
        publisher: { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "SoftwareApplication",
        "@id": APPLICATION_ID,
        name: "Stocksembly",
        description,
        url: SITE_URL,
        applicationCategory: "FinanceApplication",
        applicationSubCategory: "US equity research",
        operatingSystem: "Web",
        browserRequirements: "Requires a modern web browser",
        isAccessibleForFree: true,
        inLanguage: intlLocale(locale),
        provider: { "@id": ORGANIZATION_ID },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free access with optional paid research plans.",
        },
        featureList: [
          "Multi-agent US equity research",
          "Evidence-linked research files",
          "Specialist counterarguments and independent synthesis",
          "Public research catalog after a seven-day publication delay",
        ],
      },
    ],
  } as const;
}

export function serializeStructuredData(value: object): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
