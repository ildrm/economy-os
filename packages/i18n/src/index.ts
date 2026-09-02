export const LOCALES = [
  "en",
  "fa",
  "de",
  "fr",
  "zh-Hans",
  "ru",
  "es",
  "pt",
  "hi",
  "ar",
  "hy",
  "tr",
] as const;
export type Locale = (typeof LOCALES)[number];
export type Direction = "ltr" | "rtl";

export const LOCALE_METADATA: Readonly<
  Record<Locale, { direction: Direction; nativeName: string }>
> = {
  en: { direction: "ltr", nativeName: "English" },
  fa: { direction: "rtl", nativeName: "فارسی" },
  de: { direction: "ltr", nativeName: "Deutsch" },
  fr: { direction: "ltr", nativeName: "Français" },
  "zh-Hans": { direction: "ltr", nativeName: "简体中文" },
  ru: { direction: "ltr", nativeName: "Русский" },
  es: { direction: "ltr", nativeName: "Español" },
  pt: { direction: "ltr", nativeName: "Português" },
  hi: { direction: "ltr", nativeName: "हिन्दी" },
  ar: { direction: "rtl", nativeName: "العربية" },
  hy: { direction: "ltr", nativeName: "Հայերեն" },
  tr: { direction: "ltr", nativeName: "Türkçe" },
};

const englishMessages = {
  "app.name": "EconomyOS",
  "app.tagline": "Evidence before assertion",
  "meta.title": "EconomyOS — Evidence before assertion",
  "meta.description": "Point-in-time economic intelligence with reproducible evidence.",
  "nav.global": "Global intelligence",
  "nav.countries": "Countries",
  "nav.evidence": "Evidence",
  "nav.models": "Models",
  "nav.scenarios": "Scenarios",
  "status.foundation": "Foundation accepted",
  "status.lede":
    "This product shell exposes only accepted foundation capability. Economic data and analysis activate after the point-in-time platform passes its gate.",
  "status.unknown": "Unknown — no dataset has been admitted",
  "time.knownAt": "As known at",
  "a11y.language": "Language",
  "a11y.moduleNavigation": "Module navigation",
  "a11y.primary": "Primary",
  "a11y.skipToContent": "Skip to main content",
} as const;

export type MessageKey = keyof typeof englishMessages;
type Catalog = Readonly<Record<MessageKey, string>>;

