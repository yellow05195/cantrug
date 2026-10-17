export const locales = ["en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const THEME_COOKIE = "floored-theme";

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "fr";
}
