import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { LiveTicker } from "@/components/layout/LiveTicker";
import { AppProviders } from "@/components/providers/AppProviders";
import { THEME_COOKIE } from "@/i18n/config";
import { api, safely } from "@/lib/api/client";
import { ENV } from "@/lib/env";
import "./globals.css";

const interTight = Inter_Tight({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700", "800"], variable: "--font-inter-tight", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    metadataBase: new URL(ENV.siteUrl),
    title: { default: t("title"), template: "%s | FLOORED" },
    description: t("description"),
    openGraph: { title: t("title"), description: t("description"), siteName: "FLOORED" },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
    { media: "(prefers-color-scheme: light)", color: "#e9e6e0" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, messages, store, stats, t] = await Promise.all([getLocale(), getMessages(), cookies(), safely(api.stats(), null), getTranslations("common")]);
  const theme = store.get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
  const seed = stats ? { lamports: stats.sol_redeemed_total, launched: stats.coins_created, brakes: stats.brake_engagements_total } : null;
  return (
    <html lang={locale} data-theme={theme} className={`${interTight.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
          {t("skip")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders closeLabel={t("close")}>
            <Header theme={theme} stats={seed} />
            <LiveTicker />
            <main id="main">{children}</main>
            <Footer />
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
