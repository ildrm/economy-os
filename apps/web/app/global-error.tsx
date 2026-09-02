"use client";

import "@economyos/design-tokens/tokens.css";
import "./globals.css";
import { RouteState } from "./_components/route-state";
import { getRouteStateCopy } from "./_lib/release";

export default function GlobalError({ reset }: { readonly reset: () => void }) {
  const copy = getRouteStateCopy("en");
  return (
    <html lang="en" dir="ltr">
      <body>
        <title>{copy.errorTitle}</title>
        <RouteState locale="en" kind="error" onRetry={reset} />
      </body>
    </html>
  );
}
