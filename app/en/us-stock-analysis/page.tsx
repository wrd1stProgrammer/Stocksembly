import type { Metadata } from "next";
import { UsStockAnalysisLanding } from "@/src/components/seo/UsStockAnalysisLanding";
import { usStockAnalysisMetadata } from "@/src/lib/seo/usStockAnalysisMetadata";

export const metadata: Metadata = usStockAnalysisMetadata("en");

export default function EnglishUsStockAnalysisPage() {
  return <UsStockAnalysisLanding locale="en" />;
}
