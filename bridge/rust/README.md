# Native Kiwi Printer Bridge 1.5.0

This is a candidate native replacement for `../server.js`, not the shipped path.
The Node bridge, installers, Android bridge and web assets remain unchanged.
No Node runtime is needed to run the resulting executable.

Build with Rust stable (tested with 1.99):

```sh
export PATH=/opt/homebrew/opt/rustup/bin:$PATH
export CARGO_HOME="$PWD/.cargo-home"
cargo build --release --manifest-path bridge/rust/Cargo.toml
bridge/rust/target/release/kiwi-printer-bridge --version
cargo test --manifest-path bridge/rust/Cargo.toml
cargo clippy --manifest-path bridge/rust/Cargo.toml --all-targets -- -D warnings
node tools/bridge-rust-parity-test.mjs
```

Run the binary as you would the Node bridge. HTTP stays on 127.0.0.1, with the
same endpoints, capability and enrollment boundary, CORS, local management page,
relay protocol, printer transports and environment variables. The reported version
is 1.5.0. The management page and Windows RAW PowerShell script are literal copies
of the Node constants (the page includes the template's evaluated escapes).
`--version` prints the version and exits. `--pair`, `--unpair` and
`KIWI_RELAY_CODE` work as before; avoid putting pairing codes in shell history.

The configuration path is unchanged: `KIWI_BRIDGE_CONFIG`, otherwise
`~/.kiwi-printer-bridge.json` (USERPROFILE on Windows). Pairing token, install
capability, allowed targets, warm printer and unknown JSON fields survive upgrades.
Writes use an atomic replacement in the same directory and mode 0600 on Unix.
Unlike Node's direct overwrite this also protects against a partial config after
power loss. In-flight relay jobs recover as uncertain, never as blind reprints.

Stop Node before starting Rust. Preserve the existing config, verify a receipt and
a kitchen ticket on paper, and retain the Node binary for rollback using that same
config. No merchant installation should switch automatically at this stage.
**Windows 7 tills stay on the existing Node 12 build** (`bridge-win7-test`). Rust's
standard Windows targets require Windows 10; there is no nightly build-std path.

No user-visible differences are intended beyond the new version. Real hardware
verification is still required for Windows RAW printing, a real port-9100 printer,
and keep-warm behavior on a real printer. Cross-compiling is not hardware validation.
The automated suites use only fake printers/relays on loopback, and do not establish
that every OS-specific diagnostic string or spooler behavior matches on real tills.

Dependencies are deliberately synchronous; there is no async runtime or OpenSSL:

| Dependency | Purpose |
| --- | --- |
| serde_json | Existing JSON config and HTTP protocol |
| tiny_http | HTTP framing, bounded request streaming and loopback listener |
| ureq | Blocking HTTP/HTTPS relay requests, rustls TLS and bundled trust roots |
| url | Browser-compatible origin parsing |
| getrandom | OS randomness for install capabilities and temporary names |
| if-addrs | OS interface enumeration for the RFC1918 scan |
| socket2 | TCP keepalive options unavailable in std |
| tempfile | Atomic config replacement, including Windows replacement semantics |

Release settings optimize for size, use LTO and strip symbols. Panic abort is safe
here: protocol/I/O failures are Results, file cleanup is explicit, and no recovery
or correctness path relies on catching a panic or unwinding. Cargo.lock is committed.

Cross-build with `cargo build --release --manifest-path bridge/rust/Cargo.toml
--target TARGET` after installing the target through rustup. macOS targets use
Apple's SDK; Windows GNU uses `x86_64-w64-mingw32-gcc`. Linux musl needs a musl
cross C compiler/linker (e.g. Zig's `cc -target x86_64-linux-musl`, also supplied to
ring via `CC_x86_64_unknown_linux_musl`). On macOS, set
`AR_x86_64_unknown_linux_musl` to a GNU/LLVM archiver too: Apple ar cannot
archive the ELF objects. A direct LLVM lld link can use Rust’s self-contained
musl CRT and libc; do not combine those CRT objects with Zig’s own startup files. Keep generated toolchains and Cargo's
cache under the ignored `.cargo-home/`; binaries under `bridge/rust/target/` are
ignored and must not be committed. The musl build is static; macOS uses system
libraries and Windows uses the OS DLLs, with no separate TLS or Node runtime.

The worktree gate `node tools/check.js --changed --no-browsers` has an explicit
bridge-only path: it checks changed JavaScript syntax and runs the two existing
suites against Node plus this Rust parity gate. It rejects changes outside the
bridge crate and these verification files rather than claiming broader coverage.
The regular full check still registers the Rust parity suite beside the relay suite.
