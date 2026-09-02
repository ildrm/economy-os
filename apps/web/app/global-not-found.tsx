import "@economyos/design-tokens/tokens.css";
import "./globals.css";
import type { Metadata } from "next";
import { RouteState } from "./_components/route-state";
import { getRouteStateCopy, PRIVATE_ROBOTS } from "./_lib/release";

const copy = getRouteStateCopy("en");

export const metadata: Metadata = {
  title: copy.notFoundTitle,
  description: copy.notFoundDetail,
  robots: PRIVATE_ROBOTS,
};

export default function GlobalNotFound() {
  return (
    <html lang="en" dir="ltr">
      <body>
        <RouteState locale="en" kind="not-found" />
      </body>
    </html>
  );
}
