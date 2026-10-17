#!/usr/bin/env bash
# On-chain integration tests: build floored.so, then run tests-rs (LiteSVM, in-process; no validator needed).
set -euo pipefail
cd "$(dirname "$0")/.."
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) source scripts/env-windows.sh ;;
esac
(cd programs/floored && cargo-build-sbf)
cd tests-rs && cargo test --release "$@"
