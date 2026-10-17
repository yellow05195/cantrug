/**
 * Mock transaction path. Same contract as live.ts: the outcome comes from
 * running the action on a copy of the coin (exact SDK math), the confirm
 * step applies it for real to the in-tab dataset and broadcasts the events.
 */
import { DEFAULT_PARAMS } from "@floored/sdk";
import { emitEngineEvents } from "@/lib/api/ws";
import { dataset } from "@/lib/mock/api";
import {
  buy,
  cloneCoin,
  newMockCoin,
  positionStatus,
  redeem,
  sell,
  settleQueue,
  slotAt,
  type Ctx,
  type EngineEvent,
  type MockCoin,
} from "@/lib/mock/engine";
import { coinImage } from "@/lib/mock/images";
import { rng } from "@/lib/mock/rng";
import { TxError, errorKey } from "./errors";
import { emptyOutcome, type Outcome, type Prepared, type TxAction } from "./types";

const r = rng(0x7a11);

function run(c: MockCoin, action: TxAction, owner: string, ctx: Ctx): Outcome {
  const o = emptyOutcome(action.kind, action.symbol);
  switch (action.kind) {
    case "buy":
    case "create": {
      const lamports = action.kind === "buy" ? action.lamports : action.firstBuyLamports;
      if (lamports > 0n) {
        const res = buy(c, owner, lamports, ctx);
        o.solIn = res.solCharged;
        o.tokensOut = res.tokensOut;
      }
      o.mint = c.state.mint.toBase58();
      return o;
    }
    case "sell": {
      const st = positionStatus(c, owner);
      if (st?.stale) o.staleSettledSol = settleQueue(c, owner, 1, ctx).sol;
      const have = c.holders.get(owner) ?? 0n;
      if (action.tokens > have) throw new TxError("program.ExceedsAvailable");
      const res = sell(c, owner, action.tokens, action.queueRemainder, ctx);
      o.tokensIn = action.tokens;
      o.executed = res.executed;
      o.queued = res.queued;
      o.solOut = res.solOut;
      o.dropped = action.tokens - res.executed - res.queued;
      if (res.executed === 0n && res.queued === 0n) throw new TxError("program.ZeroAmount");
      return o;
    }
    case "redeem": {
      const have = c.holders.get(owner) ?? 0n;
      if (action.tokens > have) throw new TxError("program.ExceedsAvailable");
      const res = redeem(c, owner, action.tokens, ctx);
      o.tokensIn = action.tokens;
      o.solOut = res.solOut;
      o.feeKept = res.feeKept;
      return o;
    }
    case "claim":
    case "cancel":
    case "queueToRedeem": {
      if (!positionStatus(c, owner)) throw new TxError("program.NotQueued");
      const res = settleQueue(c, owner, action.kind === "claim" ? 0 : action.kind === "cancel" ? 1 : 2, ctx);
      if (action.kind === "claim" && res.sol === 0n) throw new TxError("program.NothingToClaim");
      o.solOut = res.sol;
      o.tokensOut = res.tokensReturned;
      o.tokensIn = res.tokensRedeemed;
      return o;
    }
  }
}

function metaFromUri(uri: string): { image?: string; description?: string } {
  if (!uri.startsWith("data:application/json")) return {};
  try {
    const json = decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
    return JSON.parse(json) as { image?: string; description?: string };
  } catch {
    return {};
  }
}

export async function prepareMock(action: TxAction, owner: string): Promise<Prepared> {
  const ds = dataset();
  await new Promise((res) => setTimeout(res, 380)); // feel like a simulation round trip
  const now = Date.now();
  const ctxFor = (record: boolean, events: EngineEvent[]): Ctx => ({ slot: slotAt(now), ms: now, sig: () => r.signature(), record, events });

  let target: MockCoin;
  let isNew = false;
  if (action.kind === "create") {
    const meta = metaFromUri(action.uri);
    target = newMockCoin(
      {
        name: action.name,
        symbol: action.symbol,
        description: meta.description ?? "",
        image: meta.image ?? coinImage(action.symbol, ds.coins.length),
        socials: {},
        createdMs: now,
        graduatedMs: null,
      },
      r.pubkey(),
      r.pubkey(),
      DEFAULT_PARAMS,
    );
    isNew = true;
  } else {
    const c = ds.byMint.get(action.mint);
    if (!c) throw new TxError("coinMissing");
    target = c;
  }

  let outcome: Outcome;
  try {
    outcome = run(cloneCoin(target), action, owner, ctxFor(false, []));
    if (isNew) outcome.mint = target.state.mint.toBase58();
  } catch (e) {
    throw e instanceof TxError ? e : new TxError(errorKey(e));
  }

  return {
    outcome,
    execute: async () => {
      await new Promise((res) => setTimeout(res, 650));
      const events: EngineEvent[] = [];
      if (isNew) {
        ds.coins.unshift(target);
        ds.byMint.set(target.state.mint.toBase58(), target);
      }
      const final = run(target, action, owner, ctxFor(true, events));
      if (isNew) final.mint = target.state.mint.toBase58();
      emitEngineEvents(events);
      return { signature: events[0]?.signature ?? r.signature(), outcome: final };
    },
  };
}
