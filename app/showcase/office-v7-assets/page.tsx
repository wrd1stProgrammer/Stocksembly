import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfficeV7AssetGallery } from "../../../src/components/research/OfficeV7AssetGallery";
import "../../../src/styles/office-v7-asset-gallery.css";

export const metadata: Metadata = {
  title: "Office v7 asset gallery",
  robots: { index: false, follow: false },
};

export default function OfficeV7AssetGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <OfficeV7AssetGallery />;
}
