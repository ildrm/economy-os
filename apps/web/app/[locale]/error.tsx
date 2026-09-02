"use client";

import { LocalizedRouteState } from "../_components/route-state";

export default function LocalizedErrorBoundary({ reset }: { readonly reset: () => void }) {
  return <LocalizedRouteState kind="error" onRetry={reset} />;
}
