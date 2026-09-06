import type { Locale } from "@economyos/i18n";
import { behavioralText } from "./behavioral-copy";
import { decisionText } from "./decision-copy";
import { PUBLIC_DATA } from "./public-economy";

export function publicLanguage(locale: Locale): "en" | "fa" {
  return locale === "fa" ? "fa" : "en";
}

export function words(locale: Locale, en: string, fa: string): string {
  return publicLanguage(locale) === "fa" ? fa : en;
}

export const PUBLIC_NAV = [
  "overview",
  "countries",
  "compare",
  "decisions",
  "behavioral",
  "concepts",
  "science",
  "lab",
  "sources",
] as const;
export type PublicView = (typeof PUBLIC_NAV)[number] | "country";

const navLabels: Record<Locale, readonly string[]> = {
  en: ["Overview", "Countries", "Compare", "Explore concepts", "What-if lab", "Sources & methods"],
  fa: ["نمای کلی", "کشورها", "مقایسه", "شناخت مفاهیم", "آزمایشگاه سناریو", "منابع و روش‌ها"],
  ar: [
    "نظرة عامة",
    "البلدان",
    "مقارنة",
    "استكشف المفاهيم",
    "مختبر السيناريوهات",
    "المصادر والأساليب",
  ],
  de: [
    "Überblick",
    "Länder",
    "Vergleichen",
    "Begriffe erkunden",
    "Szenario-Labor",
    "Quellen & Methoden",
  ],
  fr: [
    "Vue d’ensemble",
    "Pays",
    "Comparer",
    "Explorer les concepts",
    "Laboratoire de scénarios",
    "Sources et méthodes",
  ],
  "zh-Hans": ["概览", "国家", "比较", "探索概念", "情景实验室", "来源与方法"],
  ru: [
    "Обзор",
    "Страны",
    "Сравнение",
    "Экономические понятия",
    "Лаборатория сценариев",
    "Источники и методы",
  ],
  es: [
    "Resumen",
    "Países",
    "Comparar",
    "Explorar conceptos",
    "Laboratorio de escenarios",
    "Fuentes y métodos",
  ],
  pt: [
    "Visão geral",
    "Países",
    "Comparar",
    "Explorar conceitos",
    "Laboratório de cenários",
    "Fontes e métodos",
  ],
  hi: ["अवलोकन", "देश", "तुलना", "अवधारणाएँ समझें", "परिदृश्य प्रयोगशाला", "स्रोत और विधियाँ"],
  hy: [
    "Ընդհանուր պատկեր",
    "Երկրներ",
    "Համեմատել",
    "Ուսումնասիրել հասկացությունները",
    "Սցենարների լաբորատորիա",
    "Աղբյուրներ և մեթոդներ",
  ],
  tr: [
    "Genel bakış",
    "Ülkeler",
    "Karşılaştır",
    "Kavramları keşfet",
    "Senaryo laboratuvarı",
    "Kaynaklar ve yöntemler",
  ],
};

export function publicNavLabel(locale: Locale, view: (typeof PUBLIC_NAV)[number]): string {
  if (view === "science") return scienceLabels[locale];
  if (view === "decisions") return decisionText(locale, "title");
  if (view === "behavioral") return behavioralText(locale, "title");
  const index = PUBLIC_NAV.filter(
    (item) => item !== "science" && item !== "decisions" && item !== "behavioral",
  ).indexOf(view);
  return navLabels[locale][index] ?? view;
}

export function publicHref(locale: Locale, view: PublicView): string {
  const root = `/${locale}/intelligence`;
  if (
    view === "countries" ||
    view === "compare" ||
    view === "science" ||
    view === "decisions" ||
    view === "behavioral"
  )
    return `${root}/${view}`;
  if (view === "lab") return `${root}/research`;
  return `${root}/global${view === "overview" ? "" : `?view=${view}`}`;
}

const scienceLabels: Record<Locale, string> = {
  en: "Scientific evidence",
  fa: "شواهد علمی",
  ar: "الأدلة العلمية",
  de: "Wissenschaftliche Evidenz",
  fr: "Données scientifiques",
  "zh-Hans": "科学证据",
  ru: "Научные данные",
  es: "Evidencia científica",
  pt: "Evidências científicas",
  hi: "वैज्ञानिक साक्ष्य",
  hy: "Գիտական տվյալներ",
  tr: "Bilimsel kanıtlar",
};

export const COUNTRIES: readonly (readonly [string, string])[] = PUBLIC_DATA.countries.map(
  (country) => [country.code, country.region] as const,
);

export function countryName(locale: Locale, code: string): string {
  return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
}
