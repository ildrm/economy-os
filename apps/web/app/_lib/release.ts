import { isLocale, LOCALES, type Locale, translate } from "@economyos/i18n";
import type { Metadata } from "next";

export interface RouteStateCopy {
  readonly workspace: string;
  readonly notFoundTitle: string;
  readonly notFoundDetail: string;
  readonly errorTitle: string;
  readonly errorDetail: string;
  readonly loadingTitle: string;
  readonly loadingDetail: string;
  readonly homeAction: string;
  readonly retryAction: string;
}

const routeStateCopy = {
  en: {
    workspace: "Governed research workspace",
    notFoundTitle: "This view is unavailable",
    notFoundDetail:
      "The requested view cannot be shown. This message does not confirm whether a protected resource exists.",
    errorTitle: "The workspace could not be displayed",
    errorDetail:
      "An unexpected error interrupted this view. No protected details have been exposed.",
    loadingTitle: "Preparing the research view",
    loadingDetail: "Verifying the governed context and available evidence.",
    homeAction: "Return to research home",
    retryAction: "Try again safely",
  },
  fa: {
    workspace: "فضای پژوهشی حاکمیت‌شده",
    notFoundTitle: "این نما در دسترس نیست",
    notFoundDetail:
      "نمای درخواستی قابل نمایش نیست. این پیام وجود یا عدم وجود منبع محافظت‌شده را تأیید نمی‌کند.",
    errorTitle: "نمایش فضای کاری ممکن نشد",
    errorDetail: "خطایی غیرمنتظره این نما را متوقف کرد. هیچ جزئیات محافظت‌شده‌ای افشا نشده است.",
    loadingTitle: "در حال آماده‌سازی نمای پژوهش",
    loadingDetail: "زمینهٔ حاکمیت‌شده و شواهد در دسترس در حال بررسی است.",
    homeAction: "بازگشت به صفحهٔ اصلی پژوهش",
    retryAction: "تلاش دوبارهٔ ایمن",
  },
  de: {
    workspace: "Geregelter Forschungsbereich",
    notFoundTitle: "Diese Ansicht ist nicht verfügbar",
    notFoundDetail:
      "Die angeforderte Ansicht kann nicht angezeigt werden. Diese Meldung bestätigt nicht, ob eine geschützte Ressource existiert.",
    errorTitle: "Der Arbeitsbereich konnte nicht angezeigt werden",
    errorDetail:
      "Ein unerwarteter Fehler hat diese Ansicht unterbrochen. Es wurden keine geschützten Details offengelegt.",
    loadingTitle: "Forschungsansicht wird vorbereitet",
    loadingDetail: "Der geregelte Kontext und die verfügbaren Belege werden geprüft.",
    homeAction: "Zur Forschungsstartseite",
    retryAction: "Sicher erneut versuchen",
  },
  fr: {
    workspace: "Espace de recherche gouverné",
    notFoundTitle: "Cette vue est indisponible",
    notFoundDetail:
      "La vue demandée ne peut pas être affichée. Ce message ne confirme pas l’existence d’une ressource protégée.",
    errorTitle: "Impossible d’afficher l’espace de travail",
    errorDetail:
      "Une erreur inattendue a interrompu cette vue. Aucun détail protégé n’a été exposé.",
    loadingTitle: "Préparation de la vue de recherche",
    loadingDetail: "Vérification du contexte gouverné et des preuves disponibles.",
    homeAction: "Revenir à l’accueil de recherche",
    retryAction: "Réessayer en toute sécurité",
  },
  "zh-Hans": {
    workspace: "受治理的研究工作区",
    notFoundTitle: "此视图不可用",
    notFoundDetail: "无法显示请求的视图。此消息不会确认受保护资源是否存在。",
    errorTitle: "无法显示工作区",
    errorDetail: "意外错误中断了此视图。未暴露任何受保护的详细信息。",
    loadingTitle: "正在准备研究视图",
    loadingDetail: "正在核验受治理的上下文和可用证据。",
    homeAction: "返回研究主页",
    retryAction: "安全重试",
  },
  ru: {
    workspace: "Управляемое исследовательское пространство",
    notFoundTitle: "Это представление недоступно",
    notFoundDetail:
      "Запрошенное представление нельзя показать. Это сообщение не подтверждает существование защищённого ресурса.",
    errorTitle: "Не удалось отобразить рабочее пространство",
    errorDetail:
      "Непредвиденная ошибка прервала это представление. Защищённые сведения не раскрыты.",
    loadingTitle: "Подготовка исследовательского представления",
    loadingDetail: "Проверяются управляемый контекст и доступные доказательства.",
    homeAction: "Вернуться на главную страницу исследований",
    retryAction: "Повторить безопасно",
  },
  es: {
    workspace: "Espacio de investigación gobernado",
    notFoundTitle: "Esta vista no está disponible",
    notFoundDetail:
      "No se puede mostrar la vista solicitada. Este mensaje no confirma si existe un recurso protegido.",
    errorTitle: "No se pudo mostrar el espacio de trabajo",
    errorDetail:
      "Un error inesperado interrumpió esta vista. No se expuso ningún detalle protegido.",
    loadingTitle: "Preparando la vista de investigación",
    loadingDetail: "Verificando el contexto gobernado y la evidencia disponible.",
    homeAction: "Volver al inicio de investigación",
    retryAction: "Reintentar de forma segura",
  },
  pt: {
    workspace: "Espaço de pesquisa governado",
    notFoundTitle: "Esta vista não está disponível",
    notFoundDetail:
      "A vista solicitada não pode ser exibida. Esta mensagem não confirma se existe um recurso protegido.",
    errorTitle: "Não foi possível exibir o espaço de trabalho",
    errorDetail: "Um erro inesperado interrompeu esta vista. Nenhum detalhe protegido foi exposto.",
    loadingTitle: "Preparando a vista de pesquisa",
    loadingDetail: "Verificando o contexto governado e as evidências disponíveis.",
    homeAction: "Voltar ao início da pesquisa",
    retryAction: "Tentar novamente com segurança",
  },
  hi: {
    workspace: "शासित शोध कार्यक्षेत्र",
    notFoundTitle: "यह दृश्य उपलब्ध नहीं है",
    notFoundDetail:
      "अनुरोधित दृश्य दिखाया नहीं जा सकता। यह संदेश किसी संरक्षित संसाधन के अस्तित्व की पुष्टि नहीं करता।",
    errorTitle: "कार्यक्षेत्र प्रदर्शित नहीं किया जा सका",
    errorDetail: "एक अप्रत्याशित त्रुटि ने इस दृश्य को बाधित किया। कोई संरक्षित विवरण उजागर नहीं हुआ है।",
    loadingTitle: "शोध दृश्य तैयार हो रहा है",
    loadingDetail: "शासित संदर्भ और उपलब्ध प्रमाण की जाँच की जा रही है।",
    homeAction: "शोध मुखपृष्ठ पर लौटें",
    retryAction: "सुरक्षित रूप से फिर प्रयास करें",
  },
  ar: {
    workspace: "مساحة بحث محكومة",
    notFoundTitle: "هذا العرض غير متاح",
    notFoundDetail: "لا يمكن عرض الصفحة المطلوبة. لا تؤكد هذه الرسالة وجود مورد محمي من عدمه.",
    errorTitle: "تعذّر عرض مساحة العمل",
    errorDetail: "أوقف خطأ غير متوقع هذا العرض. لم تُكشف أي تفاصيل محمية.",
    loadingTitle: "جارٍ إعداد عرض البحث",
    loadingDetail: "جارٍ التحقق من السياق المحكوم والأدلة المتاحة.",
    homeAction: "العودة إلى الصفحة الرئيسية للبحث",
    retryAction: "إعادة المحاولة بأمان",
  },
  hy: {
    workspace: "Կառավարվող հետազոտական աշխատանքային տարածք",
    notFoundTitle: "Այս դիտումը հասանելի չէ",
    notFoundDetail:
      "Պահանջված դիտումը չի կարող ցուցադրվել։ Այս հաղորդագրությունը չի հաստատում պաշտպանված ռեսուրսի գոյությունը։",
    errorTitle: "Չհաջողվեց ցուցադրել աշխատանքային տարածքը",
    errorDetail: "Անսպասելի սխալը ընդհատեց այս դիտումը։ Պաշտպանված մանրամասներ չեն բացահայտվել։",
    loadingTitle: "Հետազոտական դիտման նախապատրաստում",
    loadingDetail: "Ստուգվում են կառավարվող համատեքստը և հասանելի ապացույցները։",
    homeAction: "Վերադառնալ հետազոտության գլխավոր էջ",
    retryAction: "Ապահով կրկին փորձել",
  },
  tr: {
    workspace: "Yönetişimli araştırma çalışma alanı",
    notFoundTitle: "Bu görünüm kullanılamıyor",
    notFoundDetail:
      "İstenen görünüm gösterilemiyor. Bu ileti, korunan bir kaynağın var olup olmadığını doğrulamaz.",
    errorTitle: "Çalışma alanı görüntülenemedi",
    errorDetail:
      "Beklenmeyen bir hata bu görünümü durdurdu. Korunan hiçbir ayrıntı açığa çıkarılmadı.",
    loadingTitle: "Araştırma görünümü hazırlanıyor",
    loadingDetail: "Yönetişimli bağlam ve kullanılabilir kanıtlar doğrulanıyor.",
    homeAction: "Araştırma ana sayfasına dön",
    retryAction: "Güvenle yeniden dene",
  },
} as const satisfies Readonly<Record<Locale, RouteStateCopy>>;

