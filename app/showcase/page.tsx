import type { Metadata } from "next";
import { Showcase } from "@/src/components/Showcase";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

export default function ShowcasePage() {
  return <Showcase />;
}
