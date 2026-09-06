import type { Locale } from "@economyos/i18n";
import Link from "next/link";
import { conceptText, METHOD_SOURCES } from "../_lib/concepts";
import { publicHref, words } from "../_lib/public-copy";
import { INDICATORS, indicatorName, PUBLIC_DATA } from "../_lib/public-economy";
import { MetricDetails, SourceNote } from "./economic-data-display";
import { EvidenceLegend } from "./public-experience";
import { SourcePolicyGuide } from "./source-policy-guide";

export function SourcesGuide({ locale }: { locale: Locale }) {
  const w = (en: string, fa: string) => words(locale, en, fa);
  const methods = [
    [
      w("Observation, estimate, forecast or scenario?", "مشاهده، برآورد، پیش‌بینی یا سناریو؟"),
      w(
        "An observation records something measured. An estimate uses a model to infer an unknown quantity. A forecast concerns a future outcome. A scenario asks what follows if selected assumptions hold. None is interchangeable with another.",
        "مشاهده، مقدار اندازه‌گیری‌شده را ثبت می‌کند. برآورد با مدل کمیت نامعلوم را تخمین می‌زند. پیش‌بینی درباره آینده است. سناریو نتیجه برقرار بودن فرض‌های انتخابی را می‌سنجد. این‌ها جایگزین یکدیگر نیستند.",
      ),
    ],
    [
      w("When was the information actually available?", "اطلاعات واقعاً چه زمانی در دسترس بود؟"),
      w(
        "The economic period, publication date and date the platform received a release are different. A fair historical test only uses information available at that time. Later revisions cannot be silently inserted into the past.",
        "دوره اقتصادی، تاریخ انتشار و تاریخ دریافت داده توسط سامانه متفاوت‌اند. آزمون تاریخی منصفانه فقط از اطلاعات موجود در همان زمان استفاده می‌کند. بازنگری بعدی را نباید بی‌صدا وارد گذشته کرد.",
      ),
    ],
    [
      w("How certain is a result?", "نتیجه چقدر قابل اتکاست؟"),
      w(
        "Coverage says how much required evidence is available. Data quality describes that evidence. Model uncertainty concerns the result. A sensitivity range shows how assumptions change a calculation; it is not automatically a statistical confidence interval.",
        "پوشش، میزان شواهد لازمِ موجود را نشان می‌دهد. کیفیت درباره خود شواهد است. عدم قطعیت مدل به نتیجه مربوط است. بازه حساسیت اثر تغییر فرض‌ها را نشان می‌دهد و لزوماً فاصله اطمینان آماری نیست.",
      ),
    ],
    [
      w(
        "Do two things move together, or does one cause the other?",
        "آیا دو چیز هم‌زمان تغییر می‌کنند یا یکی علت دیگری است؟",
      ),
      w(
        "Correlation is co-movement. Causal claims require a research design, identified assumptions and checks for competing explanations. A graph edge or a predictive contributor alone does not prove a cause.",
        "همبستگی یعنی تغییر هم‌زمان. ادعای علّی نیازمند طرح پژوهش، فرض‌های مشخص و بررسی توضیح‌های رقیب است. یال نمودار یا عامل پیش‌بینی به‌تنهایی علت را اثبات نمی‌کند.",
      ),
    ],
    [
      w("Can a risk score be read as a probability?", "آیا امتیاز ریسک همان احتمال است؟"),
      w(
        "Only when the event and time horizon are defined and the model has suitable out-of-sample calibration evidence. The learning pages publish no current crisis probabilities or investment recommendations.",
        "فقط وقتی رویداد و افق زمانی مشخص باشد و مدل شواهد کالیبراسیون مناسب خارج از نمونه داشته باشد. صفحات آموزشی احتمال فعلی بحران یا توصیه سرمایه‌گذاری منتشر نمی‌کنند.",
      ),
    ],
    [
      w("Are the countries actually comparable?", "آیا کشورها واقعاً قابل‌مقایسه‌اند؟"),
      w(
        "Check units, periods, price bases, population definitions and model versions. Different inflation baskets or methods can limit comparison. This platform does not turn unlike dimensions into a single best-country score.",
        "واحد، دوره، پایه قیمت، تعریف جمعیت و نسخه مدل را بررسی کنید. تفاوت سبد تورم یا روش، مقایسه را محدود می‌کند. این سامانه ابعاد ناهمگون را به یک امتیاز بهترین کشور تبدیل نمی‌کند.",
      ),
    ],
  ];
  return (
    <>
      <header className="publicHeader">
        <h1>{w("A number needs a story.", "هر عدد به توضیح نیاز دارد.")}</h1>
        <p>
          {w(
            "Know where it came from, what it measures and how much it can tell you.",
            "بدانید از کجا آمده، چه چیزی را می‌سنجد و تا کجا می‌توان به آن اتکا کرد.",
          )}
        </p>
      </header>
      <SourceNote locale={locale} />
      <section className="publicPanel availabilityGuide">
        <h2>{w("What you can explore now", "اکنون چه چیزی در دسترس است")}</h2>
        <p>
          {w(
            `${PUBLIC_DATA.countries.length} economies, ${INDICATORS.length} indicators, and ${PUBLIC_DATA.observations.toLocaleString("en")} published annual values from ${PUBLIC_DATA.startYear} to ${PUBLIC_DATA.endYear}. Country profiles and comparisons work without an account. Every number retains its observation year, unit and source.`,
            `${PUBLIC_DATA.countries.length} اقتصاد، ${INDICATORS.length} شاخص و ${PUBLIC_DATA.observations.toLocaleString("fa")} مقدار سالانه منتشرشده از ${PUBLIC_DATA.startYear} تا ${PUBLIC_DATA.endYear}. نمایه و مقایسه کشور بدون حساب در دسترس است. هر عدد سال مشاهده، واحد و منبع خود را حفظ می‌کند.`,
          )}
        </p>
        <p>
          {w(
            "This is a dated snapshot of World Development Indicators, including statistics assembled from national agencies, international organizations and source models. It contains revised historical series, not a real-time feed or the original releases available in each past year. Gaps remain where the provider reports no value.",
            "این نسخه زمان‌دار شاخص‌های توسعه جهانی است؛ شامل آمار سازمان‌های ملی، نهادهای بین‌المللی و مدل‌های منبع. سری تاریخی بازنگری‌شده دارد، نه جریان زنده یا نسخه‌ای که در هر سال گذشته در دسترس بوده است. نبود مقدار در منبع به‌صورت خلأ باقی می‌ماند.",
          )}
        </p>
        <div className="nextSteps">
          <Link className="primaryAction" href={publicHref(locale, "compare")}>
            {w("Compare published data", "مقایسه داده منتشرشده")}
          </Link>
          <Link className="secondaryAction" href={publicHref(locale, "science")}>
            {w("Explore scientific evidence", "بررسی شواهد علمی")}
          </Link>
        </div>
      </section>
      <EvidenceLegend locale={locale} />
      <SourcePolicyGuide locale={locale} />
      <section className="readingSources">
        <h2>{w("Indicator coverage and original definitions", "پوشش شاخص و تعریف اصلی")}</h2>
        <p>
          {w(
            "Open any measure to see its meaning, limitations, originating providers and source update date. Coverage counts include the world aggregate and all reported years; they do not imply every country reports every year.",
            "هر شاخص را باز کنید تا معنا، محدودیت، ارائه‌دهنده اصلی و تاریخ به‌روزرسانی منبع را ببینید. تعداد پوشش شامل تجمیع جهان و تمام سال‌های گزارش‌شده است؛ به معنی گزارش همه کشورها در هر سال نیست.",
          )}
        </p>
        <div className="sourceCatalog">
          {INDICATORS.map((indicator) => (
            <article key={indicator.id}>
              <h3>{indicatorName(indicator, locale)}</h3>
              <p>
                {new Intl.NumberFormat(locale).format(
                  PUBLIC_DATA.indicators[indicator.id]?.reported ?? 0,
                )}{" "}
                {w("published annual values", "مقدار سالانه منتشرشده")}
              </p>
              <MetricDetails indicator={indicator} locale={locale} />
            </article>
          ))}
        </div>
      </section>
      <section className="publicPanel availabilityGuide">
        <h2>{w("Scientific research: what is included", "پژوهش علمی: چه چیزی استفاده شده است")}</h2>
        <p>
          {w(
            "The evidence library connects 20 economic theories, 12 editorially reviewed study summaries and seven interactive model explorations. Publication identities are checked against Crossref DOI metadata. Study design, findings and limits are separate from hypothetical model outputs. This curated collection does not cover all scientific literature, and DOI registration alone is not a quality assessment.",
            "کتابخانه شواهد، ۲۰ نظریه اقتصادی، ۱۲ خلاصه مطالعه با بازبینی محتوایی و هفت کاوش مدل تعاملی را پیوند می‌دهد. هویت انتشار با فراداده شناسه DOI در Crossref بررسی شده است. طرح مطالعه، یافته و محدودیت از خروجی فرضی مدل جداست. این مجموعه گزینش‌شده همه ادبیات علمی را پوشش نمی‌دهد و ثبت DOI به‌تنهایی ارزیابی کیفیت نیست.",
          )}
        </p>
        <p>
          {w(
            "Model demonstrations call the platform’s existing behavioral economics kernels. They explain mechanisms such as loss sensitivity, present bias, fairness, satisficing and selling behavior. They do not estimate the psychology of a country from its GDP or inflation.",
            "نمایش مدل، هسته‌های اقتصاد رفتاری موجود سامانه را اجرا می‌کند. سازوکارهایی مانند حساسیت زیان، سوگیری حال، انصاف، قناعت به گزینه پذیرفتنی و رفتار فروش را توضیح می‌دهد. از تولید یا تورم کشور، روان‌شناسی آن را برآورد نمی‌کند.",
          )}
        </p>
      </section>
      <section className="publicPanel methodGuide">
        <h2>{w("Read the evidence in six steps", "خواندن شواهد در شش گام")}</h2>
        {methods.map(([title, description], index) => (
          <details key={title} className="methodDisclosure" open={index === 0}>
            <summary>{title}</summary>
            <p>{description}</p>
          </details>
        ))}
      </section>
      <section className="readingSources">
        <h2>{w("Official reference sources", "منابع مرجع رسمی")}</h2>
        <p>
          {w(
            "The indicator catalog above identifies the data actually included. These additional references explain economic methods; a reference link alone does not mean its datasets have been imported.",
            "فهرست شاخص بالا داده استفاده‌شده را مشخص می‌کند. این منابع تکمیلی روش‌های اقتصادی را توضیح می‌دهند؛ پیوند مرجع به‌تنهایی به معنی ورود مجموعه‌داده آن نیست.",
          )}
        </p>
        <ul className="sourceList">
          {METHOD_SOURCES.map((source) => (
            <li key={source.url}>
              <a href={source.url} lang="en">
                {source.name}
              </a>
              <p>{conceptText(locale, source.scope)}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="publicPanel availabilityGuide">
        <h2>{w("Reuse, freshness and reproducibility", "استفاده مجدد، تازگی و بازتولید")}</h2>
        <p>
          {w(
            "Download the visible comparison as CSV with exact reported values, observation years, units and source links. The repository retains compressed original responses and checksums. Refreshing the snapshot is a deliberate data update; it never silently fills missing observations or changes the meaning of an indicator.",
            "مقایسه قابل‌مشاهده را با مقدار دقیق گزارش‌شده، سال مشاهده، واحد و پیوند منبع به صورت CSV بگیرید. مخزن پاسخ‌های اصلی فشرده و اثر انگشت آن‌ها را نگه می‌دارد. تازه‌سازی نسخه یک به‌روزرسانی آگاهانه است؛ مشاهده مفقود یا معنای شاخص را بی‌صدا تغییر نمی‌دهد.",
          )}
        </p>
        <p>
          <a href="https://data.worldbank.org/summary-terms-of-use">
            {w("World Bank data terms and attribution", "شرایط داده و انتساب بانک جهانی")}
          </a>
          {" · "}
          <a href="https://www.crossref.org/documentation/retrieve-metadata/rest-api/">
            {w("Crossref publication metadata", "فراداده انتشار Crossref")}
          </a>
        </p>
        <p>
          {w(
            "World Bank data is generally available under CC BY 4.0 subject to dataset and third-party restrictions. Consult the provider notes for each measure. Research summaries are original; linked articles retain their publishers’ access and reuse terms.",
            "داده بانک جهانی عموماً تحت CC BY 4.0 و مشروط به محدودیت مجموعه‌داده و اشخاص ثالث است. یادداشت ارائه‌دهنده هر شاخص را بررسی کنید. خلاصه پژوهش تألیف سامانه است؛ مقاله پیوندشده تابع شرایط دسترسی و استفاده ناشر خود است.",
          )}
        </p>
        <Link className="secondaryAction" href={`/${locale}/intelligence/global?advanced=1`}>
          {w("Open specialist report tools", "باز کردن ابزار تخصصی گزارش")}
        </Link>
      </section>
      <section className="readingSources">
        <h2>{w("Connected research foundations", "پایه‌های پژوهشی مرتبط")}</h2>
        <ul className="sourceList">
          <li>
            <a href="https://github.com/ildrm/countries-investment-model" lang="en">
              Countries Investment Model
            </a>
            <p>
              {w(
                "Economic regimes, macro context and asset-specific valuation boundaries.",
                "رژیم اقتصادی، زمینه کلان و محدودیت‌های ارزش‌گذاری دارایی.",
              )}
            </p>
          </li>
          <li>
            <a
              href="https://github.com/ildrm/foreign-exchange-crisis-early-warning-system"
              lang="en"
            >
              Foreign Exchange Crisis Early Warning System
            </a>
            <p>
              {w(
                "Separate crisis hazards, evidence gates and calibrated risk communication.",
                "خطرهای مستقل بحران، الزامات شواهد و بیان ریسک کالیبره.",
              )}
            </p>
          </li>
          <li>
            <a href="https://github.com/ildrm/humanity-economy" lang="en">
              Humanity Economy
            </a>
            <p>
              {w(
                "Household pressure, distribution, basic needs and the limits of normative indicators.",
                "فشار خانوار، توزیع، نیازهای پایه و محدودیت شاخص‌های ارزشی.",
              )}
            </p>
          </li>
        </ul>
      </section>
    </>
  );
}