export const messages = {
  en: englishMessages,
  fa: {
    "app.name": "اکونومی‌اواس",
    "app.tagline": "شواهد پیش از ادعا",
    "meta.title": "اکونومی‌اواس — شواهد پیش از ادعا",
    "meta.description": "هوشمندی اقتصادی نقطه‌درزمان با شواهد بازتولیدپذیر.",
    "nav.global": "هوشمندی جهانی",
    "nav.countries": "کشورها",
    "nav.evidence": "شواهد",
    "nav.models": "مدل‌ها",
    "nav.scenarios": "سناریوها",
    "status.foundation": "زیرساخت پذیرفته شده است",
    "status.lede":
      "این پوستهٔ محصول فقط زیرساخت تأییدشده را نشان می‌دهد. داده و تحلیل اقتصادی پس از پذیرش معماری نقطه‌درزمان فعال می‌شود.",
    "status.unknown": "نامشخص — هنوز مجموعه‌داده‌ای پذیرفته نشده است",
    "time.knownAt": "بر پایهٔ اطلاعات موجود در",
    "a11y.language": "زبان",
    "a11y.moduleNavigation": "پیمایش بخش‌ها",
    "a11y.primary": "اصلی",
    "a11y.skipToContent": "رفتن به محتوای اصلی",
  },
  de: {
    "app.name": "EconomyOS",
    "app.tagline": "Belege vor Behauptungen",
    "meta.title": "EconomyOS — Belege vor Behauptungen",
    "meta.description": "Historische Wirtschaftsinformationen mit reproduzierbaren Belegen.",
    "nav.global": "Globale Analysen",
    "nav.countries": "Länder",
    "nav.evidence": "Belege",
    "nav.models": "Modelle",
    "nav.scenarios": "Szenarien",
    "status.foundation": "Grundlage freigegeben",
    "status.lede":
      "Diese Produktoberfläche zeigt ausschließlich freigegebene Grundfunktionen. Wirtschaftsdaten und Analysen werden aktiviert, sobald die Point-in-Time-Plattform ihre Freigabeprüfung bestanden hat.",
    "status.unknown": "Unbekannt — es wurde noch kein Datensatz zugelassen",
    "time.knownAt": "Datenstand",
    "a11y.language": "Sprache",
    "a11y.moduleNavigation": "Modulnavigation",
    "a11y.primary": "Hauptnavigation",
    "a11y.skipToContent": "Zum Hauptinhalt springen",
  },
  fr: {
    "app.name": "EconomyOS",
    "app.tagline": "Les preuves avant les affirmations",
    "meta.title": "EconomyOS — Les preuves avant les affirmations",
    "meta.description": "Veille économique point-in-time fondée sur des preuves reproductibles.",
    "nav.global": "Veille mondiale",
    "nav.countries": "Pays",
    "nav.evidence": "Preuves",
    "nav.models": "Modèles",
    "nav.scenarios": "Scénarios",
    "status.foundation": "Socle validé",
    "status.lede":
      "Cette interface ne présente que les fonctions de base validées. Les données et analyses économiques seront activées lorsque la plateforme point-in-time aura franchi son contrôle de validation.",
    "status.unknown": "Inconnu — aucun jeu de données n’a encore été admis",
    "time.knownAt": "Informations connues au",
    "a11y.language": "Langue",
    "a11y.moduleNavigation": "Navigation des modules",
    "a11y.primary": "Navigation principale",
    "a11y.skipToContent": "Aller au contenu principal",
  },
  "zh-Hans": {
    "app.name": "EconomyOS",
    "app.tagline": "先有证据，再下结论",
    "meta.title": "EconomyOS — 先有证据，再下结论",
    "meta.description": "基于可复现证据的时点经济情报。",
    "nav.global": "全球经济洞察",
    "nav.countries": "国家",
    "nav.evidence": "证据",
    "nav.models": "模型",
    "nav.scenarios": "情景",
    "status.foundation": "基础架构已验收",
    "status.lede":
      "此产品界面仅展示已验收的基础功能。时点数据平台通过验收门槛后，经济数据与分析功能才会启用。",
    "status.unknown": "未知 — 尚未接纳任何数据集",
    "time.knownAt": "截至此时已知",
    "a11y.language": "语言",
    "a11y.moduleNavigation": "模块导航",
    "a11y.primary": "主导航",
    "a11y.skipToContent": "跳至主要内容",
  },
  ru: {
    "app.name": "EconomyOS",
    "app.tagline": "Сначала доказательства, затем утверждения",
    "meta.title": "EconomyOS — Сначала доказательства, затем утверждения",
    "meta.description":
      "Экономическая аналитика на выбранный момент времени с воспроизводимыми доказательствами.",
    "nav.global": "Глобальная аналитика",
    "nav.countries": "Страны",
    "nav.evidence": "Доказательства",
    "nav.models": "Модели",
    "nav.scenarios": "Сценарии",
    "status.foundation": "Базовая платформа принята",
    "status.lede":
      "Эта оболочка продукта показывает только принятые базовые возможности. Экономические данные и аналитика станут доступны после прохождения контрольного этапа платформой данных на выбранный момент времени.",
    "status.unknown": "Неизвестно — ни один набор данных ещё не допущен",
    "time.knownAt": "По состоянию на",
    "a11y.language": "Язык",
    "a11y.moduleNavigation": "Навигация по модулям",
    "a11y.primary": "Основная навигация",
    "a11y.skipToContent": "Перейти к основному содержимому",
  },
  es: {
    "app.name": "EconomyOS",
    "app.tagline": "La evidencia antes que las afirmaciones",
    "meta.title": "EconomyOS — La evidencia antes que las afirmaciones",
    "meta.description":
      "Inteligencia económica de un momento histórico con evidencia reproducible.",
    "nav.global": "Inteligencia global",
    "nav.countries": "Países",
    "nav.evidence": "Evidencia",
    "nav.models": "Modelos",
    "nav.scenarios": "Escenarios",
    "status.foundation": "Base aceptada",
    "status.lede":
      "Esta interfaz muestra únicamente las capacidades básicas aceptadas. Los datos y análisis económicos se activarán cuando la plataforma de datos históricos supere su control de aceptación.",
    "status.unknown": "Desconocido — aún no se ha admitido ningún conjunto de datos",
    "time.knownAt": "Según lo conocido al",
    "a11y.language": "Idioma",
    "a11y.moduleNavigation": "Navegación por módulos",
    "a11y.primary": "Navegación principal",
    "a11y.skipToContent": "Saltar al contenido principal",
  },
  pt: {
    "app.name": "EconomyOS",
    "app.tagline": "Evidências antes de afirmações",
    "meta.title": "EconomyOS — Evidências antes de afirmações",
    "meta.description": "Inteligência econômica histórica com evidências reproduzíveis.",
    "nav.global": "Inteligência global",
    "nav.countries": "Países",
    "nav.evidence": "Evidências",
    "nav.models": "Modelos",
    "nav.scenarios": "Cenários",
    "status.foundation": "Base aprovada",
    "status.lede":
      "Esta interface apresenta somente os recursos básicos aprovados. Os dados e as análises econômicas serão ativados quando a plataforma histórica passar pelo controle de aceitação.",
    "status.unknown": "Desconhecido — nenhum conjunto de dados foi admitido ainda",
    "time.knownAt": "Conforme conhecido em",
    "a11y.language": "Idioma",
    "a11y.moduleNavigation": "Navegação de módulos",
    "a11y.primary": "Navegação principal",
    "a11y.skipToContent": "Ir para o conteúdo principal",
  },
  hi: {
    "app.name": "इकॉनमीओएस",
    "app.tagline": "दावे से पहले प्रमाण",
    "meta.title": "इकॉनमीओएस — दावे से पहले प्रमाण",
    "meta.description": "पुनरुत्पाद्य प्रमाण के साथ समय-बिंदु आर्थिक विश्लेषण।",
    "nav.global": "वैश्विक विश्लेषण",
    "nav.countries": "देश",
    "nav.evidence": "प्रमाण",
    "nav.models": "मॉडल",
    "nav.scenarios": "परिदृश्य",
    "status.foundation": "आधारभूत संरचना स्वीकृत",
    "status.lede":
      "यह उत्पाद आवरण केवल स्वीकृत आधारभूत क्षमताएँ दिखाता है। समय-बिंदु डेटा प्लेटफ़ॉर्म के स्वीकृति चरण को पार करने के बाद आर्थिक डेटा और विश्लेषण सक्रिय होंगे।",
    "status.unknown": "अज्ञात — अभी तक कोई डेटासेट स्वीकृत नहीं हुआ है",
    "time.knownAt": "इस समय तक ज्ञात",
    "a11y.language": "भाषा",
    "a11y.moduleNavigation": "मॉड्यूल नेविगेशन",
    "a11y.primary": "मुख्य नेविगेशन",
    "a11y.skipToContent": "मुख्य सामग्री पर जाएँ",
  },
  ar: {
    "app.name": "إيكونومي أو إس",
    "app.tagline": "الدليل قبل الادعاء",
    "meta.title": "إيكونومي أو إس — الدليل قبل الادعاء",
    "meta.description": "معلومات اقتصادية لنقطة زمنية محددة مدعومة بأدلة قابلة لإعادة الإنتاج.",
    "nav.global": "التحليل العالمي",
    "nav.countries": "البلدان",
    "nav.evidence": "الأدلة",
    "nav.models": "النماذج",
    "nav.scenarios": "السيناريوهات",
    "status.foundation": "تم اعتماد الأساس",
    "status.lede":
      "تعرض واجهة المنتج هذه القدرات الأساسية المعتمدة فقط. تُفعّل البيانات والتحليلات الاقتصادية بعد اجتياز منصة بيانات النقطة الزمنية بوابة الاعتماد.",
    "status.unknown": "غير معروف — لم تُقبل أي مجموعة بيانات بعد",
    "time.knownAt": "كما كان معروفًا في",
    "a11y.language": "اللغة",
    "a11y.moduleNavigation": "التنقل بين الوحدات",
    "a11y.primary": "التنقل الرئيسي",
    "a11y.skipToContent": "الانتقال إلى المحتوى الرئيسي",
  },
  hy: {
    "app.name": "EconomyOS",
    "app.tagline": "Ապացույցը՝ պնդումից առաջ",
    "meta.title": "EconomyOS — Ապացույցը՝ պնդումից առաջ",
    "meta.description": "Տվյալ պահին հայտնի տնտեսական վերլուծություն՝ վերարտադրելի ապացույցներով։",
    "nav.global": "Համաշխարհային վերլուծություն",
    "nav.countries": "Երկրներ",
    "nav.evidence": "Ապացույցներ",
    "nav.models": "Մոդելներ",
    "nav.scenarios": "Սցենարներ",
    "status.foundation": "Հիմքային շերտն ընդունված է",
    "status.lede":
      "Այս արտադրանքային միջերեսը ցուցադրում է միայն ընդունված հիմքային հնարավորությունները։ Տնտեսական տվյալներն ու վերլուծությունը կմիանան, երբ տվյալ պահին հայտնիի հարթակն անցնի ընդունման ստուգումը։",
    "status.unknown": "Անհայտ — դեռ ոչ մի տվյալների հավաքածու չի ընդունվել",
    "time.knownAt": "Ըստ տվյալ պահին հայտնիի",
    "a11y.language": "Լեզու",
    "a11y.moduleNavigation": "Մոդուլների նավարկում",
    "a11y.primary": "Հիմնական նավարկում",
    "a11y.skipToContent": "Անցնել հիմնական բովանդակությանը",
  },
  tr: {
    "app.name": "EconomyOS",
    "app.tagline": "İddiadan önce kanıt",
    "meta.title": "EconomyOS — İddiadan önce kanıt",
    "meta.description": "Yeniden üretilebilir kanıtlara dayalı belirli-zaman ekonomik istihbaratı.",
    "nav.global": "Küresel analiz",
    "nav.countries": "Ülkeler",
    "nav.evidence": "Kanıtlar",
    "nav.models": "Modeller",
    "nav.scenarios": "Senaryolar",
    "status.foundation": "Temel altyapı kabul edildi",
    "status.lede":
      "Bu ürün kabuğu yalnızca kabul edilmiş temel yetenekleri gösterir. Ekonomik veri ve analizler, belirli-zaman veri platformu kabul kapısını geçtikten sonra etkinleşecektir.",
    "status.unknown": "Bilinmiyor — henüz hiçbir veri kümesi kabul edilmedi",
    "time.knownAt": "Şu tarih itibarıyla bilinen",
    "a11y.language": "Dil",
    "a11y.moduleNavigation": "Modül gezintisi",
    "a11y.primary": "Ana gezinti",
    "a11y.skipToContent": "Ana içeriğe geç",
  },
} as const satisfies Readonly<Record<Locale, Catalog>>;

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(input: {
  explicit?: string;
  user?: string;
  workspace?: string;
  acceptLanguage?: string;
}): Locale {
  for (const value of [input.explicit, input.user, input.workspace]) {
    if (value && isLocale(value)) return value;
  }
  if (input.acceptLanguage) {
    const candidates = input.acceptLanguage
      .split(",")
      .map((part) => {
        const [tag = "", ...parameters] = part.trim().split(";");
        const quality = parameters.find((parameter) => /^q\s*=/i.test(parameter.trim()));
        const q = Number(quality?.split("=")[1] ?? "1");
        return { tag, q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0 };
      })
      .sort((left, right) => right.q - left.q);
    for (const { tag, q } of candidates) {
      if (q === 0 || tag === "*") continue;
      const normalized = tag.toLowerCase();
      const exact = LOCALES.find((locale) => locale.toLowerCase() === normalized);
      if (exact) return exact;
      const tagBase = normalized.split("-")[0];
      if (tagBase === "zh" && /-(?:tw|hk|mo|hant)(?:-|$)/.test(normalized)) continue;
      const base = LOCALES.find((locale) => locale.toLowerCase().split("-")[0] === tagBase);
      if (base) return base;
    }
  }
  return "en";
}

export function translate(locale: Locale, key: MessageKey): string {
  return messages[locale][key];
}

export function bidiIsolate(value: string): string {
  return `\u2068${value}\u2069`;
}
