import { isLocale } from "@economyos/i18n";
import { notFound } from "next/navigation";
import { BehavioralObservatory } from "../_components/behavioral-observatory";
import { behavioralText } from "../_lib/behavioral-copy";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return isLocale(locale) ? { title: `${behavioralText(locale, "title")} — EconomyOS` } : {};
}
export default async function BehavioralPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <BehavioralObservatory locale={locale} />;
}
