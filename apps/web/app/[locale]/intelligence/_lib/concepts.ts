import type { Locale } from "@economyos/i18n";
import { words } from "./public-copy";

export const TOPICS = [
  {
    id: "prices",
    name: ["Prices & purchasing power", "قیمت‌ها و قدرت خرید"],
    question: ["Why does the same shopping cost more?", "چرا خرید همیشگی گران‌تر شده است؟"],
  },
  {
    id: "work",
    name: ["Jobs & livelihoods", "کار و معیشت"],
    question: ["Why is it hard to find good work?", "چرا پیدا کردن کار مناسب دشوار است؟"],
  },
  {
    id: "money",
    name: ["Money & borrowing", "پول و وام"],
    question: [
      "Why do loans and savings cost differently?",
      "سود پس‌انداز و هزینه وام چگونه تغییر می‌کند؟",
    ],
  },
  {
    id: "trade",
    name: ["Trade & currencies", "تجارت و ارز"],
    question: ["What changes when the exchange rate moves?", "با تغییر نرخ ارز چه اتفاقی می‌افتد؟"],
  },
  {
    id: "investment",
    name: ["Opportunity & investment", "فرصت و سرمایه‌گذاری"],
    question: ["Why do some places grow faster?", "چرا بعضی اقتصادها سریع‌تر رشد می‌کنند؟"],
  },
  {
    id: "wellbeing",
    name: ["Wellbeing & fairness", "رفاه و عدالت"],
    question: ["Why do outcomes differ across people?", "چرا وضعیت اقتصادی افراد متفاوت است؟"],
  },
] as const;
export type TopicId = (typeof TOPICS)[number]["id"];
type Pair = readonly [string, string];
export interface Concept {
  readonly id: string;
  readonly topic: TopicId;
  readonly name: Pair;
  readonly explanation: Pair;
  readonly measure: Pair;
  readonly boundary: Pair;
}

