# Docker-NewYearCountdown: README refresh, nginx hardening, CI tests

## Context

`Docker-NewYearCountdown` has fallen behind its sibling repos in the same
family (`docker-rickroll`, `docker-starwars`): stale README (dead Drone
badge, no test coverage, outdated "breaking change" notice), no CI beyond a
build-only sanity check, and an nginx config with no gzip or security
headers. This brings it up to the same standard as the siblings.

## Scope

1. Rewrite `README.md`
2. Harden `conf/nginx-site.conf` (gzip + security headers)
3. Replace `.github/workflows/CI.yml` with a real `.github/workflows/test.yml`
4. Add `.gitignore`
5. Consolidate repo/label management onto `.github/settings.yml`

Out of scope: renaming `LICENSE` to `LICENCE.txt`, restructuring the
`index.html` → `countdown.html` redirect, `.hadolint.yaml` (not universally
used across the sibling repos; the Dockerfile here is simple enough not to
need rule overrides).

## 1. README rewrite

Structure, modeled on `docker-starwars/README.md`:

- Title + badges: Docker Pulls, Docker Image Size, Woodpecker
  (`https://woodpecker.modem7.com/api/badges/9/status.svg?events=push%2Cmanual`
  linking to `https://woodpecker.modem7.com/repos/9`), GitHub last-commit,
  MIT license badge (`img.shields.io/github/license/modem7/Docker-NewYearCountdown`,
  linking to `LICENSE`), Buy Me a Coffee (kept as-is)
- One-paragraph description of what the project does (self-contained New
  Year countdown, auto-selects next Jan 1st based on local system time,
  ported to Docker by modem7, original creator credited)
- Drop the "Breaking change" section (historical — the Dockerfile is
  already on `nginxinc/nginx-unprivileged`, nothing actionable for a
  current puller of the image)
- Screenshot (keep existing image link)
- GitHub Pages preview link (keep — `https://modem7.github.io/Docker-NewYearCountdown/`)
- "Quick start" — `docker run` one-liner + Compose snippet (port 8080)
- "What's actually in the image" — non-root (`uid 101`), gzip + security
  headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Content-Security-Policy`), `/healthz`-backed `HEALTHCHECK`, multi-arch
  (`amd64`, `arm/v6`, `arm/v7`, `arm64/v8` — sourced from
  `.woodpecker.yml`'s `platforms` list)
- "Testing / CI" — one paragraph pointing at `test.yml` (what it checks)
  and `.woodpecker.yml` (does the actual multi-arch build + push once
  merged)
- Tags table (`latest` only, single image)
- Credits — link to original creator (`patrickgold/newyear-countdown`)
- License — MIT, link to `LICENSE`

## 2. Nginx hardening (`conf/nginx-site.conf`)

Adopt the exact block already proven in `docker-starwars/conf/nginx-site.conf`:

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'" always;

gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 256;
gzip_types text/plain text/css application/javascript application/json image/svg+xml;
```

`style-src 'unsafe-inline'` is required because `src/index.html` has an
inline `<style>` block. No inline `<script>` exists (both pages load
`countdown.js` externally), so `script-src 'unsafe-inline'` is carried over
from starwars for consistency with the rest of the family rather than out
of necessity here.

Also align `try_files $uri =404;` → `try_files $uri $uri/ =404;` to match
the sibling repos (harmless — this site has no subdirectories today, but
keeps the config consistent).

## 3. CI: `.github/workflows/test.yml`

Delete `.github/workflows/CI.yml` (shallow build-only check, superseded).

New workflow, triggered on push/PR touching `Dockerfile`, `src/**`,
`conf/nginx-site.conf`, `.github/workflows/test.yml`, or
`.github/scripts/test-countdown.js`, plus `workflow_dispatch`:

1. Checkout, Buildx, build image (`load: true`, tag `newyearcountdown:test`,
   `type=gha` cache)
2. Boot container (`-p 8080:8080`), poll `/healthz` until healthy (same
   30-retry loop pattern as the siblings)
3. Check root path (`/`) returns 200 and contains the meta-refresh to
   `countdown.html`
4. Check `/countdown.html` page structure: `<title>NewYear Countdown</title>`,
   presence of `#cd-days`, `#cd-hours`, `#cd-mins`, `#cd-secs`, `#cd-timetil`
5. Check static assets served with correct content-type
   (`countdown.css` → `text/css`, `countdown.js` → `application/javascript`
   or `text/javascript` depending on nginx mime.types)
