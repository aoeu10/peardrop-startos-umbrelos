# Updating the upstream PearDrop version

PearDrop is bundled from the dedicated desktop repository:

```text
https://github.com/peardrive/peardrop-desktop
```

## Determine the upstream version

```bash
git clone --depth 1 https://github.com/peardrive/peardrop-desktop.git upstream-desktop-fresh
node -p "require('./upstream-desktop-fresh/package.json').version"
git -C upstream-desktop-fresh rev-parse HEAD
```

Record both the package version and exact commit in `README.md` and the release notes in `startos/versions/current.ts`.

## Apply the update

The web port lives in `upstream-desktop/web-host/` and must be kept compatible with upstream's IPC surface:

1. Refresh the upstream clone: `upstream-desktop/` (or clone the new tag into it).
   Keep `upstream-desktop/web-host/` — it is ours, everything else under
   `upstream-desktop/` is upstream code and should match the new tag exactly
   except the one-line shim `<script>` in `src/renderer/index.html`.
2. Check `src/shared/ipc.ts` for changed/added channels. Update
   `web-host/server.ts` (invoke handlers + push wiring) and
   `web-host/preload.ts` (browser API) to cover the full surface.
3. Check `src/main/peardrop-app.ts` for boot-order or settings→engine-reload
   changes and mirror them in the web host.
4. Rebuild on the host (arch-independent JS only):
   ```bash
   cd upstream-desktop/web-host && ./build.sh
   ```
5. Smoke test: `PEARDROP_HOME=/tmp/peardrop-test node web-host/dist/server.cjs`,
   then load `http://127.0.0.1:47931/` in a browser, share a file, and check
   `GET /api/status`.
6. Update:
   - `startos/versions/current.ts` (bump the package version)
   - `README.md` (versions table, Quick Reference)
   - `instructions.md` when user-facing behavior changes
7. Build and verify the package: `make check-deps && npx prettier --config node_modules/@start9labs/start-sdk/prettier.config.json --write startos && make x86`.
   Inspect the built manifest, then test the s9pk on a real x86_64 StartOS box.

The Docker image intentionally contains no JS bundling: it installs runtime
dependencies for the target arch and copies the host-built `web-host/dist/`.
Never build the renderer inside the x86_64 image — QEMU makes it slow.

The StartOS package version uses `MAJOR.MINOR.PATCH:BUILD` and is intentionally independent from the upstream desktop version.