export const CONCEPTS: readonly Concept[] = [
  {
    id: "inflation",
    topic: "prices",
    name: ["Inflation", "تورم"],
    explanation: [
      "A broad rise in prices. If income stays the same, the same money buys less.",
      "افزایش عمومی قیمت‌ها. اگر درآمد ثابت بماند، با همان پول کالای کمتری می‌توان خرید.",
    ],
    measure: [
      "Percentage change in a price index over a stated period.",
      "درصد تغییر شاخص قیمت‌ها در یک دوره مشخص.",
    ],
    boundary: [
      "Your own basket may differ from the average. Slower inflation still means rising prices when the rate is positive.",
      "سبد خرید شما ممکن است با میانگین فرق کند. کاهش نرخ تورم مثبت به معنی ارزان شدن نیست.",
    ],
  },
  {
    id: "purchasing-power",
    topic: "prices",
    name: ["Purchasing power", "قدرت خرید"],
    explanation: [
      "How much goods and services your money can buy.",
      "مقدار کالا و خدماتی که می‌توانید با پول خود بخرید.",
    ],
    measure: [
      "Money income or savings divided by an appropriate price index.",
      "درآمد یا پس‌انداز پولی تقسیم بر شاخص قیمت مناسب.",
    ],
    boundary: [
      "A national average does not describe every household’s costs.",
      "میانگین کشوری هزینه‌های همه خانوارها را نشان نمی‌دهد.",
    ],
  },
  {
    id: "real-wages",
    topic: "prices",
    name: ["Real wages", "دستمزد واقعی"],
    explanation: [
      "Pay after accounting for changes in prices. A pay rise can still buy less if prices rise faster.",
      "دستمزد پس از در نظر گرفتن تغییر قیمت‌ها. اگر قیمت‌ها سریع‌تر افزایش یابند، افزایش حقوق هم ممکن است کافی نباشد.",
    ],
    measure: [
      "Wage index divided by a relevant price index.",
      "شاخص دستمزد تقسیم بر شاخص قیمت مرتبط.",
    ],
    boundary: [
      "Average wages can rise because the mix of workers changes.",
      "میانگین دستمزد ممکن است به دلیل تغییر ترکیب شاغلان افزایش یابد.",
    ],
  },
  {
    id: "core-inflation",
    topic: "prices",
    name: ["Core inflation", "تورم هسته"],
    explanation: [
      "A price measure that removes selected volatile items to help examine underlying price pressure.",
      "معیاری که برخی اقلام پرنوسان را حذف می‌کند تا فشار زیربنایی قیمت‌ها روشن‌تر شود.",
    ],
    measure: [
      "A published core price index; exclusions depend on the statistical agency.",
      "شاخص رسمی قیمت هسته؛ اقلام حذف‌شده به روش نهاد آماری بستگی دارد.",
    ],
    boundary: [
      "Food and energy still matter to household budgets even when excluded.",
      "خوراک و انرژی حتی اگر از شاخص حذف شوند، برای بودجه خانوار مهم‌اند.",
    ],
  },
  {
    id: "deflation",
    topic: "prices",
    name: ["Deflation", "کاهش عمومی قیمت‌ها"],
    explanation: [
      "A broad fall in prices. Money may buy more, while debt can become harder to repay in real terms.",
      "کاهش عمومی سطح قیمت‌ها. پول ممکن است قدرت خرید بیشتری پیدا کند، اما بار واقعی بدهی هم افزایش می‌یابد.",
    ],
    measure: ["A negative change in a broad price index.", "تغییر منفی در شاخص عمومی قیمت‌ها."],
    boundary: [
      "A discount on one product is not economy-wide deflation.",
      "تخفیف یک کالا به معنی کاهش عمومی قیمت‌ها نیست.",
    ],
  },
  {
    id: "stagflation",
    topic: "prices",
    name: ["Stagflation", "رکود تورمی"],
    explanation: [
      "Persistent price pressure alongside weak activity and difficult labour-market conditions.",
      "فشار مداوم قیمت‌ها همراه با فعالیت اقتصادی ضعیف و شرایط دشوار بازار کار.",
    ],
    measure: [
      "Inflation, real growth and labour indicators considered together.",
      "بررسی هم‌زمان تورم، رشد واقعی و شاخص‌های بازار کار.",
    ],
    boundary: [
      "There is no single universal threshold that proves stagflation.",
      "یک آستانه واحد و جهانی برای اثبات رکود تورمی وجود ندارد.",
    ],
  },
  {
    id: "gdp",
    topic: "work",
    name: ["Economic output (GDP)", "تولید اقتصادی (تولید ناخالص داخلی)"],
    explanation: [
      "The value of final goods and services produced in an economy over a period.",
      "ارزش کالاها و خدمات نهایی تولیدشده در اقتصاد طی یک دوره.",
    ],
    measure: [
      "Real GDP removes price changes; nominal GDP uses current prices.",
      "تولید واقعی اثر تغییر قیمت‌ها را حذف می‌کند؛ تولید اسمی با قیمت‌های جاری محاسبه می‌شود.",
    ],
    boundary: [
      "Output is not a complete measure of wellbeing, distribution or unpaid work.",
      "تولید، رفاه، توزیع درآمد و کار بدون دستمزد را به‌طور کامل اندازه نمی‌گیرد.",
    ],
  },
  {
    id: "unemployment",
    topic: "work",
    name: ["Unemployment", "بیکاری"],
    explanation: [
      "People without work who are available and actively seeking it, under the survey definition.",
      "افراد بدون کار که طبق تعریف پیمایش، آماده کار و در جست‌وجوی آن هستند.",
    ],
    measure: ["Unemployed people as a share of the labour force.", "سهم بیکاران از جمعیت فعال."],
    boundary: [
      "People who stop looking may leave this measure even when they need work.",
      "افرادی که از جست‌وجوی کار منصرف شده‌اند ممکن است در این شاخص دیده نشوند.",
    ],
  },
  {
    id: "participation",
    topic: "work",
    name: ["Labour participation", "مشارکت اقتصادی"],
    explanation: [
      "How many working-age people are employed or looking for work.",
      "چه سهمی از جمعیت در سن کار، شاغل یا در جست‌وجوی کار است.",
    ],
    measure: [
      "Labour force divided by the defined working-age population.",
      "جمعیت فعال تقسیم بر جمعیت در سن کار مطابق تعریف آماری.",
    ],
    boundary: [
      "Age, education, caregiving and local definitions affect comparisons.",
      "سن، تحصیل، مسئولیت مراقبتی و تعریف محلی بر مقایسه اثر دارند.",
    ],
  },
  {
    id: "productivity",
    topic: "work",
    name: ["Productivity", "بهره‌وری"],
    explanation: [
      "How much output is produced for each unit of input, such as an hour of work.",
      "مقدار تولید به ازای هر واحد نهاده، مانند یک ساعت کار.",
    ],
    measure: [
      "Real output per hour or per worker, with the denominator stated.",
      "تولید واقعی به ازای ساعت کار یا شاغل با ذکر مخرج شاخص.",
    ],
    boundary: [
      "Productivity growth does not guarantee that everyone’s wages rise.",
      "رشد بهره‌وری تضمین نمی‌کند دستمزد همه افزایش یابد.",
    ],
  },
  {
    id: "underemployment",
    topic: "work",
    name: ["Underemployment", "اشتغال ناکافی"],
    explanation: [
      "Having work but wanting and being available for more hours under the statistical definition.",
      "داشتن کار همراه با تمایل و آمادگی برای ساعات کار بیشتر طبق تعریف آماری.",
    ],
    measure: [
      "Time-related underemployment from labour surveys.",
      "شاخص اشتغال ناکافی زمانی از پیمایش‌های نیروی کار.",
    ],
    boundary: [
      "Hours alone do not measure job quality, security or skill mismatch.",
      "ساعات کار به‌تنهایی کیفیت، امنیت یا تناسب مهارت را نشان نمی‌دهد.",
    ],
  },
  {
    id: "business-cycle",
    topic: "work",
    name: ["Business cycle", "چرخه تجاری"],
    explanation: [
      "Periods of stronger and weaker activity across output, employment and spending.",
      "دوره‌های تقویت و تضعیف فعالیت در تولید، اشتغال و مخارج.",
    ],
    measure: [
      "Several activity indicators over time, with turning points identified by a stated method.",
      "چند شاخص فعالیت در طول زمان با روش مشخص تعیین نقاط چرخش.",
    ],
    boundary: [
      "A cycle label is an interpretation and can change after data revisions.",
      "برچسب چرخه یک تفسیر است و ممکن است با بازنگری داده‌ها تغییر کند.",
    ],
  },
  {
    id: "interest",
    topic: "money",
    name: ["Interest rates", "نرخ بهره"],
    explanation: [
      "The cost of borrowing or the return paid on some savings over a stated period.",
      "هزینه قرض گرفتن یا بازده برخی پس‌اندازها در یک دوره مشخص.",
    ],
    measure: [
      "Annual rate, with fees, compounding and instrument identified.",
      "نرخ سالانه با ذکر کارمزد، روش مرکب شدن و نوع ابزار.",
    ],
    boundary: [
      "A central-bank policy rate is not the rate every household or business pays.",
      "نرخ سیاستی بانک مرکزی همان نرخ پرداختی هر خانوار یا کسب‌وکار نیست.",
    ],
  },
  {
    id: "real-interest",
    topic: "money",
    name: ["Real interest rate", "نرخ بهره واقعی"],
    explanation: [
      "A savings return or borrowing cost adjusted for inflation.",
      "بازده پس‌انداز یا هزینه وام پس از تعدیل تورم.",
    ],
    measure: [
      "(1 + nominal rate) ÷ (1 + inflation) − 1, using rates as fractions.",
      "(۱ + نرخ اسمی) تقسیم بر (۱ + تورم) منهای ۱؛ نرخ‌ها به صورت اعشاری.",
    ],
    boundary: [
      "Expected inflation and inflation measured afterward answer different questions.",
      "تورم انتظاری و تورم اندازه‌گیری‌شده پس از دوره، دو پرسش متفاوت را پاسخ می‌دهند.",
    ],
  },
  {
    id: "credit",
    topic: "money",
    name: ["Credit & debt service", "اعتبار و بازپرداخت بدهی"],
    explanation: [
      "Borrowing brings spending forward; repayments commit part of future income.",
      "وام، مخارج را جلو می‌اندازد و بازپرداخت آن بخشی از درآمد آینده را متعهد می‌کند.",
    ],
    measure: [
      "Debt balances and repayments relative to income or cash flow.",
      "مانده بدهی و پرداخت اقساط نسبت به درآمد یا جریان نقد.",
    ],
    boundary: [
      "A large balance and an unaffordable payment are different problems.",
      "بدهی بزرگ و قسط غیرقابل‌پرداخت، دو مسئله متفاوت‌اند.",
    ],
  },
  {
    id: "liquidity",
    topic: "money",
    name: ["Liquidity", "نقدشوندگی و دسترسی به نقد"],
    explanation: [
      "The ability to meet payments or sell an asset without a large price loss.",
      "توانایی انجام پرداخت‌ها یا فروش دارایی بدون افت شدید قیمت.",
    ],
    measure: [
      "Cash buffers, funding access, market depth and transaction costs.",
      "ذخیره نقد، دسترسی به تأمین مالی، عمق بازار و هزینه معامله.",
    ],
    boundary: [
      "Liquidity is different from solvency: an asset-rich business can still run short of cash.",
      "نقدینگی با توانگری متفاوت است؛ یک بنگاه دارای دارایی فراوان هم ممکن است کمبود نقد داشته باشد.",
    ],
  },
  {
    id: "banking-risk",
    topic: "money",
    name: ["Banking-system stress", "فشار بر نظام بانکی"],
    explanation: [
      "Conditions that make it harder for banks to absorb losses and keep providing payments and credit.",
      "شرایطی که تحمل زیان و ادامه خدمات پرداخت و اعتبار را برای بانک‌ها دشوار می‌کند.",
    ],
    measure: [
      "Capital, asset quality, funding and liquidity evidence considered together.",
      "بررسی هم‌زمان شواهد سرمایه، کیفیت دارایی، تأمین مالی و نقدینگی.",
    ],
    boundary: [
      "A stress indicator is not a calibrated probability of bank failure.",
      "شاخص فشار، احتمال اعتبارسنجی‌شده ورشکستگی بانک نیست.",
    ],
  },
  {
    id: "present-bias",
    topic: "money",
    name: ["Present bias", "سوگیری زمان حال"],
    explanation: [
      "Giving an extra preference to benefits available now compared with benefits available later.",
      "ترجیح اضافی برای منفعت همین حالا در مقایسه با منفعت آینده.",
    ],
    measure: [
      "A choice model with explicit immediate and future utility assumptions.",
      "مدل انتخاب با فرض‌های صریح درباره مطلوبیت حال و آینده.",
    ],
    boundary: [
      "A teaching example cannot diagnose a person or predict a population’s choices.",
      "مثال آموزشی نمی‌تواند فردی را تشخیص‌گذاری کند یا انتخاب یک جامعه را پیش‌بینی کند.",
    ],
  },
  {
    id: "exchange-rate",
    topic: "trade",
    name: ["Exchange rates", "نرخ ارز"],
    explanation: [
      "The price of one currency in another. A higher local-currency price of foreign currency makes unchanged foreign prices cost more locally.",
      "قیمت یک ارز به ارز دیگر. افزایش قیمت ارز خارجی به پول داخلی، هزینه داخلی قیمت‌های خارجی ثابت را بالا می‌برد.",
    ],
    measure: [
      "A named currency pair and quote direction at a stated time.",
      "جفت ارز مشخص و جهت نرخ‌گذاری در زمان معین.",
    ],
    boundary: [
      "A 20% increase in the currency quote is not a 20% fall in the currency’s reciprocal value.",
      "افزایش ۲۰ درصدی نرخ ارز، با افت ۲۰ درصدی ارزش معکوس آن برابر نیست.",
    ],
  },
  {
    id: "trade-balance",
    topic: "trade",
    name: ["Trade balance", "تراز تجاری"],
    explanation: ["Exports minus imports over a period.", "صادرات منهای واردات در یک دوره."],
    measure: [
      "Values in a common currency; specify goods only or goods and services.",
      "مقادیر به ارز مشترک؛ با تعیین اینکه فقط کالا یا کالا و خدمات است.",
    ],
    boundary: [
      "A deficit is not automatically bad; its financing and economic context matter.",
      "کسری لزوماً بد نیست؛ شیوه تأمین مالی و شرایط اقتصاد اهمیت دارد.",
    ],
  },
  {
    id: "current-account",
    topic: "trade",
    name: ["Current account", "حساب جاری"],
    explanation: [
      "Trade in goods and services plus primary income and current transfers with the rest of the world.",
      "تجارت کالا و خدمات به‌علاوه درآمد اولیه و انتقالات جاری با بقیه جهان.",
    ],
    measure: [
      "Balance in currency or as a percentage of GDP.",
      "مانده به واحد پول یا درصدی از تولید ناخالص داخلی.",
    ],
    boundary: [
      "It is broader than the trade balance and is not the government budget.",
      "از تراز تجاری گسترده‌تر است و همان بودجه دولت نیست.",
    ],
  },
  {
    id: "reserves",
    topic: "trade",
    name: ["Foreign-exchange reserves", "ذخایر ارزی"],
    explanation: [
      "External assets held by monetary authorities that can help meet international payment needs.",
      "دارایی‌های خارجی در اختیار مقامات پولی که می‌تواند به پرداخت‌های بین‌المللی کمک کند.",
    ],
    measure: [
      "Usable reserves relative to imports or short-term external obligations.",
      "ذخایر قابل‌استفاده نسبت به واردات یا تعهدات خارجی کوتاه‌مدت.",
    ],
    boundary: [
      "Headline reserves may not all be liquid, accessible or unencumbered.",
      "تمام ذخایر اعلام‌شده لزوماً نقد، در دسترس یا بدون تعهد نیستند.",
    ],
  },
  {
    id: "currency-risk",
    topic: "trade",
    name: ["Currency-crisis risk", "ریسک بحران ارزی"],
    explanation: [
      "Vulnerability to a sharply defined currency event over a stated future horizon.",
      "آسیب‌پذیری در برابر یک رویداد ارزی با تعریف دقیق و افق زمانی مشخص.",
    ],
    measure: [
      "Event definition, horizon, model, historical tests and calibration evidence.",
      "تعریف رویداد، افق، مدل، آزمون تاریخی و شواهد کالیبراسیون.",
    ],
    boundary: [
      "An uncalibrated risk index must not be shown as a probability or a certain warning.",
      "شاخص ریسک بدون کالیبراسیون نباید احتمال یا هشدار قطعی معرفی شود.",
    ],
  },
  {
    id: "supply-balance",
    topic: "trade",
    name: ["Supply, demand & shortages", "عرضه، تقاضا و کمبود"],
    explanation: [
      "Compare production, imports and opening stocks with all uses, exports and closing stocks.",
      "مقایسه تولید، واردات و موجودی آغاز دوره با تمام مصارف، صادرات و موجودی پایان دوره.",
    ],
    measure: [
      "Available supply minus total uses, in one commodity and one unit.",
      "عرضه در دسترس منهای کل مصارف برای یک کالا و یک واحد.",
    ],
    boundary: [
      "A physical balance is an accounting identity, not a forecast of prices or an allocation policy.",
      "تراز فیزیکی یک رابطه حسابداری است، نه پیش‌بینی قیمت یا سیاست تخصیص.",
    ],
  },
  {
    id: "investment",
    topic: "investment",
    name: ["Investment & productive capacity", "سرمایه‌گذاری و ظرفیت تولید"],
    explanation: [
      "Resources used today to create assets and the ability to produce in the future.",
      "منابعی که امروز برای ایجاد دارایی و توان تولید آینده استفاده می‌شوند.",
    ],
    measure: [
      "Capital formation, depreciation and capacity, with real and nominal measures separated.",
      "تشکیل سرمایه، استهلاک و ظرفیت، با تفکیک مقادیر واقعی و اسمی.",
    ],
    boundary: [
      "Buying a financial asset is not always new productive investment in national accounts.",
      "خرید دارایی مالی همیشه به معنی سرمایه‌گذاری تولیدی جدید در حساب‌های ملی نیست.",
    ],
  },
  {
    id: "valuation",
    topic: "investment",
    name: ["Asset valuation", "ارزش‌گذاری دارایی"],
    explanation: [
      "Assessing a price relative to expected cash flows, income or other economic fundamentals.",
      "سنجش قیمت نسبت به جریان نقد، درآمد یا سایر عوامل بنیادی اقتصادی.",
    ],
    measure: [
      "Instrument-specific measures such as price-to-earnings or rental yield.",
      "معیارهای متناسب با ابزار مانند نسبت قیمت به سود یا بازده اجاره.",
    ],
    boundary: [
      "A supportive economy alone does not establish a cheap asset or a buy recommendation.",
      "اقتصاد مساعد به‌تنهایی نشان نمی‌دهد یک دارایی ارزان است یا باید خریداری شود.",
    ],
  },
  {
    id: "diversification",
    topic: "investment",
    name: ["Diversification", "تنوع‌بخشی"],
    explanation: [
      "Spreading exposure across sources of risk so one outcome matters less to the whole.",
      "پخش مواجهه میان منابع ریسک تا یک نتیجه بر کل دارایی اثر کمتری بگذارد.",
    ],
    measure: [
      "Exposures, correlations and shared risk factors.",
      "میزان مواجهه، همبستگی‌ها و عوامل ریسک مشترک.",
    ],
    boundary: [
      "Correlations can change during stress. Diversification cannot remove every loss.",
      "همبستگی در بحران تغییر می‌کند. تنوع‌بخشی همه زیان‌ها را حذف نمی‌کند.",
    ],
  },
  {
    id: "sovereign-risk",
    topic: "investment",
    name: ["Sovereign-debt risk", "ریسک بدهی دولت"],
    explanation: [
      "Conditions affecting a government’s ability and willingness to meet its debt obligations.",
      "شرایط مؤثر بر توانایی و تمایل دولت به ایفای تعهدات بدهی.",
    ],
    measure: [
      "Debt service, revenues, maturity, currency exposure and financing conditions.",
      "خدمت بدهی، درآمد، سررسید، مواجهه ارزی و شرایط تأمین مالی.",
    ],
    boundary: [
      "Debt-to-GDP alone cannot establish a default probability.",
      "نسبت بدهی به تولید به‌تنهایی احتمال نکول را تعیین نمی‌کند.",
    ],
  },
  {
    id: "regime",
    topic: "investment",
    name: ["Economic regimes", "رژیم‌های اقتصادی"],
    explanation: [
      "A way to describe the current combination of growth, inflation, financing and policy conditions.",
      "روشی برای توصیف ترکیب فعلی رشد، تورم، تأمین مالی و سیاست‌ها.",
    ],
    measure: [
      "Several separately defined dimensions with dated model assumptions.",
      "چند بعد مستقل با تعریف روشن و فرض‌های مدل در زمان مشخص.",
    ],
    boundary: [
      "Labels are model-dependent. Ownership, planning and market coordination are separate dimensions.",
      "برچسب‌ها به مدل وابسته‌اند. مالکیت، برنامه‌ریزی و هماهنگی بازار ابعاد جداگانه هستند.",
    ],
  },
  {
    id: "systemic-risk",
    topic: "investment",
    name: ["Systemic risk", "ریسک سیستمی"],
    explanation: [
      "The possibility that stress spreads through connections and disrupts many parts of the economy.",
      "امکان گسترش فشار از راه ارتباطات و اختلال در بخش‌های متعدد اقتصاد.",
    ],
    measure: [
      "Network exposures, concentration, funding links and shock assumptions.",
      "مواجهه‌های شبکه‌ای، تمرکز، پیوندهای تأمین مالی و فرض‌های شوک.",
    ],
    boundary: [
      "A simulated contagion pathway is not evidence that a crisis will occur.",
      "مسیر سرایت شبیه‌سازی‌شده به معنی وقوع حتمی بحران نیست.",
    ],
  },
  {
    id: "inequality",
    topic: "wellbeing",
    name: ["Income & wealth inequality", "نابرابری درآمد و ثروت"],
    explanation: [
      "How unevenly income flows or accumulated wealth are distributed across people.",
      "چگونگی توزیع نامتوازن درآمد یا ثروت انباشته میان افراد.",
    ],
    measure: [
      "Gini, percentile shares or ratios; specify income or wealth and pre- or post-tax basis.",
      "جینی، سهم صدک‌ها یا نسبت‌ها؛ با تعیین درآمد یا ثروت و قبل یا بعد از مالیات.",
    ],
    boundary: [
      "Income and wealth are different. A distribution measure is not a complete moral judgment.",
      "درآمد و ثروت متفاوت‌اند. معیار توزیع، داوری اخلاقی کامل نیست.",
    ],
  },
  {
    id: "poverty",
    topic: "wellbeing",
    name: ["Poverty", "فقر"],
    explanation: [
      "Lacking resources relative to a stated minimum standard of living.",
      "کمبود منابع نسبت به حداقل سطح زندگی تعریف‌شده.",
    ],
    measure: [
      "A defined poverty line, household resources and comparable purchasing-power units.",
      "خط فقر مشخص، منابع خانوار و واحدهای قابل‌مقایسه قدرت خرید.",
    ],
    boundary: [
      "Different national and international poverty lines answer different questions.",
      "خطوط فقر ملی و بین‌المللی متفاوت، پرسش‌های متفاوتی را پاسخ می‌دهند.",
    ],
  },
  {
    id: "housing",
    topic: "wellbeing",
    name: ["Housing affordability", "توان تأمین مسکن"],
    explanation: [
      "How housing costs compare with the income available to pay them.",
      "مقایسه هزینه مسکن با درآمد موجود برای پرداخت آن.",
    ],
    measure: [
      "Rent or mortgage costs relative to disposable income, with tenure and location stated.",
      "اجاره یا هزینه وام مسکن نسبت به درآمد قابل‌تصرف، با ذکر نوع سکونت و مکان.",
    ],
    boundary: [
      "House prices alone do not show household affordability.",
      "قیمت مسکن به‌تنهایی توان پرداخت خانوار را نشان نمی‌دهد.",
    ],
  },
  {
    id: "food-security",
    topic: "wellbeing",
    name: ["Food security", "امنیت غذایی"],
    explanation: [
      "Reliable access to enough safe and nutritious food.",
      "دسترسی پایدار به غذای کافی، سالم و مغذی.",
    ],
    measure: [
      "Direct food-insecurity and undernourishment evidence from credible surveys.",
      "شواهد مستقیم ناامنی غذایی و کم‌غذایی از پیمایش‌های معتبر.",
    ],
    boundary: [
      "Inflation alone cannot establish famine or food insecurity.",
      "تورم به‌تنهایی قحطی یا ناامنی غذایی را اثبات نمی‌کند.",
    ],
  },
  {
    id: "economic-fairness",
    topic: "wellbeing",
    name: ["Economic fairness", "عدالت اقتصادی"],
    explanation: [
      "A question about how opportunities, burdens and benefits are shared.",
      "پرسشی درباره چگونگی تقسیم فرصت‌ها، بارها و منافع.",
    ],
    measure: [
      "Explicit normative assumptions alongside distribution and access indicators.",
      "فرض‌های ارزشی صریح همراه با شاخص‌های توزیع و دسترسی.",
    ],
    boundary: [
      "A fairness proxy depends on values and cannot prove injustice, oppression or intent.",
      "شاخص جانشین عدالت به ارزش‌ها وابسته است و نمی‌تواند بی‌عدالتی، سرکوب یا نیت را اثبات کند.",
    ],
  },
  {
    id: "economic-exclusion",
    topic: "wellbeing",
    name: ["Economic inclusion", "مشارکت فراگیر اقتصادی"],
    explanation: [
      "Access to useful financial services, work, markets and basic economic opportunities.",
      "دسترسی به خدمات مالی مفید، کار، بازار و فرصت‌های پایه اقتصادی.",
    ],
    measure: [
      "Direct evidence on access, use, affordability and barriers across groups.",
      "شواهد مستقیم دسترسی، استفاده، توان پرداخت و موانع در گروه‌های مختلف.",
    ],
    boundary: [
      "An account-ownership statistic alone does not establish equal opportunity.",
      "آمار داشتن حساب بانکی به‌تنهایی برابری فرصت را نشان نمی‌دهد.",
    ],
  },
];

export function conceptText(locale: Locale, pair: Pair): string {
  return words(locale, pair[0], pair[1]);
}

export const METHOD_SOURCES = [
  {
    name: "World Bank · World Development Indicators",
    url: "https://databank.worldbank.org/source/world-development-indicators",
    scope: [
      "Indicator definitions, units and country coverage.",
      "تعریف شاخص‌ها، واحدها و پوشش کشورها.",
    ],
  },
  {
    name: "ILO · ILOSTAT",
    url: "https://ilostat.ilo.org/resources/concepts-and-definitions/",
    scope: [
      "Work, unemployment and labour-statistics definitions.",
      "تعریف کار، بیکاری و آمار نیروی کار.",
    ],
  },
  {
    name: "IMF · Finance & Development",
    url: "https://www.imf.org/en/Publications/fandd/issues/Series/Back-to-Basics",
    scope: [
      "Background explanations of macroeconomic concepts.",
      "توضیحات پایه درباره مفاهیم اقتصاد کلان.",
    ],
  },
] as const;
