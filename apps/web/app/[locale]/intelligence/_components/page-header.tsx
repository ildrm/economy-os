import type { Locale } from "@economyos/i18n";
import type { ReactNode } from "react";
import { TrustStrip } from "./context-panel";

export function PageHeader({
  locale,
  eyebrow,
  title,
  lede,
  actions,
}: {
  readonly locale: Locale;
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="intelligenceHeader">
      <div className="titleBlock">
        <p className="sectionKicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="intelligenceLede">{lede}</p>
      </div>
      {actions ? <div className="headerActions">{actions}</div> : null}
      <TrustStrip locale={locale} />
    </header>
  );
}
