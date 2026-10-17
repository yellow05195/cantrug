"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll reveal. Rendered visible on the server (resting state). On the client,
 * sections still below the fold are hidden, then revealed once when they enter
 * the viewport. Three ways to reveal, so content can never stay hidden:
 * IntersectionObserver, a passive scroll/resize check, and a safety timer.
 */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.setAttribute("data-wait", "");
    let done = false;
    const cleanupFns: (() => void)[] = [];
    const show = () => {
      if (done) return;
      done = true;
      el.removeAttribute("data-wait");
      cleanupFns.forEach((f) => f());
    };
    const check = () => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) show();
    };
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && show(), { rootMargin: "0px 0px -8% 0px" }) : null;
    io?.observe(el);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const timer = window.setTimeout(show, 2500);
    cleanupFns.push(() => {
      io?.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearTimeout(timer);
    });
    return () => cleanupFns.forEach((f) => f());
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