export const PRIVATE_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  noarchive: true,
  nosnippet: true,
  noimageindex: true,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    nocache: true,
    "max-image-preview": "none",
    "max-snippet": 0,
    "max-video-preview": 0,
  },
};

export function getRouteStateCopy(locale: Locale): RouteStateCopy {
  return routeStateCopy[locale];
}

export function resolveRouteLocale(value: string | readonly string[] | undefined): Locale {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && isLocale(candidate) ? candidate : "en";
}

export function buildLocaleMetadata(locale: Locale): Metadata {
  const title = translate(locale, "meta.title");
  const description = translate(locale, "meta.description");
  return {
    title,
    description,
    applicationName: translate(locale, "app.name"),
    category: "economic research application",
    referrer: "no-referrer",
    formatDetection: {
      address: false,
      date: false,
      email: false,
      telephone: false,
      url: false,
    },
    alternates: {
      languages: {
        ...Object.fromEntries(LOCALES.map((candidate) => [candidate, `/${candidate}`])),
        "x-default": "/en",
      },
    },
    openGraph: {
      type: "website",
      title,
      description,
      siteName: translate(locale, "app.name"),
      locale,
      alternateLocale: LOCALES.filter((candidate) => candidate !== locale),
    },
    robots: PRIVATE_ROBOTS,
  };
}
