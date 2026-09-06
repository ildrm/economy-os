"use client";

import type { Locale } from "@economyos/i18n";
import Link from "next/link";
import { useState } from "react";
import type { LabPresets } from "../_lib/lab-presets";
import { importCost, purchasingPower } from "../_lib/learning-math";
import { publicHref, publicLanguage, words } from "../_lib/public-copy";

const modes = ["power", "savings", "imports", "supply", "choices"] as const;
type Mode = (typeof modes)[number];

export function LearningLab({ locale, presets }: { locale: Locale; presets: LabPresets }) {
  const w = (en: string, fa: string) => words(locale, en, fa);
  const [mode, setMode] = useState<Mode>("power");
  const [price, setPrice] = useState(5);
  const [years, setYears] = useState(1);
  const [interest, setInterest] = useState(3);
  const [share, setShare] = useState(50);
  const [preset, setPreset] = useState(0);
  const labels = [
    w("Purchasing power", "قدرت خرید"),
    w("Savings", "پس‌انداز"),
    w("Import costs", "هزینه واردات"),
    w("Supply & demand", "عرضه و تقاضا"),
    w("Choices over time", "انتخاب در طول زمان"),
  ];
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const result =
    mode === "imports"
      ? importCost(price, share)
      : purchasingPower(price, years, mode === "savings" ? interest : 0);
  const supply = presets.supply[preset] ?? presets.supply[0];
  const choice = presets.choice[preset] ?? presets.choice[0];
  const simple = mode === "power" || mode === "savings" || mode === "imports";
  return (
    <main
      id="main-content"
      className="intelligenceMain publicMain"
      tabIndex={-1}
      lang={publicLanguage(locale)}
      dir={locale === "fa" ? "rtl" : "ltr"}
    >
      <header className="publicHeader">
        <h1>{w("Small changes, explained.", "تغییرهای کوچک، به زبان ساده.")}</h1>
        <p>
          {w(
            "Change one assumption and see what follows. These are examples, not predictions.",
            "یک فرض را تغییر دهید و نتیجه را ببینید. این‌ها مثال‌اند، نه پیش‌بینی.",
          )}
        </p>
      </header>
      <fieldset className="topicTabs" aria-label={w("Choose an example", "انتخاب مثال")}>
        {modes.map((item, index) => (
          <button
            type="button"
            key={item}
            aria-pressed={mode === item}
            onClick={() => {
              setMode(item);
              setPreset(0);
            }}
          >
            {labels[index]}
          </button>
        ))}
      </fieldset>
      <div className="labGrid">
        <section className="publicPanel labControls" aria-labelledby="lab-controls">
          <h2 id="lab-controls">{w("Choose a starting point", "یک نقطه شروع انتخاب کنید")}</h2>
          {simple ? (
            <>
              <fieldset className="choiceButtons" aria-label={w("Price assumptions", "فرض قیمت")}>
                {[0, 5, -5].map((value, index) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={price === value}
                    onClick={() => setPrice(value)}
                  >
                    {
                      [
                        w("Stable prices", "قیمت ثابت"),
                        w("Rising prices", "افزایش قیمت"),
                        w("Falling prices", "کاهش قیمت"),
                      ][index]
                    }
                  </button>
                ))}
              </fieldset>
              <RangeControl
                label={
                  mode === "imports"
                    ? w("Change in foreign-currency price", "تغییر قیمت ارز خارجی")
                    : w("Annual price change", "تغییر سالانه قیمت‌ها")
                }
                value={price}
                min={-20}
                max={50}
                suffix="%"
                onChange={setPrice}
                locale={locale}
              />
              {mode === "imports" ? (
                <RangeControl
                  label={w("Imported share of costs", "سهم واردات از هزینه‌ها")}
                  value={share}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={setShare}
                  locale={locale}
                />
              ) : (
                <RangeControl
                  label={w("Years", "سال")}
                  value={years}
                  min={1}
                  max={10}
                  onChange={setYears}
                  locale={locale}
                />
              )}
              {mode === "savings" ? (
                <RangeControl
                  label={w("Annual savings interest", "سود سالانه پس‌انداز")}
                  value={interest}
                  min={0}
                  max={30}
                  suffix="%"
                  onChange={setInterest}
                  locale={locale}
                />
              ) : null}
            </>
          ) : (
            <>
              <fieldset
                className="choiceButtons verticalChoices"
                aria-label={w("Model assumptions", "فرض‌های مدل")}
              >
                {(mode === "supply"
                  ? [
                      w("Normal harvest", "برداشت معمول"),
                      w("Smaller harvest", "برداشت کمتر"),
                      w("Harvest unknown", "برداشت نامعلوم"),
                    ]
                  : [
                      w("No extra preference for now", "بدون ترجیح اضافی برای حال"),
                      w("Some preference for now", "ترجیح متوسط برای حال"),
                      w("Strong preference for now", "ترجیح زیاد برای حال"),
                    ]
                ).map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={preset === index}
                    onClick={() => setPreset(index)}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
              <p>
                {mode === "supply"
                  ? w(
                      "A fictional grain economy: imports and opening stocks add 30 tonnes. Total uses, including closing stocks, are 110 tonnes.",
                      "اقتصاد فرضی غلات: واردات و موجودی آغاز دوره ۳۰ تن اضافه می‌کند. کل مصارف با موجودی پایان دوره ۱۱۰ تن است.",
                    )
                  : w(
                      "Compare 80 units of satisfaction now with 100 next period. These are assumed utility units, not money or measured preferences.",
                      "۸۰ واحد رضایت اکنون را با ۱۰۰ واحد در دوره بعد مقایسه کنید. این‌ها واحد مطلوبیت فرضی‌اند، نه پول یا ترجیحات اندازه‌گیری‌شده.",
                    )}
              </p>
            </>
          )}
          <button
            className="textAction"
            type="button"
            onClick={() => {
              setPrice(5);
              setYears(1);
              setInterest(3);
              setShare(50);
              setPreset(0);
            }}
          >
            {w("Reset example", "بازنشانی مثال")}
          </button>
        </section>
        <section
          className="examplePanel labResult"
          aria-label={w("Example result", "نتیجه مثال")}
          aria-live="polite"
          aria-atomic="true"
        >
          <h2>
            {simple
              ? mode === "imports"
                ? w("What the same inputs cost", "هزینه همان نهاده‌ها")
                : w("What your money can buy", "پول شما چه مقدار می‌خرد")
              : mode === "supply"
                ? w("Is there enough to go around?", "آیا عرضه کافی است؟")
                : w(
                    "Which option has more value in this model?",
                    "کدام گزینه در این مدل ارزش بیشتری دارد؟",
                  )}
          </h2>
          {simple ? (
            <>
              <p className="exampleNumber">{number(result)}</p>
              <p>
                {mode === "imports"
                  ? w(
                      "Cost of inputs that previously cost 100",
                      "هزینه نهاده‌هایی که قبلاً ۱۰۰ بودند",
                    )
                  : mode === "savings"
                    ? w("Buying power of an initial saving of 100", "قدرت خرید پس‌انداز اولیه ۱۰۰")
                    : w("Buying power of an unchanged 100", "قدرت خرید مبلغ ثابت ۱۰۰")}
              </p>
              <p className="resultDifference">
                {number(Math.abs(result - 100))}%{" "}
                {result < 100
                  ? w("less than today", "کمتر از امروز")
                  : w("more than today", "بیشتر از امروز")}
              </p>
              <div className="barComparison">
                <ValueBar
                  label={w("Today", "امروز")}
                  value={100}
                  max={Math.max(100, result)}
                  locale={locale}
                />
                <ValueBar
                  label={
                    mode === "imports"
                      ? w("After the change", "پس از تغییر")
                      : `${w("Years", "سال")} ${number(years)}`
                  }
                  value={result}
                  max={Math.max(100, result)}
                  locale={locale}
                />
              </div>
              <p className="exampleFootnote">
                {w(
                  "Illustrative example · constant assumptions throughout the period",
                  "مثال آموزشی · فرض‌ها در تمام دوره ثابت‌اند",
                )}
              </p>
            </>
          ) : mode === "supply" && supply ? (
            supply.result.status === "missing" ? (
              <>
                <p className="resultStatement">
                  {w("Not enough information", "اطلاعات کافی نیست")}
                </p>
                <p>
                  {w(
                    "Production is unknown, so the balance stays unknown. Missing is not zero.",
                    "تولید نامعلوم است، پس تراز هم نامعلوم می‌ماند. نبود داده به معنی صفر نیست.",
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="exampleNumber">{number(Math.abs(Number(supply.result.imbalance)))}</p>
                <p>
                  {Number(supply.result.imbalance) >= 0
                    ? w("tonnes of surplus", "تن مازاد")
                    : w("tonnes of shortage", "تن کمبود")}
                </p>
                <div className="barComparison">
                  <ValueBar
                    label={w("Available", "در دسترس")}
                    value={Number(supply.result.supply)}
                    max={130}
                    locale={locale}
                  />
                  <ValueBar
                    label={w("Total uses", "کل مصارف")}
                    value={Number(supply.result.uses)}
                    max={130}
                    locale={locale}
                  />
                </div>
              </>
            )
          ) : choice ? (
            <>
              <p className="resultStatement">
                {Number(choice.now) > Number(choice.later)
                  ? w("The immediate option", "گزینه فوری")
                  : w("The later option", "گزینه آینده")}
              </p>
              <div className="barComparison">
                <ValueBar
                  label={w("Now", "اکنون")}
                  value={Number(choice.now)}
                  max={100}
                  locale={locale}
                />
                <ValueBar
                  label={w("Later", "آینده")}
                  value={Number(choice.later)}
                  max={100}
                  locale={locale}
                />
              </div>
              <p>
                {w(
                  "This compares assumed utility. It does not tell you what you should choose.",
                  "این مقایسه مطلوبیت فرضی است و نمی‌گوید چه انتخابی باید داشته باشید.",
                )}
              </p>
            </>
          ) : null}
        </section>
      </div>
      <section className="publicPanel labExplanation">
        <h2>{w("Why this happens", "چرا این اتفاق می‌افتد؟")}</h2>
        <p>
          {mode === "imports"
            ? w(
                "When foreign currency costs more, imported inputs cost more if their foreign price is unchanged. The example holds domestic costs fixed and passes the full currency change into imported costs.",
                "وقتی ارز خارجی گران‌تر می‌شود، نهاده وارداتی با قیمت خارجی ثابت گران‌تر می‌شود. در این مثال هزینه داخلی ثابت است و تغییر ارز کامل به هزینه وارداتی منتقل می‌شود.",
              )
            : mode === "supply"
              ? w(
                  "Supply includes production, imports and opening inventory. Uses include consumption, investment, exports and closing inventory. The difference is a physical surplus or shortage.",
                  "عرضه شامل تولید، واردات و موجودی آغاز دوره است. مصارف شامل مصرف، سرمایه‌گذاری، صادرات و موجودی پایان دوره است. اختلاف، مازاد یا کمبود فیزیکی است.",
                )
              : mode === "choices"
                ? w(
                    "The model discounts future satisfaction and can apply an additional preference for the present. Changing that assumption can reverse the preferred option.",
                    "مدل، رضایت آینده را تنزیل می‌کند و می‌تواند ترجیح اضافی برای حال اعمال کند. تغییر این فرض ممکن است گزینه ترجیحی را عوض کند.",
                  )
                : w(
                    "When prices rise, each unit of money buys less. Over several years, the effect compounds. Interest may offset some or all of that change in a savings example.",
                    "با افزایش قیمت‌ها هر واحد پول کمتر می‌خرد. اثر در چند سال مرکب می‌شود. سود پس‌انداز ممکن است بخشی یا تمام این تغییر را جبران کند.",
                  )}
        </p>
        <details className="methodDisclosure">
          <summary>{w("See the calculation & assumptions", "مشاهده محاسبه و فرض‌ها")}</summary>
          <p>
            {w(
              "All inputs are illustrative. No taxes, fees, changing income, feedback effects or uncertainty are modeled.",
              "همه ورودی‌ها فرضی‌اند. مالیات، کارمزد، تغییر درآمد، بازخورد و عدم قطعیت در مدل نیامده‌اند.",
            )}
          </p>
          <p className="formula" dir="ltr" lang="en">
            {mode === "imports"
              ? "Cost = 100 × (1 + quote change × imported share)"
              : mode === "supply"
                ? "Balance = production + imports + opening stocks − all uses"
                : mode === "choices"
                  ? "U = u(now) + β × δ × u(next period)"
                  : "Buying power = 100 × ((1 + interest) / (1 + inflation)) ^ years"}
          </p>
          {mode === "choices" && choice ? (
            <p dir="ltr">
              β = {choice.beta}, δ = {choice.delta}
            </p>
          ) : null}
          {mode === "supply" && supply ? (
            <dl className="assumptionList">
              {Object.entries(supply.input)
                .filter(([key]) => key !== "commodityKey" && key !== "unit")
                .map(([key, value], index) => (
                  <div key={key}>
                    <dt>
                      {
                        [
                          w("Production", "تولید"),
                          w("Imports", "واردات"),
                          w("Opening stocks", "موجودی آغاز"),
                          w("Intermediate use", "مصرف واسطه‌ای"),
                          w("Households", "خانوارها"),
                          w("Government", "دولت"),
                          w("Investment", "سرمایه‌گذاری"),
                          w("Exports", "صادرات"),
                          w("Closing stocks", "موجودی پایان"),
                        ][index]
                      }
                    </dt>
                    <dd>
                      {value === null ? w("Unknown", "نامعلوم") : number(Number(value))}{" "}
                      {value !== null ? w("tonnes", "تن") : ""}
                    </dd>
                  </div>
                ))}
            </dl>
          ) : null}
          <p>
            {w(
              "Rates in the formula are fractions: 5% means 0.05. Model results are rounded only for display.",
              "نرخ در فرمول اعشاری است: ۵٪ یعنی ۰٫۰۵. نتایج فقط برای نمایش گرد می‌شوند.",
            )}
          </p>
        </details>
        <Link
          className="inlineLink"
          href={`${publicHref(locale, "concepts")}&topic=${mode === "imports" || mode === "supply" ? "trade" : mode === "choices" || mode === "savings" ? "money" : "prices"}`}
        >
          {w("Explore the related concepts", "شناخت مفاهیم مرتبط")}
          <span className="chevron" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}

export function RangeControl({
  label,
  value,
  min,
  max,
  suffix = "",
  onChange,
  locale,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
  locale: Locale;
}) {
  const format = (value: number) => `${new Intl.NumberFormat(locale).format(value)}${suffix}`;
  return (
    <label className="rangeControl">
      <span>
        {label}
        <strong>{format(value)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        step={1}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={format(value)}
      />
      <span className="rangeEnds" aria-hidden="true">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </span>
    </label>
  );
}

function ValueBar({
  label,
  value,
  max,
  locale,
}: {
  label: string;
  value: number;
  max: number;
  locale: Locale;
}) {
  return (
    <div className="valueBar">
      <span>{label}</span>
      <span className="barTrack" aria-hidden="true">
        <span style={{ width: `${(value / max) * 100}%` }} />
      </span>
      <strong>{new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}</strong>
    </div>
  );
}
