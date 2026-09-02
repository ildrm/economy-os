import { resolveLocale } from "@economyos/i18n";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const requestHeaders = await headers();
  const acceptLanguage = requestHeaders.get("accept-language");
  const locale = resolveLocale(acceptLanguage ? { acceptLanguage } : {});
  redirect(`/${locale}`);
}
