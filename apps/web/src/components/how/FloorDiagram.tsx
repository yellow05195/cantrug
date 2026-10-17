"use client";
import { DEFAULT_PARAMS, LAMPORTS_PER_SOL, TOKEN_UNIT, floorQ64, q64ToSolPerToken, redeem } from "@floored/sdk";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

/**
 * Diagram 1: the floor. Pool SOL ÷ circulating supply. A holder redeems one
 * block: their share of SOL leaves the pool, the block is burned, and the slab
 * stays level (it even rises a hair: the 0.5 % exit fee stays in the pool).
 * All numbers come from the SDK's `redeem`.
 */
const POOL = { sol: 100n * LAMPORTS_PER_SOL, tok: 500n * TOKEN_UNIT };
const SUPPLY = 1500n * TOKEN_UNIT; // circulating = 1500 − 500 = 1000 tokens
const X = 100n * TOKEN_UNIT;
const q = redeem(DEFAULT_PARAMS, POOL, 0n, SUPPLY, X);
const before = q64ToSolPerToken(floorQ64(POOL.sol, q.circulating));
const after = q64ToSolPerToken(floorQ64(q.after.sol, q.circulating - X));
const fmt = (lamports: bigint) => (Number(lamports) / 1e9).toFixed(2);

export function FloorDiagram() {
  const t = useTranslations("how.diagram");
  const root = useRef<SVGSVGElement>(null);
  const [run, setRun] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useGSAP(
    () => {
      if (!inView) return;
      const reduce = prefersReducedMotion();
      const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
      gsap.set(".d-holder", { x: 0, y: 0, opacity: 1 });
      gsap.set(".d-sol", { scaleY: 1, transformOrigin: "50% 100%" });
      gsap.set(".d-chip", { x: 0, opacity: 0 });
      gsap.set(".d-after", { opacity: 0 });
      gsap.set(".d-before", { opacity: 1 });
      if (reduce) {
        gsap.set(".d-holder", { opacity: 0 });
        gsap.set(".d-sol", { scaleY: Number(q.after.sol) / Number(POOL.sol) });
        gsap.set(".d-after", { opacity: 1 });
        gsap.set(".d-before", { opacity: 0 });
        return;
      }
      tl.to(".d-holder", { y: -26, duration: 0.5, delay: 0.4 })
        .to(".d-holder", { x: -232, duration: 0.8 })
        .to(".d-holder", { opacity: 0, duration: 0.25 })
        .to(".d-sol", { scaleY: Number(q.after.sol) / Number(POOL.sol), duration: 0.6 }, "<")
        .to(".d-chip", { opacity: 1, duration: 0.15 }, "<")
        .to(".d-chip", { x: 420, duration: 0.9, ease: "power3.out" })
        .to(".d-chip", { opacity: 0, duration: 0.2 })
        .to(".d-before", { opacity: 0, duration: 0.2 }, "<")
        .to(".d-after", { opacity: 1, duration: 0.2 }, "<");
    },
    { dependencies: [inView, run], scope: root, revertOnUpdate: true },
  );

  const blocks = Array.from({ length: 10 }, (_, i) => i);
  return (
    <figure className="my-10">
      <div className="plate p-3 sm:p-5">
        <svg ref={root} viewBox="0 0 640 304" className="h-auto w-full" role="img" aria-label={t("aria")}>
          {/* pool vault */}
          <text x="40" y="30" fill="var(--ink-2)" fontSize="19">
            {t("pool")}
          </text>
          <rect x="40" y="46" width="150" height="170" fill="none" stroke="var(--line-2)" />
          <rect className="d-sol" x="41" y="47" width="148" height="168" fill="var(--bg-3)" />
          <text x="115" y="140" textAnchor="middle" fill="var(--ink)" fontFamily="var(--font-jetbrains)" fontSize="22" className="d-before">
            S = {fmt(POOL.sol)}
          </text>
          <text x="115" y="140" textAnchor="middle" fill="var(--ink)" fontFamily="var(--font-jetbrains)" fontSize="22" className="d-after" opacity="0">
            S = {fmt(q.after.sol)}
          </text>

          {/* circulating blocks */}
          <text x="270" y="30" fill="var(--ink-2)" fontSize="19">
            {t("circulating")}
          </text>
          {blocks.map((i) => (
            <rect key={i} className={i === 0 ? "d-holder" : undefined} x={270 + (i % 5) * 64} y={i < 5 ? 110 : 160} width="56" height="40" fill={i === 0 ? "var(--ink)" : "var(--bg-3)"} stroke="var(--line-2)" />
          ))}
          <text x="430" y="232" textAnchor="middle" fill="var(--ink-2)" fontFamily="var(--font-jetbrains)" fontSize="19" className="d-before">
            C = {(Number(q.circulating) / 1e6).toFixed(0)}
          </text>
          <text x="430" y="232" textAnchor="middle" fill="var(--ink-2)" fontFamily="var(--font-jetbrains)" fontSize="19" className="d-after" opacity="0">
            C = {(Number(q.circulating - X) / 1e6).toFixed(0)}
          </text>

          {/* SOL leaving to the holder */}
          <g className="d-chip" opacity="0">
            <rect x="45" y="62" width="140" height="32" fill="var(--floor)" />
            <text x="115" y="84" textAnchor="middle" fill="var(--floor-ink)" fontFamily="var(--font-jetbrains)" fontSize="17">
              +{fmt(q.solOut)} SOL
            </text>
          </g>

          {/* the slab */}
          <rect x="24" y="250" width="592" height="10" fill="var(--floor)" />
          <text x="24" y="290" fill="var(--floor)" fontFamily="var(--font-jetbrains)" fontSize="19" className="d-before">
            floor = S / C = {before.toFixed(5)}
          </text>
          <text x="24" y="290" fill="var(--floor)" fontFamily="var(--font-jetbrains)" fontSize="19" className="d-after" opacity="0">
            floor = S / C = {after.toFixed(5)}
          </text>
          {/* dimension line: the level does not move */}
          <g stroke="var(--ink-3)">
            <line x1="616" y1="236" x2="616" y2="274" />
            <line x1="606" y1="236" x2="626" y2="236" />
            <line x1="606" y1="274" x2="626" y2="274" />
          </g>
        </svg>
      </div>
      <figcaption className="mt-3 flex items-start justify-between gap-4 text-sm text-ink-2">
        <span>{t("caption", { x: Number(X / TOKEN_UNIT), sol: fmt(q.solOut), fee: fmt(q.feeKept) })}</span>
        <button type="button" onClick={() => setRun((r) => r + 1)} className="press inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-ink-2 hover:bg-card-2 hover:text-ink">
          <ArrowCounterClockwise size={14} /> {t("replay")}
        </button>
      </figcaption>
    </figure>
  );
}
