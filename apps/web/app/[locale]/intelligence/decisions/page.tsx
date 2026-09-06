import { isLocale } from "@economyos/i18n";
import { notFound } from "next/navigation";
import { DecisionRoom } from "../_components/decision-room";
import { decisionText } from "../_lib/decision-copy";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return isLocale(locale) ? { title: `${decisionText(locale, "title")} — EconomyOS` } : {};
}
export default async function DecisionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <DecisionRoom locale={locale} />;
}
