import { notFound } from "next/navigation";
import { ResearchProgressPreview } from "@/src/components/research/ResearchProgressPreview";

export default function ResearchProgressPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ResearchProgressPreview />;
}
