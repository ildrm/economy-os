"use client";

import { useEffect, useState } from "react";
import { type CountrySeries, PUBLIC_DATA, validateCountrySeries } from "./public-economy";

const cache = new Map<string, CountrySeries>();

export function useCountryData(codes: readonly string[]) {
  const key = codes.join(",");
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Record<string, CountrySeries>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const selected = key.split(",").filter(Boolean);
    setLoading(true);
    setErrors([]);
    void Promise.allSettled(
      selected.map(async (code) => {
        const expected = PUBLIC_DATA.files[code];
        if (!expected) throw new Error(code);
        const cached = cache.get(code);
        if (cached) return cached;
        const response = await fetch(
          `/economy/${code}.json?v=${encodeURIComponent(PUBLIC_DATA.retrievedAt)}`,
          {
            cache: attempt > 0 ? "reload" : "default",
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
          },
        );
        if (!response.ok) throw new Error(code);
        const text = await response.text();
        if (text.length > 200_000) throw new Error(code);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        const hash = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        if (hash !== expected.sha256) throw new Error(code);
        const country = validateCountrySeries(JSON.parse(text), code);
        cache.set(code, country);
        return country;
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const loaded: Record<string, CountrySeries> = {};
      const failed: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") loaded[result.value.countryCode] = result.value;
        else failed.push(selected[index] ?? "");
      });
      setData(loaded);
      setErrors(failed);
      setLoading(false);
    });
    return () => controller.abort();
  }, [key, attempt]);
  return { data, errors, loading, retry: () => setAttempt((value) => value + 1) };
}
