# Getting a community app store working on umbrelOS 2.0

Lessons from shipping PearDrop (`peardrop` in this repo). umbrelOS 2.x hides
the real error behind one generic message — "Couldn't add this app store" —
so every requirement below is easy to miss. All of these were hit and fixed.

## Checklist for a store repo that loads and installs

1. **Repo root must have `umbrel-app-store.yml`** with `id:` and `name:`.
   The clone succeeds without it, but the registry read fails → generic
   "Couldn't add" error. This file lives at the ROOT, not inside the app
   folder.

2. **Default branch must be `master`** (as of umbrelOS 2.x). The official
   store and Umbrel's template (`getumbrel/umbrel-community-app-store`) both
   use it; umbreld inherits master-only assumptions from its `scripts/repo`
   ancestor. A `main`-defaulted repo fails to add with no useful error.
   Fix: `git branch -m main master`, push, then set the default branch on
   GitHub (Settings or `gh api -X PATCH repos/<repo> -f default_branch=master`).

3. **App `id` must start with the store's `id`** (e.g. store id `peardrop`,
   app id `peardrop`). Mismatches are silently dropped from the registry.

4. **App `port` must be outside 40000–49999.** umbrelOS 2.x reserves that
   range for Machines (its VMs). Installs fail with
   `[app-port-reserved-for-machines]` in the umbreld journal — this one DOES
   show a real error, in `journalctl -u umbreld`. The internal container port
   (`APP_PORT` in compose) is unrestricted.

5. **Icons/galleries must be absolute URLs** for custom stores (e.g.
   raw.githubusercontent.com). The official-store gallery fallback doesn't
   exist for community apps; local filenames 404.

6. **Image must be public, multi-arch (amd64+arm64), digest-pinned**:
   `repo:tag@sha256:<index-digest>`. Packages pushed to ghcr.io with a PAT
   are PRIVATE by default — flip visibility in the package's GitHub settings
   page (REST API can't; user packages are UI-only). Verify anonymous pull
   by fetching `https://ghcr.io/token?scope=repository:<repo>:pull` with no
   auth, then the manifest with that bearer token (200 = public; a raw 401
   is normal even for public images).

7. **Compose needs `app_proxy`** (environment-only service) routing
   `APP_HOST: <app-id>_<service>_1` / `APP_PORT: <internal port>`, and
   `user: "1000:1000"` if the image supports arbitrary UID.

## Diagnosing failures

- The UI never shows the real reason. Reproduce umbreld's clone locally with
  isomorphic-git (`depth: 1, singleBranch: true`) and diff your repo against
  `getumbrel/umbrel-community-app-store` (the authoritative template).
- Real errors land in the device journal: `journalctl -u umbreld -f` while
  retrying the add/install in the UI.
- Run the official linter before pushing:
  `npm run lint:apps -- <app-id> --check-images` from a sparse checkout of
  `getumbrel/umbrel-apps` (`.tools/`).
- Device flow for adding: dashboard → App Store → ⋯ → Add Community App
  Store → paste the repo URL. Install failures after the store loads are
  almost always port-range (see #4) or image pull (see #6) problems.
