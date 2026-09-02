import { isLocale, type Locale } from "@economyos/i18n";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { WorkbenchShell } from "./_components/workbench-shell";
import { workbenchCopy } from "./_lib/copy";
import "./intelligence.css";

export default async function IntelligenceLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate as Locale;
  return (
    <Suspense
      fallback={
        <div className="routeLoading" role="status">
          {workbenchCopy(locale).intelligence}…
        </div>
      }
    >
      <WorkbenchShell locale={locale}>{children}</WorkbenchShell>
    </Suspense>
  );
}
