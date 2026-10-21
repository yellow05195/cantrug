#!/usr/bin/env bash
# FLOORED / CantRug end of project: get back every lamport the project itself owns.
#
#   bash scripts/shutdown-mainnet.sh check     # what is recoverable, nothing is sent
#   bash scripts/shutdown-mainnet.sh fees      # claim every coin's protocol fees (wallets untouched, the crank keeps running)
#   bash scripts/shutdown-mainnet.sh end       # claim the last fees, sweep crank + deployer to the owner
#
# The program is immutable since 2026-10-21 (upgrade authority burned): it can never be closed,
# its ~2.33 SOL rent stays locked, and every coin keeps working forever, the floor included.
#
# What is NOT recoverable, by design: the SOL in each coin's curve / pool / floor belongs to its
# holders (no admin withdraw exists), the creator fees belong to creators, and the config account
# (~0.002 SOL) has no close instruction.
#
# Env: OWNER (default 8Ghc…bT6s), RPC_URL, DEPLOYER, CRANK as below.
set -euo pipefail
cd "$(dirname "$0")/.."

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) source scripts/env-windows.sh ;;
esac
export PATH="$PATH:/c/Users/Utilisateur/tools/node"

MODE="${1:-check}"
OWNER="${OWNER:-8GhcnuEqLr3DgCQTwBhXcHxfEe2jvDLJXxi9E1DebT6s}"
DEPLOYER="${DEPLOYER:-keys/floored-mainnet.json}"
CRANK="${CRANK:-keys/floored-crank.json}"
PROGRAM_ID="E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87"
case "$DEPLOYER" in /*) ;; *) DEPLOYER="$(pwd)/$DEPLOYER" ;; esac

if [ -z "${RPC_URL:-}" ]; then
  RPC_URL="$(grep -E '^json_rpc_url' "$HOME/.config/solana/cli/config.yml" 2>/dev/null | sed 's/^json_rpc_url: *//' | tr -d ' ' || true)"
  case "$RPC_URL" in *mainnet*) ;; *) RPC_URL="https://api.mainnet-beta.solana.com" ;; esac
fi

DEPLOYER_PUB="$(solana address -k "$DEPLOYER")"
CRANK_PUB="$(solana address -k "$CRANK")"

echo "rpc       $RPC_URL"
echo "owner     $OWNER  (everything ends here)"
echo "deployer  $DEPLOYER_PUB  $(solana balance "$DEPLOYER_PUB" -u "$RPC_URL")"
echo "crank     $CRANK_PUB  $(solana balance "$CRANK_PUB" -u "$RPC_URL")"
echo
echo "program:"
solana program show "$PROGRAM_ID" -u "$RPC_URL" 2>&1 | sed 's/^/  /' || true
echo

sweep() {
  # empties a wallet into OWNER (the source pays the fee)
  local kp="$1" pub
  pub="$(solana address -k "$kp")"
  [ "$pub" = "$OWNER" ] && return 0
  if [ "$(solana balance "$pub" -u "$RPC_URL" --lamports | awk '{print $1}')" -gt 5000 ]; then
    solana transfer "$OWNER" ALL --allow-unfunded-recipient -k "$kp" -u "$RPC_URL" --with-compute-unit-price 10000
  fi
}

case "$MODE" in
  check)
    echo "protocol fees owed:"
    DRY_RUN=1 RPC_URL="$RPC_URL" DEPLOYER="$DEPLOYER" pnpm --silent --filter @floored/demo claim-fees || true
    ;;

  fees)
    RPC_URL="$RPC_URL" DEPLOYER="$DEPLOYER" pnpm --silent --filter @floored/demo claim-fees
    ;;

  end)
    # stops the crank too: queued sales are then served only by whoever calls the crank instruction
    RPC_URL="$RPC_URL" DEPLOYER="$DEPLOYER" pnpm --silent --filter @floored/demo claim-fees || true
    sweep "$CRANK"
    sweep "$DEPLOYER"
    echo
    echo "owner now $(solana balance "$OWNER" -u "$RPC_URL")"
    echo "note: the deployer is also the config authority; fund it with a few cents to change fees later."
    ;;

  *)
    echo "usage: $0 check|fees|end"
    exit 1
    ;;
esac
