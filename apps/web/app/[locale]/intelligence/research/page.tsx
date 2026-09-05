import { BEHAVIORAL_THEORIES } from "@economyos/behavioral-economics";
import { isLocale } from "@economyos/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { researchCopy } from "../_lib/research-copy";
import { ResearchClient } from "./research-client";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { title: `${researchCopy(locale).title} — EconomyOS` } : {};
}

export default async function ResearchPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const theories = BEHAVIORAL_THEORIES.map((theory) => ({
    id: theory.id,
    name: theory.name,
    authors: [...theory.authors],
    description: theory.description,
    implementation: theory.implementation,
    boundaryConditions: [...theory.boundaryConditions],
  }));
  return <ResearchClient locale={locale} theories={theories} />;
}
