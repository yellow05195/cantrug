import type { Logger } from "pino";
import type { MaintenanceStore } from "../repo/types.js";

/** Every `intervalMs`, one floor snapshot per active coin (graduated, or traded in the last 24 h). */
export function startSnapshotJob(store: MaintenanceStore, intervalMs: number, log: Logger): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const n = await store.snapshotActiveCoins(new Date());
      log.debug({ n }, "floor snapshots written");
    } catch (err) {
      log.error({ err }, "floor snapshot job failed");
    } finally {
      busy = false;
    }
  };
  const t = setInterval(() => void tick(), intervalMs);
  t.unref?.();
  return () => clearInterval(t);
}
