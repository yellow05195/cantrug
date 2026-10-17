#!/usr/bin/env node
/**
 * Regenerate programs/floored/idl/floored.json WITHOUT the Solana toolchain.
 *
 * Anchor's `idl-build` feature adds host-side tests that print IDL fragments;
 * this is exactly what `anchor idl build` does under the hood. We run those
 * tests with cargo and assemble the fragments the same way the CLI does.
 *
 *   pnpm idl
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const programDir = join(root, "programs", "floored");
const raw = execSync("cargo test __anchor_private_print_idl --features idl-build -- --show-output --quiet", {
  cwd: programDir,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  maxBuffer: 64 * 1024 * 1024,
});

function sections(kind) {
  const re = new RegExp(`--- IDL begin ${kind} ---\\r?\\n([\\s\\S]*?)\\r?\\n--- IDL end ${kind} ---`, "g");
  return [...raw.matchAll(re)].map((m) => m[1]);
}

const idl = JSON.parse(sections("program")[0]);
idl.address = JSON.parse(JSON.parse(sections("address")[0]));
idl.errors = JSON.parse(sections("errors")[0]);
const types = new Map((idl.types ?? []).map((t) => [t.name, t]));
const events = [];
for (const frag of sections("event")) {
  const e = JSON.parse(frag);
  events.push(e.event);
  for (const t of e.types ?? []) if (!types.has(t.name)) types.set(t.name, t);
}
idl.events = events.sort((a, b) => a.name.localeCompare(b.name));
idl.types = [...types.values()].sort((a, b) => a.name.localeCompare(b.name));

// Anchor 1.x prints fully qualified Rust paths ("floored::events::Trade"); clients want the short name.
const short = (n) => (typeof n === "string" ? n.split("::").pop() : n);
const fix = (node) => {
  if (Array.isArray(node)) return node.forEach(fix);
  if (node && typeof node === "object") {
    if (typeof node.name === "string" && node.name.includes("::")) node.name = short(node.name);
    if (node.defined && typeof node.defined.name === "string") node.defined.name = short(node.defined.name);
    for (const v of Object.values(node)) fix(v);
  }
};
fix(idl);

mkdirSync(join(programDir, "idl"), { recursive: true });
writeFileSync(join(programDir, "idl", "floored.json"), JSON.stringify(idl, null, 2) + "\n");
console.log(`IDL written: ${idl.instructions.length} instructions, ${idl.events.length} events, address ${idl.address}`);
