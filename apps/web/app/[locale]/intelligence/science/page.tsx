import { isLocale } from "@economyos/i18n";
import { notFound } from "next/navigation";
import { ScientificEvidence } from "../_components/scientific-evidence";
import { publicLanguage } from "../_lib/public-copy";
import { buildScienceModels } from "../_lib/science-models";

export const metadata = { title: "Scientific evidence — EconomyOS" };

export default async function SciencePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <main
      id="main-content"
      className="intelligenceMain publicMain"
      tabIndex={-1}
      lang={publicLanguage(locale)}
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      {locale !== "en" && locale !== "fa" ? (
        <p className="translationNote" lang="en">
          Navigation is localized. Scientific explanations are currently available in English and
          Persian.
        </p>
      ) : null}
      <ScientificEvidence locale={locale} models={buildScienceModels()} />
    </main>
  );
}
