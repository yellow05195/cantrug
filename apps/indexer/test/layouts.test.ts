/**
 * Guards the hand-written layouts against the program IDL: same events,
 * same field names, order and types, same discriminators.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeCoinState, encodeCoinState } from "../src/chain/accounts.js";
import type { FieldType, StructLayout } from "../src/chain/borsh.js";
import { anchorDiscriminator } from "../src/chain/discriminator.js";
import { CoinStateLayout, EventLayouts } from "../src/chain/layouts.js";
import type { CoinStateAccount } from "../src/chain/types.js";
import { CREATOR, DEFAULT_PARAMS, MINT } from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const idlPath = join(here, "..", "..", "..", "programs", "floored", "idl", "floored.json");

interface IdlField {
  name: string;
  type: unknown;
}
interface Idl {
  events: { name: string; discriminator: number[] }[];
  accounts: { name: string; discriminator: number[] }[];
  types: { name: string; type: { kind: string; fields: IdlField[] } }[];
}

const idl = JSON.parse(readFileSync(idlPath, "utf8")) as Idl;
const types = new Map(idl.types.map((t) => [t.name, t]));

/** Express our layout in IDL notation. */
function toIdlType(t: FieldType, structName?: string): unknown {
  if (typeof t === "string") return t;
  if ("array" in t) return { array: t.array };
  return { defined: { name: structName } };
}

function compareStruct(name: string, layout: StructLayout, nested: Record<string, string> = {}) {
  const def = types.get(name);
  expect(def, `IDL type ${name}`).toBeDefined();
  const idlFields = def!.type.fields.map((f) => [f.name, f.type]);
  const ours = layout.map(([n, t]) => [n, toIdlType(t, nested[n])]);
  expect(ours).toEqual(idlFields);
}

describe("layouts match programs/floored/idl/floored.json", () => {
  it("covers exactly the IDL events", () => {
    expect(Object.keys(EventLayouts).sort()).toEqual(idl.events.map((e) => e.name).sort());
  });

  it.each(Object.entries(EventLayouts))("event %s fields", (name, layout) => {
    compareStruct(name, layout, { params: "CoinParams" });
  });

  it.each(idl.events.map((e) => [e.name, e.discriminator] as const))("event %s discriminator", (name, disc) => {
    expect([...anchorDiscriminator("event", name)]).toEqual(disc);
  });

  it("CoinState account layout and discriminator", () => {
    compareStruct("CoinState", CoinStateLayout, { params: "CoinParams", brake: "BrakeState", bumps: "Bumps" });
    const acc = idl.accounts.find((a) => a.name === "CoinState")!;
    expect([...anchorDiscriminator("account", "CoinState")]).toEqual(acc.discriminator);
  });
});

describe("CoinState decoder", () => {
  it("round-trips an account", () => {
    const acc: CoinStateAccount = {
      mint: MINT,
      creator: CREATOR,
      params: DEFAULT_PARAMS,
      phase: 1,
      real_sol: 0n,
      tokens_sold: 793_086_956_520_892n,
      floor_reserve: 0n,
      pool_sol: 85_258_029_914n,
      pool_tok: 206_913_043_479_108n,
      creator_fees_owed: 1n,
      protocol_fees_owed: 2n,
      creator_fees_claimed: 3n,
      protocol_fees_claimed: 4n,
      total_redeemed_sol: 5n,
      redeem_count: 6n,
      total_pool_burned: 7n,
      buy_count: 8n,
      sell_count: 9n,
      volume_sol: 10n,
      brake: {
        ref_sol: 11n,
        ref_tok: 12n,
        window_start: 13n,
        epoch: 14,
        scale: 1n << 64n,
        sol_index: 340_282_366_920_938_463_463_374_607_431_768_211_455n,
        queued_total: 15n,
        engagements: 16,
        windows_processed: 17,
      },
      created_slot: 18n,
      graduated_slot: 19n,
      vault_rent: 890_880n,
      bumps: { coin: 255, curve_vault: 254, floor_reserve: 253, pool_sol_vault: 252, fee_vault: 251, queue_sol_vault: 250, curve_token_vault: 249, pool_token_vault: 248, queue_escrow: 247 },
      reserved: new Uint8Array(64),
    };
    const bytes = encodeCoinState(acc);
    expect(decodeCoinState(bytes)).toEqual(acc);
    expect(() => decodeCoinState(bytes.subarray(1))).toThrow();
  });
});
