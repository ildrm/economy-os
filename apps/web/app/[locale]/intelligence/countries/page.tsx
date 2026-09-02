import { isLocale, type Locale } from "@economyos/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { workbenchCopy } from "../_lib/copy";
import { GlobalClient } from "../global/global-client";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: `${workbenchCopy(locale).countriesTitle} — EconomyOS` };
}

export default async function CountriesPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <GlobalClient locale={locale as Locale} directoryMode />;
}
