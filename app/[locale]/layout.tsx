import type { ReactNode } from "react";
import { locales } from "@/src/lib/supportedLocales";

export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

import "@/src/styles/editorial.css";
import "@/src/styles/editorial-responsive.css";

export default function LocaleLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return children;
}
