import { getRequestConfig } from "next-intl/server";
import { defaultLocale } from "./config";

/* One language. The messages file stays the single source of every string. */
export default getRequestConfig(async () => ({
  locale: defaultLocale,
  messages: (await import("../../messages/en.json")).default,
  timeZone: "UTC",
}));
