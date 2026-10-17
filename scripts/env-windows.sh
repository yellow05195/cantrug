# Source this in Git Bash before any cargo / cargo-build-sbf command on this Windows machine.
# (Copied from FomoGift/solana/scripts/env-windows.sh, Agave path adapted.)
# It wires a toolchain that needs NO administrator rights:
#   - Rust host target x86_64-pc-windows-gnu + portable MinGW (winget WinLibs) for cargo test;
#   - Agave used straight from its release directory (the installer's symlink needs a privilege we lack);
#   - cargo-build-sbf's MSVC-host build scripts linked with LLD against the Windows SDK fetched by `xwin splat`.
# On Linux / CI this file is not needed: install the Solana CLI and use cargo-build-sbf directly.
export MINGW="/c/Users/Utilisateur/AppData/Local/Microsoft/WinGet/Packages/BrechtSanders.WinLibs.POSIX.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe/mingw64/bin"
AGAVE_BIN="/c/Users/Utilisateur/tools/solana/solana-release/bin"
if [ ! -x "$AGAVE_BIN/cargo-build-sbf.exe" ]; then
  AGAVE_BIN="/c/Users/Utilisateur/.local/share/solana/install/releases/stable-e29e5d910f0c2b7176f58174e592e8488099ef75/solana-release/bin"
fi
export PATH="$MINGW:$PATH:$HOME/.cargo/bin:$HOME/.avm/bin:$AGAVE_BIN:/c/Users/Utilisateur/tools/node"
XW="$(cygpath -w "$HOME/.xwin")"
export LIB="$XW\crt\lib\x86_64;$XW\sdk\lib\um\x86_64;$XW\sdk\lib\ucrt\x86_64"
export INCLUDE="$XW\crt\include;$XW\sdk\include\ucrt;$XW\sdk\include\um;$XW\sdk\include\shared"
LLD="$(ls -d "$HOME"/.cache/solana/v1.5*/platform-tools/llvm/bin/lld-link.exe | tail -1)"
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER="$(cygpath -w "$LLD")"
export CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUSTFLAGS="-L native=$XW\crt\lib\x86_64 -L native=$XW\sdk\lib\um\x86_64 -L native=$XW\sdk\lib\ucrt\x86_64"
