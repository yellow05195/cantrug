/**
 * Borsh layouts, transcribed field-for-field from programs/floored/idl/floored.json
 * (test/layouts.test.ts checks them against the IDL so a program change that
 * reorders or adds a field fails CI instead of silently mis-decoding).
 */
import type { StructLayout } from "./borsh.js";

export const CoinParamsLayout = [
  ["virtual_sol", "u64"],
  ["virtual_tok", "u64"],
  ["curve_supply", "u64"],
  ["graduation_sol", "u64"],
  ["curve_fee_bps", "u16"],
  ["curve_fee_creator_share_bps", "u16"],
  ["curve_fee_protocol_share_bps", "u16"],
  ["pool_fee_bps", "u16"],
  ["pool_fee_pool_share_bps", "u16"],
  ["pool_fee_creator_share_bps", "u16"],
  ["redeem_fee_bps", "u16"],
  ["brake_drop_bps", "u16"],
  ["brake_window_slots", "u64"],
] as const satisfies StructLayout;

export const BrakeStateLayout = [
  ["ref_sol", "u64"],
  ["ref_tok", "u64"],
  ["window_start", "u64"],
  ["epoch", "u32"],
  ["scale", "u128"],
  ["sol_index", "u128"],
  ["queued_total", "u64"],
  ["engagements", "u32"],
  ["windows_processed", "u32"],
] as const satisfies StructLayout;

export const BumpsLayout = [
  ["coin", "u8"],
  ["curve_vault", "u8"],
  ["floor_reserve", "u8"],
  ["pool_sol_vault", "u8"],
  ["fee_vault", "u8"],
  ["queue_sol_vault", "u8"],
  ["curve_token_vault", "u8"],
  ["pool_token_vault", "u8"],
  ["queue_escrow", "u8"],
] as const satisfies StructLayout;

export const CoinStateLayout = [
  ["mint", "pubkey"],
  ["creator", "pubkey"],
  ["params", { struct: CoinParamsLayout }],
  ["phase", "u8"],
  ["real_sol", "u64"],
  ["tokens_sold", "u64"],
  ["floor_reserve", "u64"],
  ["pool_sol", "u64"],
  ["pool_tok", "u64"],
  ["creator_fees_owed", "u64"],
  ["protocol_fees_owed", "u64"],
  ["creator_fees_claimed", "u64"],
  ["protocol_fees_claimed", "u64"],
  ["total_redeemed_sol", "u64"],
  ["redeem_count", "u64"],
  ["total_pool_burned", "u64"],
  ["buy_count", "u64"],
  ["sell_count", "u64"],
  ["volume_sol", "u64"],
  ["brake", { struct: BrakeStateLayout }],
  ["created_slot", "u64"],
  ["graduated_slot", "u64"],
  ["vault_rent", "u64"],
  ["bumps", { struct: BumpsLayout }],
  ["reserved", { array: ["u8", 64] }],
] as const satisfies StructLayout;

export const EventLayouts = {
  CoinCreated: [
    ["mint", "pubkey"],
    ["coin", "pubkey"],
    ["creator", "pubkey"],
    ["name", "string"],
    ["symbol", "string"],
    ["uri", "string"],
    ["params", { struct: CoinParamsLayout }],
    ["supply", "u64"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  Trade: [
    ["mint", "pubkey"],
    ["user", "pubkey"],
    ["is_buy", "bool"],
    ["phase", "u8"],
    ["is_queue_fill", "bool"],
    ["sol_amount", "u64"],
    ["token_amount", "u64"],
    ["fee_total", "u64"],
    ["fee_to_floor", "u64"],
    ["sol_reserves", "u64"],
    ["token_reserves", "u64"],
    ["real_sol", "u64"],
    ["tokens_sold", "u64"],
    ["floor_reserve", "u64"],
    ["pool_sol", "u64"],
    ["pool_tok", "u64"],
    ["queued", "u64"],
    ["supply", "u64"],
    ["queued_remainder", "u64"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  Graduated: [
    ["mint", "pubkey"],
    ["caller", "pubkey"],
    ["pool_sol", "u64"],
    ["pool_tok", "u64"],
    ["floor_reserve_added", "u64"],
    ["tokens_sold", "u64"],
    ["supply", "u64"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  Redeemed: [
    ["mint", "pubkey"],
    ["user", "pubkey"],
    ["tokens_burned", "u64"],
    ["pool_tokens_burned", "u64"],
    ["sol_out", "u64"],
    ["fee_kept", "u64"],
    ["pool_sol_after", "u64"],
    ["pool_tok_after", "u64"],
    ["supply_after", "u64"],
    ["circulating_after", "u64"],
    ["queued", "u64"],
    ["from_queue", "bool"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  BrakeEngaged: [
    ["mint", "pubkey"],
    ["window_start", "u64"],
    ["ref_sol", "u64"],
    ["ref_tok", "u64"],
    ["queued_total", "u64"],
    ["epoch", "u32"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  BrakeReleased: [
    ["mint", "pubkey"],
    ["epoch", "u32"],
    ["reason", "u8"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  QueueJoined: [
    ["mint", "pubkey"],
    ["user", "pubkey"],
    ["amount", "u64"],
    ["queued_total", "u64"],
    ["epoch", "u32"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  QueueProcessed: [
    ["mint", "pubkey"],
    ["caller", "pubkey"],
    ["epoch", "u32"],
    ["window_start", "u64"],
    ["sold", "u64"],
    ["sol_out", "u64"],
    ["queued_after", "u64"],
    ["closed_epoch", "bool"],
    ["crank_reward", "u64"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  QueueSettled: [
    ["mint", "pubkey"],
    ["user", "pubkey"],
    ["kind", "u8"],
    ["tokens_returned", "u64"],
    ["tokens_redeemed", "u64"],
    ["sol_paid", "u64"],
    ["queued_after", "u64"],
    ["epoch", "u32"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  FeesClaimed: [
    ["mint", "pubkey"],
    ["kind", "u8"],
    ["recipient", "pubkey"],
    ["amount", "u64"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
} as const satisfies Record<string, StructLayout>;

export type EventName = keyof typeof EventLayouts;
export const EVENT_NAMES = Object.keys(EventLayouts) as EventName[];

/**
 * Fields added by the program upgrade at devnet slot 512053014. Events emitted
 * before it use the layout without these fields (they are not all trailing, so
 * a short buffer is decoded with the legacy layout, never by shifting fields).
 */
export const ADDED_IN_V2: Partial<Record<EventName, readonly string[]>> = {
  CoinCreated: ["supply"],
  Trade: ["tokens_sold"],
  Redeemed: ["queued"],
  BrakeEngaged: ["timestamp"],
  BrakeReleased: ["reason", "timestamp"],
  QueueJoined: ["timestamp"],
  QueueProcessed: ["timestamp"],
  QueueSettled: ["queued_after", "epoch", "timestamp"],
  FeesClaimed: ["timestamp"],
};

/** Pre-upgrade layout of an event (null when the event did not change). */
export function legacyLayout(name: EventName): StructLayout | null {
  const added = ADDED_IN_V2[name];
  if (!added?.length) return null;
  return EventLayouts[name].filter(([field]) => !added.includes(field));
}
