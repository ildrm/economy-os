import "@economyos/design-tokens/tokens.css";
import "../globals.css";
import { LOCALE_METADATA, LOCALES } from "@economyos/i18n";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildLocaleMetadata, resolveRouteLocale } from "../_lib/release";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>): Promise<Metadata> {
  const { locale: candidate } = await params;
  return buildLocaleMetadata(resolveRouteLocale(candidate));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: candidate } = await params;
  const locale = resolveRouteLocale(candidate);
  return (
    <html lang={locale} dir={LOCALE_METADATA[locale].direction}>
      {/* Browser extensions can inject body attributes before hydration (e.g. cz-shortcut-listen).
          Suppression is limited to this element; child hydration checks remain enabled. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
