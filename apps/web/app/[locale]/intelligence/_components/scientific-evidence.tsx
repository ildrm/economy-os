"use client";

import type { Locale } from "@economyos/i18n";
import { useId, useState } from "react";
import bibliography from "../../../../../../data/public-economy/bibliography.json";
import studies from "../../../../../../data/public-economy/studies.json";
import { words } from "../_lib/public-copy";
import type { ScienceModels } from "../_lib/science-models";

const faTheories: Record<string, readonly [string, string]> = {
  bounded_rationality: [
    "عقلانیت محدود و رضایت‌بخشی",
    "با وقت و اطلاعات محدود، افراد ممکن است به دنبال گزینه قابل قبول باشند.",
  ],
  heuristics: [
    "میان‌برهای قضاوت",
    "روش‌های ساده قضاوت می‌توانند در برخی زمینه‌ها خطاهای منظم ایجاد کنند.",
  ],
  prospect_theory: [
    "نظریه چشم‌انداز تجمعی",
    "نقطه مرجع، سود و زیان و وزن احتمال بر ارزش‌گذاری انتخاب پرریسک اثر می‌گذارند.",
  ],
  mental_accounting: ["حسابداری ذهنی", "دسته‌بندی ذهنی پول ممکن است مصرف و پس‌انداز را تغییر دهد."],
  endowment_status_quo: [
    "اثر مالکیت و وضع موجود",
    "مالکیت و گزینه موجود ممکن است به نقطه مرجع انتخاب تبدیل شوند.",
  ],
  defaults: [
    "پیش‌فرض و طراحی انتخاب",
    "گزینه ازپیش‌انتخاب‌شده می‌تواند رفتار را تغییر دهد؛ زمینه و طراحی مهم‌اند.",
  ],
  intertemporal_choice: [
    "سوگیری حال و تعهد",
    "ترجیح امروز در برابر آینده ممکن است به برنامه ناسازگار در زمان منجر شود.",
  ],
  projection_visceral: [
    "سوگیری فرافکنی و عوامل درونی",
    "وضعیت فعلی ممکن است پیش‌بینی ترجیح آینده را تغییر دهد.",
  ],
  social_preferences: [
    "انصاف، مقابله‌به‌مثل و نابرابری",
    "پیامد دیگران و توزیع پرداخت می‌تواند در ترجیح اقتصادی نقش داشته باشد.",
  ],
  cooperation: [
    "همکاری، هنجار و نهاد",
    "قواعد نهادی، تعامل تکراری و انتظارات بر همکاری اثر دارند.",
  ],
  behavioral_games: [
    "نظریه بازی رفتاری",
    "باور، یادگیری و محدودیت استدلال در پاسخ راهبردی بررسی می‌شوند.",
  ],
  experimental_methods: [
    "اقتصاد آزمایشگاهی و میدانی",
    "تصادفی‌سازی، مشوق، ریزش نمونه و تکرارپذیری برای تفسیر شواهد مهم‌اند.",
  ],
  scarcity: [
    "کمیابی و محدودیت توجه",
    "محدودیت منابع می‌تواند توجه و انتخاب را تغییر دهد؛ فقر نقص فردی محسوب نمی‌شود.",
  ],
  identity: [
    "اقتصاد هویت",
    "نقش اجتماعی و هنجارهای زمینه‌ای می‌توانند بخشی از فرضیه انتخاب اقتصادی باشند.",
  ],
  narratives: [
    "اقتصاد روایت و روحیه جمعی",
    "داستان‌های مشترک ممکن است انتظارات و انتخاب اقتصادی را شکل دهند.",
  ],
  behavioral_finance: [
    "مالیه رفتاری",
    "رفتار سرمایه‌گذار با ترجیح، مالیات، نقدینگی و محدودیت نهادی مقایسه می‌شود.",
  ],
  ambiguity: [
    "ریسک و ابهام",
    "احتمال معلوم با توزیع نامعلوم متفاوت است؛ ابهام را نباید احتمال ساختگی کرد.",
  ],
  attention: [
    "توجه محدود و بی‌توجهی عقلایی",
    "هزینه و محدودیت پردازش اطلاعات می‌تواند انتخاب را تغییر دهد.",
  ],
  public_organizational: [
    "مالیه عمومی و سازمانی رفتاری",
    "نمایانی مالیات، بار اداری و نحوه ارائه پاداش در محیط واقعی بررسی می‌شوند.",
  ],
  context_choice: [
    "انتخاب وابسته به زمینه و پشیمانی",
    "ترکیب گزینه‌ها، نحوه ارائه و نقطه مرجع باید همراه فرضیه حفظ شوند.",
  ],
};

