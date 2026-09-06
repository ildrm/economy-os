"use client";

import type { Locale } from "@economyos/i18n";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CONCEPTS, conceptText, METHOD_SOURCES, TOPICS } from "../_lib/concepts";
import { publicHref, words } from "../_lib/public-copy";

export function ConceptExplorer({ locale }: { locale: Locale }) {
  const search = useSearchParams();
  const topic = TOPICS.find((item) => item.id === search.get("topic"));
  const selected = CONCEPTS.find((item) => item.id === search.get("concept"));
  const items = selected
    ? [selected]
    : topic
      ? CONCEPTS.filter((item) => item.topic === topic.id)
      : CONCEPTS;
  const w = (en: string, fa: string) => words(locale, en, fa);
  const base = publicHref(locale, "concepts");
  return (
    <>
      <header className="publicHeader">
        <h1>
          {selected
            ? conceptText(locale, selected.name)
            : topic
              ? conceptText(locale, topic.name)
              : w("Big ideas. Clear explanations.", "ایده‌های بزرگ، توضیح‌های روشن.")}
        </h1>
        <p>
          {selected
            ? conceptText(locale, selected.explanation)
            : w(
                "Explore 36 connected concepts. Start with the meaning, then open the measurement and its limits.",
                "۳۶ مفهوم مرتبط را بشناسید. از معنی شروع کنید، سپس روش اندازه‌گیری و محدودیت را ببینید.",
              )}
        </p>
      </header>
      <nav className="topicTabs" aria-label={w("Economic topics", "موضوعات اقتصادی")}>
        <Link href={base} aria-current={!topic && !selected ? "page" : undefined}>
          {w("All concepts", "همه مفاهیم")}
        </Link>
        {TOPICS.map((item) => (
          <Link
            key={item.id}
            href={`${base}&topic=${item.id}`}
            aria-current={topic?.id === item.id || selected?.topic === item.id ? "page" : undefined}
          >
            {conceptText(locale, item.name)}
          </Link>
        ))}
      </nav>
      <p className="resultCount" aria-live="polite">
        {new Intl.NumberFormat(locale).format(items.length)}{" "}
        {w("concepts to explore", "مفهوم برای شناخت")}
      </p>
      <div className={selected ? "conceptList selectedConcept" : "conceptList"}>
        {items.map((concept) => (
          <article className="conceptArticle" key={concept.id}>
            <h2>
              <Link href={`${base}&concept=${concept.id}`}>
                {conceptText(locale, concept.name)}
              </Link>
            </h2>
            <p>{conceptText(locale, concept.explanation)}</p>
            <details className="methodDisclosure" open={selected?.id === concept.id}>
              <summary>
                {w(
                  "How it is measured & what it cannot tell us",
                  "چگونه اندازه می‌گیریم و چه چیزی را نمی‌گوید؟",
                )}
              </summary>
              <dl>
                <dt>{w("How to read it", "چطور بخوانیم")}</dt>
                <dd>{conceptText(locale, concept.measure)}</dd>
                <dt>{w("Keep in mind", "در نظر داشته باشید")}</dt>
                <dd>{conceptText(locale, concept.boundary)}</dd>
              </dl>
            </details>
          </article>
        ))}
      </div>
      {selected || topic ? (
        <div className="nextSteps">
          <Link className="primaryAction" href={publicHref(locale, "lab")}>
            {w("Learn through an example", "یادگیری با مثال")}
          </Link>
          <Link className="secondaryAction" href={base}>
            {w("Explore all concepts", "دیدن همه مفاهیم")}
          </Link>
        </div>
      ) : null}
      <section className="readingSources">
        <h2>{w("Further reading", "مطالعه بیشتر")}</h2>
        <p>
          {w(
            "These guides explain concepts. They are not current country assessments. Explore the underlying definitions at these official sources.",
            "این راهنماها مفاهیم را توضیح می‌دهند و ارزیابی وضعیت فعلی کشورها نیستند. تعریف‌های پایه را در منابع رسمی بخوانید.",
          )}
        </p>
        <div className="sourceLinks">
          {METHOD_SOURCES.map((source) => (
            <a key={source.url} href={source.url} lang="en">
              {source.name}
            </a>
          ))}
        </div>
      </section>
    </>
  );
}