6. Check gzip `content-encoding` on `/countdown.html` when
   `Accept-Encoding: gzip` is sent
7. Check all four security headers present with expected values
8. Check an unknown path 404s but still serves fallback content (mirrors
   starwars' `error_page 404 /index.html` check)
9. Check container runs as non-root (`uid=101`), no `sudo`, no
   world-writable files under `/usr/share/nginx/html`
10. Set up Node 24, install pinned `playwright@1.61.1`, cache
    `~/.cache/ms-playwright` keyed on that version, install Chromium only
    (no browser-specific autoplay/media quirks are at play in this plain
    countdown logic, so one engine is sufficient coverage)
11. **Rollover test** (`.github/scripts/test-countdown.js`, Chromium only):
    - `addInitScript` overrides the page's `Date` so "now" reads a few
      seconds before the next Jan 1st 00:00:00 (local time, matching the
      app's own `new Date(getFullYear()+1 + "/1/1")` target calculation)
    - Load `/countdown.html`, confirm the displayed `#cd-secs` value is
      small (within the mocked pre-rollover window) and counting down
    - Wait past the mocked rollover point, confirm `#cd-title` text becomes
      `Happy New Year!` and gains the `cd__title--newyear` class
    - Fail on any browser console error during the run

## 4. `.gitignore`

Add, matching the pattern already used in `docker-rickroll`/`docker-starwars`:

```
# Claude Code local settings
.claude/
```

## 5. Repository settings consolidation (`.github/settings.yml`)

`docker-rickroll` and `docker-starwars` both manage repo metadata and
labels entirely through `.github/settings.yml` (the
[repository-settings app](https://github.com/apps/settings)/
[repository-settings/app](https://github.com/repository-settings/app)),
and neither has the older CI-based label-sync mechanism
(`.github/config/labels.yml` + a workflow running
`julb/action-manage-label`) that `Docker-NewYearCountdown` still has. To
actually match the siblings rather than adding a third, divergent
mechanism:

- Add `.github/settings.yml` with:
  - `repository:` block — `name: Docker-NewYearCountdown` (must match the
    actual repo name; the app renames the repo if this differs),
    description, `homepage: https://hub.docker.com/r/modem7/newyearcountdown`,
    `topics: docker, new-year, countdown, nginx, self-hosted, homelab, docker-compose`,
    and the same issue/wiki/merge/branch-protection-adjacent flags used in
    `docker-starwars/.github/settings.yml` (`has_issues: true`,
    `has_wiki: false`, `has_downloads: true`, `has_projects: false`,
    `has_discussions: false`, `default_branch: master`,
    `allow_squash_merge/rebase_merge/merge_commit: true`,
    `delete_branch_on_merge: true`, `allow_update_branch: true`,
    `enable_automated_security_fixes/vulnerability_alerts: true`)
  - `labels:` block — ported 1:1 from the existing
    `.github/config/labels.yml` (`bug`, `dependencies`, `documentation`,
    `duplicate`, `enhancement`, `good first issue`, `help wanted`,
    `invalid`, `question`, `wontfix`). No `content-freshness` label —
    that's specific to starwars' upstream-sync workflow, which this repo
    doesn't have.
- Delete `.github/config/labels.yml` and `.github/workflows/labelsync.yml`

**Confirmed:** checked `docker-starwars`'s live repo state via `gh api
/repos/modem7/docker-starwars` — its actual topics/homepage/description
exactly match `.github/settings.yml`, confirming the repository-settings
app is installed and active on the `modem7` account. The consolidation is
safe; no gap in label-sync coverage is expected.

## Testing

The new `test.yml` workflow itself *is* the testing for this change — no
separate test suite exists to validate the CI addition beyond running it
via `workflow_dispatch` / a PR. The Playwright rollover test is the only
non-trivial new test logic; it will be validated by watching it pass in CI
on the PR that lands this change (mocked-clock approach avoids needing to
wait for real New Year's Eve).

## Files touched

- `README.md` (rewrite)
- `conf/nginx-site.conf` (add headers + gzip, `try_files` tweak)
- `.github/workflows/CI.yml` (deleted)
- `.github/workflows/test.yml` (new)
- `.github/scripts/test-countdown.js` (new)
- `.gitignore` (new)
- `.github/settings.yml` (new)
- `.github/config/labels.yml` (deleted)
- `.github/workflows/labelsync.yml` (deleted)
