#!/usr/bin/env bash
# FLOORED mainnet deployment. One script, idempotent, stops at the first problem.
#
#   bash scripts/deploy-mainnet.sh check      # balances, program state, config state: nothing is sent
#   bash scripts/deploy-mainnet.sh deploy     # build, deploy the program under its fixed id, initialize the config
#   bash scripts/deploy-mainnet.sh final      # make the program immutable (irreversible; after the audit window)
#
# Env (all optional):
#   RPC_URL                  mainnet RPC (default: the Helius mainnet url in ~/.config/solana/cli/config.yml, else public)
#   DEPLOYER                 deployer / upgrade authority / config authority keypair (default keys/floored-mainnet.json)
#   PROTOCOL_FEE_RECIPIENT   wallet receiving protocol fees (default: the deployer)
#   SKIP_BUILD=1             reuse programs/floored/target/deploy/floored.so instead of rebuilding
#
# Program id is fixed by target/deploy/floored-keypair.json: E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87
# (same id as devnet, which is what the SDK, the site and the docs hard-code).
set -euo pipefail
cd "$(dirname "$0")/.."

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) source scripts/env-windows.sh ;;
esac
export PATH="$PATH:/c/Users/Utilisateur/tools/node"

MODE="${1:-check}"
DEPLOYER="${DEPLOYER:-keys/floored-mainnet.json}"
PROGRAM_KP="target/deploy/floored-keypair.json"
SO="programs/floored/target/deploy/floored.so"
PROGRAM_ID="E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87"

if [ -z "${RPC_URL:-}" ]; then
  RPC_URL="$(grep -E '^json_rpc_url' "$HOME/.config/solana/cli/config.yml" 2>/dev/null | sed 's/^json_rpc_url: *//' | tr -d ' ' || true)"
  case "$RPC_URL" in *mainnet*) ;; *) RPC_URL="https://api.mainnet-beta.solana.com" ;; esac
fi

[ -f "$DEPLOYER" ] || { echo "deployer keypair missing: $DEPLOYER (solana-keygen new --no-bip39-passphrase -o $DEPLOYER)"; exit 1; }
[ -f "$PROGRAM_KP" ] || { echo "program keypair missing: $PROGRAM_KP"; exit 1; }
[ "$(solana address -k "$PROGRAM_KP")" = "$PROGRAM_ID" ] || { echo "program keypair does not match $PROGRAM_ID"; exit 1; }

DEPLOYER_PUB="$(solana address -k "$DEPLOYER")"
FEE_TO="${PROTOCOL_FEE_RECIPIENT:-$DEPLOYER_PUB}"
BAL="$(solana balance "$DEPLOYER_PUB" -u "$RPC_URL" | awk '{print $1}')"

echo "rpc                 $RPC_URL"
echo "deployer            $DEPLOYER_PUB  ($BAL SOL)"
echo "protocol fees to    $FEE_TO"
echo "program id          $PROGRAM_ID"
echo
echo "program on mainnet:"
solana program show "$PROGRAM_ID" -u "$RPC_URL" 2>&1 | sed 's/^/  /' || true
echo

need_sol() {
  # rent for the program data (bytes of the .so, plus header) + a buffer account of the same size during deploy + fees
  local bytes="$1"
  local rent
  rent="$(solana rent "$bytes" -u "$RPC_URL" --lamports 2>/dev/null | tail -1 | awk '{print $NF}')"
  python_free_div() { awk -v a="$1" 'BEGIN { printf "%.3f", a / 1e9 }'; }
  echo "$(python_free_div "$rent")"
}

case "$MODE" in
  check)
    if [ -f "$SO" ]; then
      BYTES="$(stat -c %s "$SO")"
      RENT="$(need_sol "$BYTES")"
      echo "built .so           $SO ($BYTES bytes, sha256 $(sha256sum "$SO" | cut -c1-16)…)"
      echo "rent for program    ~$RENT SOL (+ the same again for the temporary buffer, refunded after the deploy)"
      echo "recommended balance 2 x rent + 0.3 SOL for the config, a demo coin and fees"
    else
      echo "built .so           none yet (pnpm build:program)"
    fi
    echo
    echo "config on mainnet:"
    RPC_URL="$RPC_URL" DEPLOYER="$DEPLOYER" pnpm --silent --filter @floored/demo status || echo "  (could not read)"
    ;;

  deploy)
    if [ "${SKIP_BUILD:-0}" != "1" ]; then
      echo "== build"
      bash scripts/build-program.sh
    fi
    [ -f "$SO" ] || { echo "no $SO"; exit 1; }
    BYTES="$(stat -c %s "$SO")"
    echo "sha256 $(sha256sum "$SO" | cut -d' ' -f1)  $BYTES bytes"
    if solana program show "$PROGRAM_ID" -u "$RPC_URL" >/dev/null 2>&1; then
      echo "== program already on mainnet: upgrading in place (authority must be $DEPLOYER_PUB)"
    else
      echo "== first deploy"
    fi
    solana program deploy "$SO" \
      --program-id "$PROGRAM_KP" \
      --upgrade-authority "$DEPLOYER" \
      -k "$DEPLOYER" -u "$RPC_URL" \
      --with-compute-unit-price 50000 \
      --max-sign-attempts 60 \
      --use-rpc
    echo
    solana program show "$PROGRAM_ID" -u "$RPC_URL"
    echo
    echo "== config (mainnet defaults: 30 virtual SOL, 85 SOL to graduate, 0.02 SOL create fee, 0.002 SOL crank reward)"
    RPC_URL="$RPC_URL" DEPLOYER="$DEPLOYER" DEMO_SCALE=1 PROTOCOL_FEE_RECIPIENT="$FEE_TO" pnpm --filter @floored/demo init-config
    echo
    echo "== done. Next:"
    echo "  1. apps/web env on Vercel: UPSTREAM_RPC_URL=<mainnet rpc>, NEXT_PUBLIC_CLUSTER=mainnet-beta (see docs/LAUNCH.md), redeploy"
    echo "  2. docs/devnet.md stays the devnet record; add the mainnet deploy slot to docs/LAUNCH.md"
    echo "  3. after the audit window: bash scripts/deploy-mainnet.sh final"
    ;;

  final)
    echo "This makes $PROGRAM_ID IMMUTABLE on $RPC_URL. No upgrade will ever be possible again."
    echo "Type the program id to confirm:"
    read -r CONFIRM
    [ "$CONFIRM" = "$PROGRAM_ID" ] || { echo "aborted"; exit 1; }
    solana program set-upgrade-authority "$PROGRAM_ID" --final -k "$DEPLOYER" -u "$RPC_URL"
    solana program show "$PROGRAM_ID" -u "$RPC_URL"
    ;;

  *)
    echo "usage: $0 check|deploy|final"
    exit 1
    ;;
esac
