import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Fredoka, Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import { BootScreen } from "@/components/layout/BootScreen";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { AppProviders } from "@/components/providers/AppProviders";
import { api, safely } from "@/lib/api/client";
import { ENV } from "@/lib/env";
import "./globals.css";

const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-fredoka", display: "swap" });
const inter = Inter({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-jetbrains", display: "swap" });

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
    { media: "(prefers-color-scheme: light)", color: "#eeece8" },
    { media: "(prefers-color-scheme: dark)", color: "#05070f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* Apply the remembered theme before first paint so nothing flashes. */
const THEME_BOOT = `try{var t=localStorage.getItem("floored-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, messages, stats, t] = await Promise.all([getLocale(), getMessages(), safely(api.stats(), null), getTranslations("common")]);
  const seed = stats ? { lamports: stats.sol_redeemed_total, launched: stats.coins_created, brakes: stats.brake_engagements_total } : null;
  return (
    <html lang={locale} className={`${fredoka.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <Script id="theme-boot" strategy="beforeInteractive">
          {THEME_BOOT}
        </Script>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
          {t("skip")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders closeLabel={t("close")}>
            <BootScreen />
            <Header stats={seed} />
            <main id="main" className="relative z-[1] flex flex-1 flex-col">
              {children}
            </main>
            <Footer />
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