function theoryName(id: string, name: string, locale: Locale): string {
  return locale === "fa" ? (faTheories[id]?.[0] ?? name) : name;
}

export function ScientificEvidence({ locale, models }: { locale: Locale; models: ScienceModels }) {
  const [theory, setTheory] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const w = (en: string, fa: string) => words(locale, en, fa);
  const priority = ["defaults", "tax-salience", "scale"];
  const matches = [...studies]
    .filter((study) => theory === "all" || study.theories.includes(theory))
    .sort((a, b) => {
      const rank = (id: string) => (priority.includes(id) ? priority.indexOf(id) : priority.length);
      return rank(a.id) - rank(b.id);
    });
  const theories = models.theories.filter((item) => theory === "all" || item.id === theory);
  return (
    <>
      <header className="publicHeader dataHeader">
        <h1>{w("The science behind economic choices", "علم پشت انتخاب‌های اقتصادی")}</h1>
        <p>
          {w(
            "Explore behavioral theories, original studies, and the assumptions behind working models.",
            "نظریه رفتاری، مطالعه اصلی و فرض‌های پشت مدل اجرایی را بررسی کنید.",
          )}
        </p>
      </header>
      <div className="dataToolbar">
        <p className="dataCoverage">
          <strong>
            {models.theories.length} {w("theory families", "خانواده نظریه")}
          </strong>
          <span>
            {studies.length} {w("curated studies", "مطالعه مرورشده")}
          </span>
          <span>{w("7 interactive model explorations", "۷ بررسی تعاملی مدل")}</span>
        </p>
        <label className="dataSelect">
          <span>{w("Research topic", "موضوع پژوهش")}</span>
          <select
            value={theory}
            onChange={(event) => {
              setTheory(event.target.value);
              setExpanded(false);
            }}
          >
            <option value="all">{w("All theories", "همه نظریه‌ها")}</option>
            {models.theories.map((item) => (
              <option key={item.id} value={item.id}>
                {theoryName(item.id, item.name, locale)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="scienceGrid">
        <section className="studyPanel">
          <h2>{w("Research reading list", "فهرست مطالعه پژوهش")}</h2>
          <p className="sourceNote">
            {w(
              "Study findings and limitations are curated from original sources. Bibliographic identity is imported from Crossref; metadata alone does not validate findings.",
              "یافته و محدودیت مطالعه از منابع اصلی مرور شده‌اند. مشخصات کتاب‌شناختی از کراس‌رف دریافت شده؛ فراداده به‌تنهایی یافته را معتبر نمی‌کند.",
            )}
          </p>
          {matches.length === 0 ? (
            <p>
              {w(
                "This theory is in the platform registry, but no study summary has yet been curated in this collection. Its bibliography and limits are shown below.",
                "این نظریه در فهرست سامانه است، اما خلاصه مطالعه آن هنوز در این مجموعه مرور نشده است. منابع و محدودیت در پایین آمده‌اند.",
              )}
            </p>
          ) : (
            matches.slice(0, expanded ? matches.length : 3).map((study) => {
              const citation = bibliography.find((item) => item.id === study.id);
              return (
                <article className="studyArticle" key={study.id}>
                  <h3>{locale === "fa" ? study.questionFa : study.questionEn}</h3>
                  <p className="studyCitation" lang="en">
                    {citation?.authors.join(", ")} · {citation?.year}
                  </p>
                  <p>
                    <strong>{w("Design", "طراحی")}: </strong>
                    {locale === "fa" ? study.designFa : study.designEn}
                  </p>
                  <p>
                    <strong>{w("Finding", "یافته")}: </strong>
                    {locale === "fa" ? study.findingFa : study.findingEn}
                  </p>
                  <p>
                    <strong>{w("Limit", "محدودیت")}: </strong>
                    {locale === "fa" ? study.boundaryFa : study.boundaryEn}
                  </p>
                  <a href={study.evidenceUrl}>
                    {w("Read the original research", "مطالعه پژوهش اصلی")} →
                  </a>
                  <details className="metricDetails">
                    <summary>{w("Citation & verification", "ارجاع و بررسی مشخصات")}</summary>
                    <p lang="en">
                      {citation?.title}. {citation?.publication}, {citation?.year}.
                    </p>
                    <a href={`https://doi.org/${study.doi}`} lang="en">
                      DOI: {study.doi}
                    </a>
                    <p className="sourceNote">
                      {w("Metadata retrieved", "دریافت فراداده")}:{" "}
                      {citation?.retrievedAt.slice(0, 10)} ·{" "}
                      <a href={citation?.metadataUrl}>Crossref</a>
                    </p>
                  </details>
                </article>
              );
            })
          )}
          {!expanded && matches.length > 3 ? (
            <button className="secondaryAction" type="button" onClick={() => setExpanded(true)}>
              {w("Show all studies", "دیدن همه مطالعات")} ({matches.length})
            </button>
          ) : null}
        </section>
        <BehavioralModels locale={locale} models={models} />
      </div>
      <section className="theoryPanel">
        <h2>{w("Browse theory families", "مرور خانواده‌های نظریه")}</h2>
        <p>
          {w(
            "Executable kernels and conceptual frameworks are identified separately. A working equation is not evidence of a universal effect.",
            "هسته اجرایی و چارچوب مفهومی جدا مشخص شده‌اند. کارکرد معادله، شواهد اثر جهان‌شمول نیست.",
          )}
        </p>
        <div className="dataTableWrap">
          <table className="theoryDirectory">
            <thead>
              <tr>
                <th scope="col">{w("Theory family", "خانواده نظریه")}</th>
                <th scope="col">{w("Meaning", "معنا")}</th>
                <th scope="col">{w("Model availability", "دسترسی مدل")}</th>
                <th scope="col">{w("Research details", "جزئیات پژوهش")}</th>
              </tr>
            </thead>
            <tbody>
              {theories.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{theoryName(item.id, item.name, locale)}</th>
                  <td>
                    <p lang={locale === "fa" ? "fa" : "en"}>
                      {locale === "fa"
                        ? (faTheories[item.id]?.[1] ?? item.description)
                        : item.description}
                    </p>
                  </td>
                  <td>
                    <strong className="theoryStatus">
                      {item.executableModels.length
                        ? w("Executable research kernel", "هسته پژوهشی اجرایی")
                        : w("Conceptual framework", "چارچوب مفهومی")}
                    </strong>
                  </td>
                  <td>
                    <details className="metricDetails">
                      <summary>
                        {w("Authors, mechanisms & boundaries", "نویسنده، سازوکار و محدودیت")}
                      </summary>
                      <p lang="en">{item.authors.join(", ")}</p>
                      <p lang="en">
                        {item.mechanisms.map((value) => value.replaceAll("_", " ")).join(" · ")}
                      </p>
                      {item.boundaryConditions.map((text) => (
                        <p key={text} lang="en">
                          {text}
                        </p>
                      ))}
                      {item.references.length ? (
                        <ul>
                          {item.references.map((reference) => (
                            <li key={reference.uri}>
                              <a href={reference.uri} lang="en">
                                {reference.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          {w(
                            "A verified bibliography is not yet attached to this registry entry.",
                            "کتاب‌شناسی بررسی‌شده هنوز به این مدخل فهرست متصل نشده است.",
                          )}
                        </p>
                      )}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="methodWarning">
        {w(
          "These studies and models support investigation; they do not automatically identify the cause of a country’s inflation, a market move, or an individual’s choices. Full-text coverage and empirical validation are not claimed for all scientific literature.",
          "این مطالعه و مدل به بررسی کمک می‌کند؛ علت تورم کشور، حرکت بازار یا انتخاب فرد را خودکار شناسایی نمی‌کند. پوشش متن کامل و اعتبارسنجی تجربی همه ادبیات علمی ادعا نمی‌شود.",
        )}
      </p>
    </>
  );
}

type ModelMode =
  | "loss"
  | "time"
  | "fairness"
  | "search"
  | "probability"
  | "disposition"
  | "choices";
function BehavioralModels({ locale, models }: { locale: Locale; models: ScienceModels }) {
  const [mode, setMode] = useState<ModelMode>("loss");
  const [lossIndex, setLossIndex] = useState(6);
  const [preset, setPreset] = useState(0);
  const w = (en: string, fa: string) => words(locale, en, fa);
  const names: readonly [ModelMode, string, string][] = [
    ["loss", "Gains & losses", "سود و زیان"],
    ["time", "Today & tomorrow", "امروز و فردا"],
    ["fairness", "Fairness & payoffs", "انصاف و پرداخت"],
    ["search", "Limited search", "جست‌وجوی محدود"],
    ["probability", "Probability weights", "وزن احتمال"],
    ["disposition", "Selling gains & losses", "فروش سود و زیان"],
    ["choices", "Choice probabilities", "احتمال انتخاب"],
  ];
  const lossControlId = useId();
  const loss = models.losses[lossIndex] ?? models.losses[0];
  const time = models.time[preset] ?? models.time[0];
  const fairness = models.fairness[preset] ?? models.fairness[0];
  const search = models.search[preset] ?? models.search[0];
  const probability = models.probability[preset] ?? models.probability[0];
  const disposition = models.disposition[preset] ?? models.disposition[0];
  const choices = models.choices[preset] ?? models.choices[0];
  const number = (value: string | number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value));
  const assumptions =
    mode === "loss"
      ? loss
      : mode === "time"
        ? time
        : mode === "fairness"
          ? fairness
          : mode === "search"
            ? search
            : mode === "probability"
              ? probability
              : mode === "disposition"
                ? disposition
                : choices;
  const presetNames =
    mode === "time"
      ? [
          w("No present bias", "بدون سوگیری حال"),
          w("Moderate present bias", "سوگیری حال متوسط"),
          w("Stronger present bias", "سوگیری حال بیشتر"),
        ]
      : mode === "fairness"
        ? [
            w("Equal payoffs", "پرداخت برابر"),
            w("Behind the other person", "دریافت کمتر از دیگری"),
            w("Ahead of the other person", "دریافت بیشتر از دیگری"),
          ]
        : mode === "search"
          ? [
              w("Lower target", "هدف پایین‌تر"),
              w("Higher target", "هدف بالاتر"),
              w("Unreachable target", "هدف دست‌نیافتنی"),
            ]
          : mode === "probability"
            ? ["10%", "50%", "90%"]
            : mode === "disposition"
              ? [
                  w("Equal rates", "نرخ برابر"),
                  w("More gains realized", "تحقق بیشتر سود"),
                  w("No opportunities", "بدون فرصت"),
                ]
              : [
                  w("Equal response", "پاسخ برابر"),
                  w("Moderate sensitivity", "حساسیت متوسط"),
                  w("Higher sensitivity", "حساسیت بالاتر"),
                ];
  return (
    <section className="behaviorModel examplePanel">
      <h2>{w("Explore an economic mechanism", "یک سازوکار اقتصادی را بررسی کنید")}</h2>
      <label className="dataSelect">
        <span>{w("Working model", "مدل اجرایی")}</span>
        <select
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as ModelMode);
            setPreset(0);
          }}
        >
          {names.map(([id, en, fa]) => (
            <option key={id} value={id}>
              {locale === "fa" ? fa : en}
            </option>
          ))}
        </select>
      </label>
      <p>
        {w(
          "Illustrative inputs, calculated by the platform’s existing economic engines. No country or individual is assigned these parameters.",
          "ورودی فرضی، محاسبه‌شده با موتور اقتصادی موجود سامانه. این پارامترها به کشور یا فرد نسبت داده نمی‌شوند.",
        )}
      </p>
      {mode !== "loss" ? (
        <fieldset className="choiceButtons" aria-label={w("Model preset", "حالت آماده مدل")}>
          {presetNames.map((name, index) => (
            <button
              key={name}
              type="button"
              aria-pressed={preset === index}
              onClick={() => setPreset(index)}
            >
              {name}
            </button>
          ))}
        </fieldset>
      ) : null}
      <div className="modelResult" aria-live="polite" aria-atomic="true">
        {mode === "loss" && loss ? (
          <>
            <h3>
              {w("Equal amounts. Different model responses.", "مبلغ برابر؛ پاسخ متفاوت مدل.")}
            </h3>
            <div className="modelBars">
              <div>
                <span>{w("Gain +100", "سود ۱۰۰+")}</span>
                <div style={{ width: "25%" }} />
                <bdi>{number(loss.gain)}</bdi>
              </div>
              <div>
                <span>{w("Loss −100", "زیان ۱۰۰−")}</span>
                <div style={{ width: `${Math.abs(Number(loss.loss)) / 4}%` }} />
                <bdi>{number(loss.loss)}</bdi>
              </div>
            </div>
            <p>
              {w(
                "Model units, not measured feelings or money returns.",
                "واحد مدل، نه احساس اندازه‌گیری‌شده یا بازده پول.",
              )}
            </p>
            <p>
              {w(
                "A 50/50 gain-or-loss lottery has expected money value",
                "قرعه سود یا زیان با احتمال برابر، ارزش پولی مورد انتظار",
              )}{" "}
              {number(loss.expectedLottery)}; {w("its model value is", "و ارزش مدل آن")}{" "}
              {number(loss.prospectLottery)}.
            </p>
          </>
        ) : null}
        {mode === "time" && time ? (
          <>
            <h3>
              {w(
                "80 utility units now, or 100 next period?",
                "۸۰ واحد مطلوبیت اکنون یا ۱۰۰ در دوره بعد؟",
              )}
            </h3>
            <dl>
              <div>
                <dt>{w("Value of now", "ارزش اکنون")}</dt>
                <dd>{number(time.now)}</dd>
              </div>
              <div>
                <dt>{w("Value of later", "ارزش آینده")}</dt>
                <dd>{number(time.later)}</dd>
              </div>
            </dl>
            <p>
              {w(
                "Quasi-hyperbolic utility with a future-period discount factor of 0.95. Utility units are not automatically cash amounts.",
                "مطلوبیت شبه‌هذلولوی با ضریب تنزیل آینده ۰٫۹۵. واحد مطلوبیت لزوماً مبلغ پول نیست.",
              )}
            </p>
          </>
        ) : null}
        {mode === "fairness" && fairness ? (
          <>
            <h3>{w("A payoff and its social comparison", "پرداخت و مقایسه اجتماعی آن")}</h3>
            <p>
              {w("Your payoff / other payoff", "پرداخت شما / پرداخت دیگری")}:{" "}
              {fairness.payoffs.join(" / ")}
            </p>
            <p className="modelBigNumber">{number(fairness.utility)}</p>
            <p>
              {w(
                "Fehr–Schmidt utility for the first participant, with disadvantage sensitivity 1 and advantage sensitivity 0.5. This is not a moral fairness score.",
                "مطلوبیت فهر–اشمیت برای نفر اول، با حساسیت دریافت کمتر ۱ و دریافت بیشتر ۰٫۵؛ این امتیاز عدالت اخلاقی نیست.",
              )}
            </p>
          </>
        ) : null}
        {mode === "search" && search ? (
          <>
            <h3>{w("Find an acceptable option", "یک گزینه قابل قبول بیابید")}</h3>
            <p>
              {w("Options in order", "گزینه‌ها به ترتیب")}: 45, 60, 90. {w("Target", "هدف")}:{" "}
              {search.aspiration}.
            </p>
            <p className="modelBigNumber">
              {search.result.selectedIndex === null
                ? w("No acceptable option", "گزینه قابل قبول نداریم")
                : search.utilities[search.result.selectedIndex]}
            </p>
            <p>
              {w("Options inspected", "گزینه بررسی‌شده")}: {search.result.inspected}.{" "}
              {w(
                "The rule stops at the first option meeting the target, not necessarily the maximum.",
                "قاعده در نخستین گزینه مطابق هدف متوقف می‌شود، نه الزاماً بهترین مقدار.",
              )}
            </p>
          </>
        ) : null}
        {mode === "probability" && probability ? (
          <>
            <h3>{w("A decision weight is not a probability", "وزن تصمیم همان احتمال نیست")}</h3>
            <dl>
              <div>
                <dt>{w("Objective chance", "احتمال عینی")}</dt>
                <dd>{number(Number(probability.probability) * 100)}%</dd>
              </div>
              <div>
                <dt>{w("Prelec decision weight", "وزن تصمیم پرلک")}</dt>
                <dd>{number(Number(probability.weighted) * 100)}%</dd>
              </div>
            </dl>
            <p>
              {w(
                "The weighting curvature is assumed to be 0.65. This changes a model’s valuation, not the actual chance of the event.",
                "انحنای وزن‌دهی ۰٫۶۵ فرض شده است. این ارزش‌گذاری مدل را تغییر می‌دهد، نه احتمال واقعی رویداد.",
              )}
            </p>
          </>
        ) : null}
        {mode === "disposition" && disposition ? (
          <>
            <h3>{w("Opportunity-adjusted selling rates", "نرخ فروش تعدیل‌شده با فرصت")}</h3>
            <dl>
              <div>
                <dt>{w("Gains realized", "سود تحقق‌یافته")}</dt>
                <dd>
                  {disposition.result.gainRealizationRate === null
                    ? w("Unknown", "نامعلوم")
                    : `${number(Number(disposition.result.gainRealizationRate) * 100)}%`}
                </dd>
              </div>
              <div>
                <dt>{w("Losses realized", "زیان تحقق‌یافته")}</dt>
                <dd>
                  {disposition.result.lossRealizationRate === null
                    ? w("Unknown", "نامعلوم")
                    : `${number(Number(disposition.result.lossRealizationRate) * 100)}%`}
                </dd>
              </div>
            </dl>
            <p>
              {w(
                "Counts are hypothetical. Different rates are descriptive evidence; taxes, liquidity and rebalancing can also explain selling.",
                "تعدادها فرضی‌اند. تفاوت نرخ شواهد توصیفی است؛ مالیات، نقدینگی و توازن مجدد هم می‌توانند فروش را توضیح دهند.",
              )}
            </p>
          </>
        ) : null}
        {mode === "choices" && choices ? (
          <>
            <h3>{w("Responses to three utility levels", "پاسخ به سه سطح مطلوبیت")}</h3>
            <dl>
              {choices.probabilities.map((value, index) => (
                <div key={choices.utilities[index]}>
                  <dt>
                    {w("Option", "گزینه")} {index + 1} · {w("utility", "مطلوبیت")}{" "}
                    {choices.utilities[index]}
                  </dt>
                  <dd>{number(Number(value) * 100)}%</dd>
                </div>
              ))}
            </dl>
            <p>
              {w(
                "Logit response probabilities at the selected sensitivity. This is not a solved strategic equilibrium or an empirical prediction of a person’s choices.",
                "احتمال پاسخ لاجیت با حساسیت انتخابی؛ این تعادل راهبردی حل‌شده یا پیش‌بینی تجربی انتخاب فرد نیست.",
              )}
            </p>
          </>
        ) : null}
      </div>
      {mode === "loss" ? (
        <>
          <fieldset
            className="choiceButtons"
            aria-label={w("Loss model preset", "حالت آماده مدل زیان")}
          >
            <button type="button" aria-pressed={lossIndex === 0} onClick={() => setLossIndex(0)}>
              {w("Linear benchmark", "مبنای خطی")}
            </button>
            <button type="button" aria-pressed={lossIndex === 6} onClick={() => setLossIndex(6)}>
              {w("Loss sensitivity", "حساسیت به زیان")}
            </button>
          </fieldset>
          <label className="labRange" htmlFor={lossControlId}>
            <span>
              {w("Loss multiplier", "ضریب زیان")} <output>{number((lossIndex + 10) / 10)}×</output>
            </span>
            <input
              id={lossControlId}
              type="range"
              min="1"
              max="4"
              step="0.1"
              value={(lossIndex + 10) / 10}
              aria-valuetext={`${number((lossIndex + 10) / 10)}×`}
              onChange={(event) => setLossIndex(Math.round(Number(event.target.value) * 10) - 10)}
            />
          </label>
        </>
      ) : null}
      <details className="modelAssumptions">
        <summary>
          {w("Inspect all inputs and computed outputs", "بررسی همه ورودی‌ها و خروجی محاسبه")}
        </summary>
        <p>
          {w(
            "Technical detail for reproducibility. All values are illustrative assumptions.",
            "جزئیات فنی برای بازتولید؛ همه مقادیر فرض آموزشی‌اند.",
          )}
        </p>
        <pre lang="en" dir="ltr">
          {JSON.stringify(assumptions, null, 2)}
        </pre>
      </details>
    </section>
  );
}
