"use client";
import { useEffect, useState } from "react";

export const THEME_KEY = "floored-theme";

/** Is the site in its night theme? Drives day/night in every drawn scene. */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.getAttribute("data-theme") === "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export function setTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.add("theme-fade");
  window.setTimeout(() => root.classList.remove("theme-fade"), 420);
  if (dark) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    /* storage unavailable: the theme just will not persist */
  }
}
