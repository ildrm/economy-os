import { isLocale, type Locale } from "@economyos/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { workbenchCopy } from "../../_lib/copy";
import { CountryClient } from "./country-client";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string; countryCode: string }>;
}): Promise<Metadata> {
  const { locale, countryCode } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${countryCode} · ${workbenchCopy(locale).countriesTitle} — EconomyOS` };
}

export default async function CountryPage({
  params,
}: {
  readonly params: Promise<{ locale: string; countryCode: string }>;
}) {
  const { locale, countryCode } = await params;
  if (!isLocale(locale) || countryCode.length < 2 || countryCode.length > 16) notFound();
  return <CountryClient locale={locale as Locale} countryCode={countryCode} />;
}
