"use client";
import { useEffect, useRef } from "react";

/*
 * A 3×3×3 cube in CSS 3D. Each of the 27 cubies keeps a rotation matrix and
 * a position; a move turns one layer by a quarter: the layer's cubies get an
 * extra rotate() that transitions from 0 to 90°, then the turn is committed
 * into their matrices without a transition. The cube scrambles four moves,
 * rests, then plays them back and comes home solved. The bottom face is
 * orange: the floor.
 */

type Axis = "x" | "y" | "z";
type V3 = [number, number, number];
type M3 = [V3, V3, V3];
type Move = { axis: Axis; layer: -1 | 0 | 1; dir: 1 | -1 };

export type FaceColors = Record<"front" | "back" | "right" | "left" | "top" | "bottom", string>;
const COLORS: FaceColors = {
  front: "var(--cube-green)",
  back: "var(--cube-blue)",
  right: "var(--cube-red)",
  left: "var(--cube-yellow)",
  top: "var(--cube-white)",
  bottom: "var(--cube-orange)",
};

const SCRAMBLE: Move[] = [
  { axis: "x", layer: 1, dir: 1 },
  { axis: "y", layer: -1, dir: -1 },
  { axis: "z", layer: 1, dir: 1 },
  { axis: "y", layer: 1, dir: 1 },
];

const ID: M3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function rot(axis: Axis, dir: 1 | -1): M3 {
  const s = dir;
  if (axis === "x") return [[1, 0, 0], [0, 0, -s], [0, s, 0]];
  if (axis === "y") return [[0, 0, s], [0, 1, 0], [-s, 0, 0]];
  return [[0, -s, 0], [s, 0, 0], [0, 0, 1]];
}
function mul(a: M3, b: M3): M3 {
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!)) as M3;
}
function apply(a: M3, v: V3): V3 {
  return [0, 1, 2].map((i) => Math.round(a[i]![0]! * v[0] + a[i]![1]! * v[1] + a[i]![2]! * v[2])) as V3;
}
function matrix(r: M3, p: V3, c: number): string {
  return `matrix3d(${r[0][0]},${r[1][0]},${r[2][0]},0,${r[0][1]},${r[1][1]},${r[2][1]},0,${r[0][2]},${r[1][2]},${r[2][2]},0,${p[0] * c},${p[1] * c},${p[2] * c},1)`;
}
const AX = { x: 0, y: 1, z: 2 } as const;

/**
 * `still` turns off the scramble loop and the pointer lean: the parent drives
 * the orientation through `cubeRef` (the home's scroll story does).
 */
export function Cube({ size = 96, colors = COLORS, still = false, cubeRef }: { size?: number; colors?: FaceColors; still?: boolean; cubeRef?: React.RefObject<HTMLDivElement | null> }) {
  const root = useRef<HTMLDivElement>(null);
  const ownTilt = useRef<HTMLDivElement>(null);
  const tilt = cubeRef ?? ownTilt;

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const c = size;
    const nodes = Array.from(host.querySelectorAll<HTMLDivElement>(".cubie"));
    const state = nodes.map((el) => {
      const p = (el.dataset.p ?? "0,0,0").split(",").map(Number) as V3;
      return { el, p, r: ID };
    });
    const render = (withTurn?: { move: Move; deg: number }) => {
      for (const s of state) {
        const inLayer = withTurn && s.p[AX[withTurn.move.axis]] === withTurn.move.layer;
        const pre = inLayer ? `rotate${withTurn.move.axis.toUpperCase()}(${withTurn.deg}deg) ` : "rotateX(0deg) ";
        s.el.style.transform = pre + matrix(s.r, s.p, c);
      }
    };
    render();

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || still) return;

    let alive = true;
    const wait = (ms: number) => new Promise<void>((res) => window.setTimeout(res, ms));
    const turn = async (move: Move) => {
      // arm the transition on the layer, then rotate it
      for (const s of state) {
        const inLayer = s.p[AX[move.axis]] === move.layer;
        s.el.style.transition = inLayer ? "transform 520ms cubic-bezier(0.77, 0, 0.175, 1)" : "none";
      }
      render({ move, deg: 0 });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      render({ move, deg: 90 * move.dir });
      await wait(560);
      // commit the quarter turn into the matrices, no transition
      const R = rot(move.axis, move.dir);
      for (const s of state) {
        s.el.style.transition = "none";
        if (s.p[AX[move.axis]] === move.layer) {
          s.r = mul(R, s.r);
          s.p = apply(R, s.p);
        }
      }
      render();
    };
    const loop = async () => {
      await wait(1400);
      while (alive) {
        for (const m of SCRAMBLE) {
          if (!alive) return;
          await turn(m);
          await wait(260);
        }
        await wait(1600);
        for (const m of [...SCRAMBLE].reverse()) {
          if (!alive) return;
          await turn({ ...m, dir: (m.dir * -1) as 1 | -1 });
          await wait(260);
        }
        await wait(2600);
      }
    };
    void loop();

    // the whole cube leans toward the pointer, a little
    const onMove = (e: PointerEvent) => {
      const t = tilt.current;
      if (!t) return;
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      t.style.transform = `rotateX(${-24 - y * 14}deg) rotateY(${-38 + x * 22}deg)`;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      alive = false;
      window.removeEventListener("pointermove", onMove);
    };
  }, [size, still, tilt]);

  const cubies: V3[] = [];
  for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) cubies.push([x, y, z]);

  return (
    <div ref={root} className="cube-stage relative grid place-items-center" style={{ width: size * 3.6, height: size * 3.6 }} aria-hidden>
      <div
        ref={tilt}
        className="cube"
        style={{ width: 0, height: 0, transform: "rotateX(-24deg) rotateY(-38deg)", transition: still ? undefined : "transform 900ms cubic-bezier(0.23, 1, 0.32, 1)" }}
      >
        {cubies.map(([x, y, z]) => (
          <div key={`${x}${y}${z}`} className="cubie" data-p={`${x},${y},${z}`} style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}>
            <Face t={`translateZ(${size / 2}px)`} color={z === 1 ? colors.front : null} />
            <Face t={`rotateY(180deg) translateZ(${size / 2}px)`} color={z === -1 ? colors.back : null} />
            <Face t={`rotateY(90deg) translateZ(${size / 2}px)`} color={x === 1 ? colors.right : null} />
            <Face t={`rotateY(-90deg) translateZ(${size / 2}px)`} color={x === -1 ? colors.left : null} />
            <Face t={`rotateX(90deg) translateZ(${size / 2}px)`} color={y === -1 ? colors.top : null} />
            <Face t={`rotateX(-90deg) translateZ(${size / 2}px)`} color={y === 1 ? colors.bottom : null} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Face({ t, color }: { t: string; color: string | null }) {
  return <i style={{ transform: t }}>{color ? <b style={{ background: color }} /> : null}</i>;
}
