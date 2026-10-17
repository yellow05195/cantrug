/**
 * Trailing debounce with a max wait: `trigger()` many times, `fn` runs at
 * most once per `waitMs` of quiet, and at least every `maxWaitMs` under
 * constant load. Never runs `fn` concurrently with itself.
 */
export interface Debounced {
  trigger(): void;
  flush(): Promise<void>;
  cancel(): void;
}

export function debounce(fn: () => Promise<unknown>, waitMs: number, maxWaitMs = waitMs * 5, onError?: (err: unknown) => void): Debounced {
  let timer: NodeJS.Timeout | null = null;
  let firstTrigger: number | null = null;
  let running: Promise<void> | null = null;
  let pendingWhileRunning = false;

  const run = async (): Promise<void> => {
    timer = null;
    firstTrigger = null;
    if (running) {
      pendingWhileRunning = true;
      return running;
    }
    running = (async () => {
      try {
        await fn();
      } catch (err) {
        onError?.(err);
      } finally {
        running = null;
        if (pendingWhileRunning) {
          pendingWhileRunning = false;
          schedule();
        }
      }
    })();
    return running;
  };

  const schedule = () => {
    const now = Date.now();
    firstTrigger ??= now;
    if (timer) clearTimeout(timer);
    const delay = Math.max(0, Math.min(waitMs, firstTrigger + maxWaitMs - now));
    timer = setTimeout(() => void run(), delay);
    timer.unref?.();
  };

  return {
    trigger: schedule,
    flush: async () => {
      if (timer) {
        clearTimeout(timer);
        await run();
      } else if (running) await running;
    },
    cancel: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      firstTrigger = null;
    },
  };
}
