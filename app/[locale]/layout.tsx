import type { ReactNode } from "react";
import "@/src/styles/editorial.css";
import "@/src/styles/editorial-responsive.css";

export default function LocaleLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return children;
}
