import { isLocale } from "@economyos/i18n";
import { notFound, redirect } from "next/navigation";

export default async function HomePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/intelligence/global`);
}
