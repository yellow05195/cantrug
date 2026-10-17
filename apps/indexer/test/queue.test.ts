import { describe, expect, it } from "vitest";
import { replayQueue, type QueueEventLike } from "../src/domain/queue.js";

const ev = (over: Partial<QueueEventLike>): QueueEventLike => ({
  kind: "joined",
  user: null,
  amount: null,
  queued_total: null,
  settle_kind: null,
  data: {},
  slot: 1,
  ...over,
});

describe("replayQueue", () => {
  it("applies aggregate fills pro rata and drops settled wallets", () => {
    const out = replayQueue([
      ev({ kind: "joined", user: "A", amount: 300n, queued_total: 300n, slot: 1 }),
      ev({ kind: "engaged", queued_total: 300n, slot: 1 }),
      ev({ kind: "joined", user: "B", amount: 100n, queued_total: 400n, slot: 2 }),
      // 40 sold out of 400: everyone keeps 90 %.
      ev({ kind: "processed", user: "cranker", amount: 40n, queued_total: 360n, slot: 3 }),
      ev({ kind: "joined", user: "C", amount: 10n, queued_total: 370n, slot: 4 }),
    ]);
    expect(out.map((w) => [w.user, w.queued_estimate])).toEqual([
      ["A", 270n],
      ["B", 90n],
      ["C", 10n],
    ]);
    const after = replayQueue([
      ev({ kind: "joined", user: "A", amount: 300n, queued_total: 300n }),
      ev({ kind: "joined", user: "B", amount: 100n, queued_total: 400n }),
      ev({ kind: "settled", user: "A", settle_kind: 1, amount: 300n }),
      ev({ kind: "settled", user: "B", settle_kind: 0 }), // claim: stays queued
    ]);
    expect(after.map((w) => w.user)).toEqual(["B"]);
  });

  it("clears everything when the epoch closes", () => {
    expect(
      replayQueue([
        ev({ kind: "joined", user: "A", amount: 300n, queued_total: 300n }),
        ev({ kind: "processed", amount: 300n, queued_total: 0n, data: { closed_epoch: true } }),
        ev({ kind: "released" }),
      ]),
    ).toEqual([]);
  });
});
