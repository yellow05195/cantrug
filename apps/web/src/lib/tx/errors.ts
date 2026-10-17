/**
 * Program error codes (IDL `errors`) and wallet/RPC failures → message keys
 * under `errors.*` in messages/{en,fr}.json. Plain sentences, no codes shown.
 */

export const PROGRAM_ERRORS: Record<number, string> = {
  6000: "Overflow",
  6001: "ZeroAmount",
  6002: "DustOutput",
  6003: "CurveComplete",
  6004: "CurveNotComplete",
  6005: "ExceedsAvailable",
  6006: "NothingInCirculation",
  6007: "InvalidParams",
  6008: "ExceedsQueue",
  6009: "WrongPhase",
  6010: "SlippageExceeded",
  6011: "NameTooLong",
  6012: "SymbolTooLong",
  6013: "UriTooLong",
  6014: "NothingToClaim",
  6015: "StaleQueueEntry",
  6016: "QueueEntryMismatch",
  6017: "EpochRecordMismatch",
  6018: "EpochNotClosed",
  6019: "WindowNotElapsed",
  6020: "QueueEmpty",
  6021: "VaultAccounting",
  6022: "Unauthorized",
  6023: "InvalidVault",
  6024: "NotQueued",
  6025: "AlreadyInitialized",
};

/** Core math errors thrown by the SDK while quoting share the same names. */
const CORE_NAMES = new Set(Object.values(PROGRAM_ERRORS));

export class TxError extends Error {
  constructor(
    readonly key: string,
    readonly logs: string[] = [],
  ) {
    super(key);
    this.name = "TxError";
  }
}

function customCode(err: unknown): number | null {
  // { InstructionError: [index, { Custom: 6010 }] }
  if (err && typeof err === "object" && "InstructionError" in err) {
    const ie = (err as { InstructionError: [number, unknown] }).InstructionError;
    const inner = ie?.[1];
    if (inner && typeof inner === "object" && "Custom" in inner) return Number((inner as { Custom: number }).Custom);
    if (inner === "InsufficientFunds") return -1;
  }
  return null;
}

/** Map anything thrown along the transaction path to an `errors.*` key. */
export function errorKey(e: unknown, logs: string[] = []): string {
  if (e instanceof TxError) return e.key;
  const anyE = e as { code?: string; name?: string; message?: string };
  if (anyE?.name === "CoreError" && anyE.code && CORE_NAMES.has(anyE.code)) return `program.${anyE.code}`;
  const code = customCode(e);
  if (code !== null && code > 0 && PROGRAM_ERRORS[code]) return `program.${PROGRAM_ERRORS[code]}`;
  if (code === -1) return "insufficientSol";
  const msg = `${anyE?.message ?? ""} ${logs.join(" ")}`.toLowerCase();
  if (anyE?.name === "WalletSignTransactionError" || anyE?.name === "WalletSendTransactionError") {
    if (/reject|declin|cancel|denied/.test(msg)) return "rejected";
  }
  if (/user rejected|rejected the request|declined|cancelled|canceled|denied/.test(msg)) return "rejected";
  if (/insufficient (funds|lamports)|0x1\b|attempt to debit an account but found no record/.test(msg)) return "insufficientSol";
  if (/blockhash not found|block height exceeded|expired/.test(msg)) return "expired";
  if (/accountnotfound|could not find account|account does not exist/.test(msg)) return "accountMissing";
  if (/failed to fetch|network|timeout|429|too many requests/.test(msg)) return "network";
  const m = /custom program error: 0x([0-9a-f]+)/.exec(msg);
  if (m) {
    const n = parseInt(m[1]!, 16);
    if (PROGRAM_ERRORS[n]) return `program.${PROGRAM_ERRORS[n]}`;
  }
  return "unknown";
}

export function simulationError(err: unknown, logs: string[] | null): TxError {
  return new TxError(errorKey(err, logs ?? []), logs ?? []);
}
