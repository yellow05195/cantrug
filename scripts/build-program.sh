#!/usr/bin/env bash
# Build floored.so with the Solana toolchain (cargo-build-sbf). On Windows sources scripts/env-windows.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) source scripts/env-windows.sh ;;
esac
(cd programs/floored && cargo-build-sbf)
cp target/deploy/floored-keypair.json programs/floored/target/deploy/floored-keypair.json 2>/dev/null || true
ls -la programs/floored/target/deploy/floored.so
