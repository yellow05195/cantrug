/**
 * Crank backstop (Vercel cron, see apps/web/vercel.json). The site already
 * cranks inside ordinary trades (lib/tx/live.ts); this route catches the coins
 * nobody is trading: a brake queue whose window closed with nobody buying, a
 * curve that reached its graduation SOL and sits unopened.
 *
 * Env: CRON_SECRET (Vercel sends it as `Authorization: Bearer`), CRANK_KEYPAIR
 * (JSON byte array of a wallet holding a little SOL for fees; it earns the
 * crank reward of every queue it serves), UPSTREAM_RPC_URL (else
 * CRANK_RPC_URL, else an absolute NEXT_PUBLIC_RPC_URL).
 */
import {
  ACCOUNT_SIZES,
  PROGRAM_ID,
  decodeCoinState,
  graduateIx,
  phase,
  processQueueIx,
  setComputeUnitLimit,
  setComputeUnitPrice,
  windowStart,
  type CoinState,
} from "@floored/sdk";
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TX_PER_RUN = 20;

function rpcUrl(): string | null {
  const u = process.env.UPSTREAM_RPC_URL || process.env.CRANK_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "";
  return /^https?:\/\//.test(u) ? u : null;
}

function keypair(): Keypair | null {
  const raw = (process.env.CRANK_KEYPAIR ?? "").trim();
  if (!raw) return null;
  try {
    const bytes = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

interface Due {
  mint: PublicKey;
  kind: "process_queue" | "graduate";
  ix: TransactionInstruction;
}

function dueOf(s: CoinState, slot: bigint, caller: PublicKey): Due[] {
  const out: Due[] = [];
  if (phase(s) === "curve" && s.realSol >= s.params.graduationSol) {
    out.push({ mint: s.mint, kind: "graduate", ix: graduateIx({ caller, mint: s.mint }) });
  }
  if (s.brake.queuedTotal > 0n && windowStart(s.brake.windowStart, s.params.brakeWindowSlots, slot) > s.brake.windowStart) {
    out.push({ mint: s.mint, kind: "process_queue", ix: processQueueIx({ caller, mint: s.mint, epoch: s.brake.epoch }) });
  }
  return out;
}

async function sendOne(c: Connection, payer: Keypair, ix: TransactionInstruction): Promise<{ ok: true; signature: string } | { ok: false; error: string }> {
  try {
    const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions: [setComputeUnitLimit(400_000), setComputeUnitPrice(20_000), ix],
      }).compileToV0Message(),
    );
    tx.sign([payer]);
    const signature = await c.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
    const res = await c.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) return { ok: false, error: JSON.stringify(res.value.err) };
    return { ok: true, signature };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = rpcUrl();
  if (!url) return NextResponse.json({ error: "no absolute RPC url (UPSTREAM_RPC_URL)" }, { status: 503 });
  const payer = keypair();
  if (!payer) return NextResponse.json({ error: "CRANK_KEYPAIR is not set or not a JSON byte array" }, { status: 503 });

  const c = new Connection(url, { commitment: "confirmed" });
  const [accounts, slot, lamports] = await Promise.all([
    c.getProgramAccounts(PROGRAM_ID, { commitment: "confirmed", filters: [{ dataSize: ACCOUNT_SIZES.CoinState }] }),
    c.getSlot("confirmed"),
    c.getBalance(payer.publicKey),
  ]);
  const due: Due[] = [];
  for (const a of accounts) {
    try {
      due.push(...dueOf(decodeCoinState(new Uint8Array(a.account.data)), BigInt(slot), payer.publicKey));
    } catch {
      /* not a CoinState (same size, different type): skip */
    }
  }
  const results: { mint: string; kind: Due["kind"]; signature?: string; error?: string }[] = [];
  for (const d of due.slice(0, MAX_TX_PER_RUN)) {
    const r = await sendOne(c, payer, d.ix);
    results.push({ mint: d.mint.toBase58(), kind: d.kind, ...(r.ok ? { signature: r.signature } : { error: r.error }) });
  }
  return NextResponse.json({
    crank: payer.publicKey.toBase58(),
    crank_sol: lamports / 1e9,
    coins: accounts.length,
    slot,
    due: due.length,
    sent: results.length,
    results,
  });
}
