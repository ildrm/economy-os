import type { Locale } from "@economyos/i18n";
import catalog from "../../../../../../data/source-policy/catalog.json";
import { words } from "../_lib/public-copy";

export function SourcePolicyGuide({ locale }: { locale: Locale }) {
  const w = (en: string, fa: string) => words(locale, en, fa);
  const meanings = [
    [
      "Completed sale",
      "فروش انجام‌شده",
      "transaction_price",
      "The amount actually paid in a completed transaction.",
      "مبلغ پرداخت‌شده در معامله انجام‌شده.",
    ],
    [
      "Exchange trade",
      "معامله در بورس",
      "market_trade_price",
      "A trade on a named exchange, at a recorded time.",
      "معامله در بورس مشخص و زمان ثبت‌شده.",
    ],
    [
      "Closing price",
      "قیمت پایانی",
      "close_price",
      "The closing value defined by the named market and session.",
      "مقدار پایانی با تعریف بازار و جلسه مشخص.",
    ],
    [
      "Seller’s asking price",
      "قیمت پیشنهادی فروشنده",
      "asking_price",
      "An advertised amount; it does not prove a completed sale.",
      "مبلغ آگهی؛ اثبات فروش انجام‌شده نیست.",
    ],
    [
      "Reference valuation",
      "ارزش مرجع",
      "reference_price",
      "A benchmark such as FIPE, not proof of a transaction.",
      "معیاری مانند FIPE؛ اثبات معامله نیست.",
    ],
    [
      "Manufacturer price",
      "قیمت سازنده",
      "manufacturer_price",
      "A price published by the manufacturer for a defined product.",
      "قیمت منتشرشده توسط سازنده برای محصول مشخص.",
    ],
    [
      "Original catalogue price",
      "قیمت کاتالوگ",
      "catalog_price",
      "RDW catalogue values are not today’s used-car values.",
      "قیمت کاتالوگ RDW ارزش امروز خودروی دست‌دوم نیست.",
    ],
    [
      "Price index",
      "شاخص قیمت",
      "price_index",
      "Change relative to a base. An index of 112.4 is not €112.4.",
      "تغییر نسبت به پایه. شاخص ۱۱۲٫۴ به معنی ۱۱۲٫۴ یورو نیست.",
    ],
    [
      "Average price",
      "میانگین قیمت",
      "average_price",
      "The arithmetic mean for a stated sample and period.",
      "میانگین حسابی نمونه و دوره مشخص.",
    ],
    [
      "Median price",
      "میانه قیمت",
      "median_price",
      "The middle price of an ordered sample, not its average.",
      "قیمت میانی در نمونه مرتب‌شده؛ نه میانگین آن.",
    ],
  ];
  return (
    <section className="publicPanel methodGuide" aria-labelledby="source-policy-title">
      <h2 id="source-policy-title">
        {w("What kind of number is this?", "این عدد از چه نوعی است؟")}
      </h2>
      <p>
        {w(
          "We prefer official, free, machine-readable sources (Grade A), then official sources with access conditions (B), third-party sources (C), and marketplaces (D). An official source for the same measure takes priority. A missing permission or observation stays a visible gap.",
          "منبع رسمی، رایگان و ماشین‌خوان (درجه A) اولویت دارد؛ سپس منبع رسمی با شروط دسترسی (B)، شخص ثالث (C) و بازار آگهی (D). منبع رسمی همان متغیر مقدم است. نبود مجوز یا مشاهده به شکل خلأ مشخص باقی می‌ماند.",
        )}
      </p>
      <details className="methodDisclosure">
        <summary>
          {w("Ten price meanings, with simple examples", "ده معنای قیمت، با مثال ساده")}
        </summary>
        <dl>
          {meanings.map(([en, fa, key, explanationEn, explanationFa]) => (
            <div key={key}>
              <dt>
                <strong>{w(en ?? "", fa ?? "")}</strong>
              </dt>
              <dd>{w(explanationEn ?? "", explanationFa ?? "")}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details className="methodDisclosure" open>
        <summary>{w("Available data and collection gaps", "داده موجود و خلأ گردآوری")}</summary>
        <p>
          {w(
            "Connected public datasets include 80 World Bank WDI annual indicators and ECB Consumer Expectations Survey aggregates for eleven covered countries. Direct national consumer-price feeds and Eurostat HICP are not connected yet. HICP will be an additional, separately labelled comparison series; it will not silently replace a national CPI basket.",
            "مجموعه‌های عمومی متصل شامل ۸۰ شاخص سالانه بانک جهانی و آماره‌های پیمایش انتظارات مصرف‌کننده بانک مرکزی اروپا برای یازده کشور تحت پوشش هستند. جریان مستقیم قیمت مصرف‌کننده از مراکز آمار ملی و HICP یورواستات هنوز متصل نیست. HICP سری مقایسه‌ای اضافی با برچسب مستقل خواهد بود و بی‌صدا جایگزین سبد ملی نمی‌شود.",
          )}
        </p>
        <p>
          {w(
            "Commodity collections require World Bank Pink Sheet as the primary source and IMF as a separate validation source. Crypto prices must name Coinbase or Binance; CoinGecko is an aggregated reference. These feeds are registered requirements, not currently displayed observations.",
            "گردآوری کالاهای جهانی به Pink Sheet بانک جهانی به‌عنوان منبع اصلی و صندوق بین‌المللی پول برای اعتبارسنجی مستقل نیاز دارد. قیمت رمزارز باید نام کوین‌بیس یا بایننس داشته باشد؛ کوین‌گکو مرجع تجمیعی است. این جریان‌ها الزامات ثبت‌شده‌اند، نه مشاهدات فعلی صفحه.",
          )}
        </p>
      </details>
      <details className="methodDisclosure">
        <summary>
          {w("Timing, permissions and currency conversion", "زمان، مجوز و تبدیل ارز")}
        </summary>
        <p>
          {w(
            "Delayed exchange data must show the observation time, retrieval time and declared delay. Free access does not automatically permit commercial display, redistribution or non-display use. Marketplace collection requires a current terms and access-policy review; a machine-readable interface takes precedence over scraping.",
            "داده بورسی با تأخیر باید زمان مشاهده، دریافت و تأخیر اعلام‌شده را نشان دهد. دسترسی رایگان خودبه‌خود مجوز نمایش تجاری، بازنشر یا استفاده غیرنمایشی نیست. گردآوری بازار آگهی نیازمند بررسی جاری شرایط و سیاست دسترسی است؛ رابط ماشین‌خوان بر خزش اولویت دارد.",
          )}
        </p>
        <p>
          {w(
            "Raw values and units remain unchanged. Currency conversion is a separate result with the original amount, currency, rate, rate source, converted amount, target currency and timestamp. A price index cannot be currency-converted. CSV downloads include the complete observation provenance; null means unknown or not applicable, never zero.",
            "مقدار و واحد خام تغییر نمی‌کنند. تبدیل ارز نتیجه‌ای جدا با مبلغ و ارز اصلی، نرخ، منبع نرخ، مبلغ تبدیل‌شده، ارز مقصد و زمان است. شاخص قیمت را نمی‌توان تبدیل ارزی کرد. CSV شناسنامه کامل مشاهده را دارد؛ null یعنی نامعلوم یا نامرتبط، نه صفر.",
          )}
        </p>
      </details>
      <details className="methodDisclosure">
        <summary>
          {w(
            `Supplied source catalog · ${catalog.entries.length} entries awaiting connection review`,
            `فهرست منابع پیشنهادی · ${catalog.entries.length} مورد در انتظار بررسی اتصال`,
          )}
        </summary>
        <p>
          {w(
            "These are the sources in the supplied catalog. Grades and access claims remain unverified; combined provider rows require separate dataset profiles. None of these entries is presented as a connected feed. Provider names are shown in their supplied language.",
            "این‌ها منابع فهرست ارائه‌شده‌اند. درجه و ادعای دسترسی هنوز تأیید نشده و ردیف‌های چندمنبعی به نمایه مستقل مجموعه‌داده نیاز دارند. هیچ‌کدام به‌عنوان جریان متصل معرفی نمی‌شود. نام منبع به زبان فهرست اصلی آمده است.",
          )}
        </p>
        {Array.from(new Set(catalog.entries.map((entry) => entry.country_code))).map((code) => (
          <details className="methodDisclosure" key={code}>
            <summary>
              {catalog.entries.find((entry) => entry.country_code === code)?.country}
            </summary>
            <ul>
              {catalog.entries
                .filter((entry) => entry.country_code === code)
                .map((entry) => (
                  <li key={entry.id} lang="en">
                    <strong>{entry.source_name}</strong> — {entry.category} ·{" "}
                    {w("Supplied grade", "درجه پیشنهادی")}: {entry.declared_grade}
                  </li>
                ))}
            </ul>
          </details>
        ))}
      </details>
    </section>
  );
}
