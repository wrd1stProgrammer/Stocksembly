import type { Metadata } from "next";
import { OfficeMotionCatalog } from "../../../src/components/research/OfficeMotionCatalog";

// Unlinked QA surface: reachable by URL only, not from site navigation.
export const metadata: Metadata = {
  title: "Office motion catalog · Stocksembly",
  robots: { index: false, follow: false },
};

export default function OfficeMotionCatalogPage() {
  return <OfficeMotionCatalog />;
}
