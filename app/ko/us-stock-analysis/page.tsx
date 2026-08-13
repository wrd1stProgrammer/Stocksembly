import type { Metadata } from "next";
import { UsStockAnalysisLanding } from "@/src/components/seo/UsStockAnalysisLanding";
import { usStockAnalysisMetadata } from "@/src/lib/seo/usStockAnalysisMetadata";

export const metadata: Metadata = usStockAnalysisMetadata("ko");

export default function KoreanUsStockAnalysisPage() {
  return <UsStockAnalysisLanding locale="ko" />;
}
