import type { MetadataRoute } from "next";
import { ENV } from "@/lib/env";

const PAGES = ["", "/create", "/how-it-works", "/stats", "/challenge"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: `${ENV.siteUrl}${p}`, changeFrequency: p ? "weekly" : "daily", priority: p ? 0.7 : 1 }));
}
