export const locales = ["en", "kn", "hi"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
