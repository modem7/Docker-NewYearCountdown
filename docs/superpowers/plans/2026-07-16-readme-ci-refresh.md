# Docker-NewYearCountdown README/CI/Hardening Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `Docker-NewYearCountdown` up to the same standard as its sibling repos (`docker-rickroll`, `docker-starwars`) — modern README, hardened nginx config, real CI tests (including a Playwright rollover test), consolidated repo/label settings, and a behavior-preserving cleanup of the vendored `src/` code.

**Architecture:** No architectural change — this is a static nginx-served site in a Docker image. All work is config/content/test additions: nginx directives, a GitHub Actions workflow, a Playwright script, and in-place JS/HTML edits that keep every existing DOM id/class/title stable.

**Tech Stack:** nginx (via `nginxinc/nginx-unprivileged`), vanilla JS/HTML/CSS, GitHub Actions, Playwright (Node), Woodpecker CI (unchanged), `.github/settings.yml` (repository-settings GitHub App).

**Spec:** `docs/superpowers/specs/2026-07-16-readme-ci-refresh-design.md`

## Global Constraints

- Never commit or push directly to `master`. All work happens on the `chore/readme-ci-refresh` branch (already created, currently checked out) and lands via a PR opened at the end of this plan.
- Never add a `Co-Authored-By: Claude` trailer to any commit.
- Preserve every existing `src/` element id, class, and page `<title>` exactly as-is today (`#cd-title`, `#cd-days`, `#cd-hours`, `#cd-mins`, `#cd-secs`, `#cd-timetil`, `cd__title--newyear`, `<title>NewYear Countdown</title>`) — the new CI structure/rollover checks depend on them.
- Nginx CSP must keep `style-src 'self' 'unsafe-inline'` — required by `index.html`'s inline `<style>` block.
- Playwright version is pinned to `1.61.1` everywhere it's referenced (locally and in CI) — this plan's Clock API usage (`page.clock.install()`, `page.clock.fastForward()`) was verified against the Playwright `v1.61.0` docs via Context7, so don't bump the version without re-checking the API.
- Woodpecker badge is exactly `https://woodpecker.modem7.com/api/badges/9/status.svg?events=push%2Cmanual`, linking to `https://woodpecker.modem7.com/repos/9`.
- All commands below assume the working directory is `/home/modem7/project/Docker-NewYearCountdown` on branch `chore/readme-ci-refresh`.

---

## File Structure

| File | Change |
| --- | --- |
| `.gitignore` | create |
| `conf/nginx-site.conf` | modify (add headers + gzip, `try_files` tweak) |
| `src/favicon.svg` | create |
| `src/countdown.html` | modify (favicon link, meta description, `defer`, remove credit anchor) |
| `src/index.html` | modify (favicon link, meta description) |
| `src/countdown.js` | rewrite (bug fix + modernization) |
| `.github/scripts/test-countdown.js` | create (Playwright rollover test) |
| `.github/workflows/test.yml` | create |
| `.github/workflows/CI.yml` | delete |
| `.github/settings.yml` | create |
| `.github/config/labels.yml` | delete |
| `.github/workflows/labelsync.yml` | delete |
| `README.md` | rewrite |

---

### Task 1: Add `.gitignore`

**Files:**
- Create: `.gitignore`

**Interfaces:** None — standalone file.

- [ ] **Step 1: Verify the gap exists**

```bash
mkdir -p .claude && touch .claude/local-settings.json
git status --porcelain | grep '.claude' || echo "NOT TRACKED YET — unexpected, investigate before continuing"
```

Expected: prints a line showing `.claude/` as untracked (`?? .claude/`), proving there's currently nothing ignoring it.

- [ ] **Step 2: Create `.gitignore`**

```
# Claude Code local settings
.claude/
```

- [ ] **Step 3: Verify it's now ignored**

```bash
git status --porcelain | grep '.claude' && echo "FAIL: still tracked" || echo "PASS: .claude/ is ignored"
rm -rf .claude
```

Expected: `PASS: .claude/ is ignored`.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "Add .gitignore for local Claude Code settings"
```

---

### Task 2: Harden `conf/nginx-site.conf`

**Files:**
- Modify: `conf/nginx-site.conf`

**Interfaces:**
- Produces: nginx now sends `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy` headers on every response, and gzips `text/plain`, `text/css`, `application/javascript`, `application/json`, `image/svg+xml`. Task 5's `test.yml` asserts on these exact header values.

- [ ] **Step 1: Confirm the gap locally (build + curl against the current config)**

```bash
docker build -t newyearcountdown:pretest .
docker run -d --name nyc-pretest -p 8080:8080 newyearcountdown:pretest
for i in $(seq 1 30); do docker exec nyc-pretest curl -fsS http://localhost:8080/healthz && break; sleep 1; done
curl -sS -o /dev/null -D - http://localhost:8080/countdown.html | grep -i 'x-frame-options' && echo "FAIL: header already present" || echo "PASS: header absent as expected"
docker rm -f nyc-pretest
```

Expected: `PASS: header absent as expected`.

- [ ] **Step 2: Replace `conf/nginx-site.conf`**

```nginx
server {
    listen       8080;

    root /usr/share/nginx/html;
    index index.html;

    # Make site accessible from http://localhost/
    server_name _;

    error_page 404 /index.html;

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

    location /healthz {
        return 200;
    }

    location / {
        # First attempt to serve request as file, then
        # as directory, then fall back to index.html
        try_files $uri $uri/ =404;
    }

    location ~* \.(jpg|jpeg|gif|png|css|js|ico|webp|tiff|ttf|svg|mp4)$ {
        expires 5d;
    }
}
```

- [ ] **Step 3: Rebuild and verify headers + gzip**

```bash
docker build -t newyearcountdown:test .
docker run -d --name nyc-test -p 8080:8080 newyearcountdown:test
for i in $(seq 1 30); do docker exec nyc-test curl -fsS http://localhost:8080/healthz && break; sleep 1; done

headers=$(curl -sS -o /dev/null -D - http://localhost:8080/countdown.html)
echo "$headers" | grep -qi '^x-content-type-options: *nosniff' && echo "PASS: X-Content-Type-Options" || echo "FAIL: X-Content-Type-Options"
echo "$headers" | grep -qi '^x-frame-options: *deny' && echo "PASS: X-Frame-Options" || echo "FAIL: X-Frame-Options"
echo "$headers" | grep -qi '^referrer-policy: *no-referrer' && echo "PASS: Referrer-Policy" || echo "FAIL: Referrer-Policy"
echo "$headers" | grep -qi '^content-security-policy:' && echo "PASS: CSP present" || echo "FAIL: CSP missing"

gzip_headers=$(curl -sS -H 'Accept-Encoding: gzip' -o /dev/null -D - http://localhost:8080/countdown.html)
echo "$gzip_headers" | grep -qi '^content-encoding: *gzip' && echo "PASS: gzip" || echo "FAIL: gzip"

docker rm -f nyc-test
```

Expected: all five lines print `PASS: ...`.

- [ ] **Step 4: Commit**

```bash
git add conf/nginx-site.conf
git commit -m "Add gzip and security headers to nginx config"
```

---

### Task 3: `src/` HTML cleanup — favicon, meta description, remove dead credit link, `defer`

**Files:**
- Create: `src/favicon.svg`
- Modify: `src/countdown.html`
- Modify: `src/index.html`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `/favicon.svg` served at the image root (Task 5's `test.yml` checks it returns 200 with `image/svg+xml`). `countdown.html`'s `<head>` and body no longer contain the invisible `<a>` credit anchor.

- [ ] **Step 1: Create `src/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#001326"/>
  <circle cx="16" cy="16" r="10" fill="lightblue"/>
</svg>
```

- [ ] **Step 2: Update `src/countdown.html`**

Replace the full file with:

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="description" content="Self-contained countdown clock to the next New Year.">
    <link rel="icon" type="image/svg+xml" href="favicon.svg">
    <title>NewYear Countdown</title>
    <link rel="stylesheet" href="countdown.css" type="text/css">
    <script src="countdown.js" defer></script>
</head>

<body>
    <div id="bg">
        <svg id="bg__moon" height="100" width="100">
            <circle cx="50" cy="50" r="35" fill="lightblue" />
        </svg>
        <svg id="bg__city" height="95" width="500">
            <path d="M0,90 L0,75 L25,75 L25,55 L60,50 L60,60 L75,60 L75,0 L85,0 L85,65 L97,65 L97,35 L105,35 L105,50 L110,50 L110,45 L119,45 L119,25 L130,25 L130,5 L148,5 L148,72 L156,72 L176,45 L196,72 L211,72 L211,52 L217,52 L217,60 L225,60 L225,31 L241,31 L241,39 L250,39 L250,47 L261,47 L261,11 L270,11 L270,65 L281,65 L281,80 L300,80 L300,51 L312,45 L312,50 L320,50 L320,9 L332,9 L332,35 L340,35 L340,0 L353,0 L353,50 L365,50 L365,58 L378,58 L378,36 L385,36 L385,42 L391,42 L391,29 L400,29 L400,55 L410,55 L410,65 L415,70 L420,65 L425,70 L430,65 L435,70 L435,77 L450,77 L450,60 L461,60 L461,45 L473,45 L473,80 L475,80 L479,80 L479,70 L490,75 L500,75 L500,90 Z" fill="#d4d4d4" />
        </svg>
        <svg id="bg__grass" height="10" width="650">
            <path d="M0,10 L40,0 L610,0 L650,10 z" fill="rgb(87, 163, 0)" />
        </svg>
        <svg id="bg__cloud1" height="100" width="200">
            <g fill="#2a4b6f">
                <path d="M40,50 L40,100 L160,100 L160,50 Z" />
                <circle cx="40" cy="71" r="29" />
                <circle cx="65" cy="50" r="22" />
                <circle cx="110" cy="50" r="45" />
                <circle cx="160" cy="68" r="32" />
            </g>
        </svg>
        <svg id="bg__cloud2" height="100" width="200">
            <g fill="#3a4b6f">
                <path d="M40,50 L40,100 L160,100 L160,50 Z" />
                <circle cx="40" cy="71" r="29" />
                <circle cx="65" cy="50" r="22" />
                <circle cx="110" cy="50" r="45" />
                <circle cx="160" cy="68" r="32" />
            </g>
        </svg>
        <svg id="bg__cloud3" height="100" width="200">
            <g fill="#1a4b6f">
                <path d="M40,50 L40,100 L160,100 L160,50 Z" />
                <circle cx="40" cy="71" r="29" />
                <circle cx="65" cy="50" r="22" />
                <circle cx="110" cy="50" r="45" />
                <circle cx="160" cy="68" r="32" />
            </g>
        </svg>
    </div>

    <div id="cd">
        <h1 class="cd__title" id="cd-title">NewYear Countdown</h1>
        <div class="cd__ele">
            <span class="cd__ele__value" id="cd-days">??</span>
            <span class="cd__ele__name">Days</span>
        </div>
        <div class="cd__ele">
            <span class="cd__ele__value" id="cd-hours">??</span>
            <span class="cd__ele__name">Hours</span>
        </div>
        <div class="cd__ele">
            <span class="cd__ele__value" id="cd-mins">??</span>
            <span class="cd__ele__name">Minutes</span>
        </div>
        <div class="cd__ele cd__ele--secs">
            <span class="cd__ele__value" id="cd-secs">??</span>
            <span class="cd__ele__name">Seconds</span>
        </div>
        <div class="cd__timetil" id="cd-timetil">Time until ??</div>
    </div>
</body>

</html>
```

Note what changed vs. the original: added `<meta name="description">` and the favicon `<link>`, added `defer` to the script tag, and the trailing `<a href="https://github.com/patrickgold/newyear-countdown" target="_blank"></a>` block is gone. Every id/class inside `#cd` and `#bg` is untouched.

- [ ] **Step 3: Update `src/index.html`**

Replace the full file with:

```html
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="description" content="Self-contained countdown clock to the next New Year.">
    <link rel="icon" type="image/svg+xml" href="favicon.svg">
    <meta http-equiv="refresh" content="0; url=countdown.html" />
    <title>NewYear Countdown Preview</title>
    <style>
        html,body{height:100%;}
    </style>
</head>

<body>
    <p>Redirecting to <a href="countdown.html">countdown.html</a>...</p>
</body>

</html>
```

- [ ] **Step 4: Build and verify**

```bash
docker build -t newyearcountdown:test .
docker run -d --name nyc-test -p 8080:8080 newyearcountdown:test
for i in $(seq 1 30); do docker exec nyc-test curl -fsS http://localhost:8080/healthz && break; sleep 1; done

favicon_headers=$(curl -sS -o /dev/null -D - http://localhost:8080/favicon.svg)
echo "$favicon_headers" | grep -qE '^HTTP/[0-9.]+ 200' && echo "PASS: favicon 200" || echo "FAIL: favicon"
echo "$favicon_headers" | grep -qi '^content-type: *image/svg\+xml' && echo "PASS: favicon content-type" || echo "FAIL: favicon content-type"

html=$(curl -fsS http://localhost:8080/countdown.html)
echo "$html" | grep -q 'patrickgold/newyear-countdown' && echo "FAIL: dead credit link still present" || echo "PASS: credit anchor removed"
echo "$html" | grep -q 'id="cd-title"' && echo "PASS: cd-title id intact" || echo "FAIL: cd-title id missing"
echo "$html" | grep -qE '<script src="countdown.js" defer' && echo "PASS: defer present" || echo "FAIL: defer missing"

docker rm -f nyc-test
```

Expected: all five lines print `PASS: ...`.

- [ ] **Step 5: Commit**

```bash
git add src/favicon.svg src/countdown.html src/index.html
git commit -m "Add favicon and meta description, remove dead credit link from src/"
```

---

### Task 4: Rewrite `src/countdown.js` and add the Playwright rollover test

**Files:**
- Modify: `src/countdown.js`
- Create: `.github/scripts/test-countdown.js`

**Interfaces:**
- Consumes: DOM ids from Task 3's (unchanged) `countdown.html` — `cd-title`, `cd-days`, `cd-hours`, `cd-mins`, `cd-secs`, `cd-timetil`.
- Produces: `.github/scripts/test-countdown.js` is invoked as `node .github/scripts/test-countdown.js <baseUrl>` — Task 5's `test.yml` calls it exactly this way, expecting exit code 0 and the string `Countdown rollover test passed.` on stdout on success, non-zero exit + a thrown error message on failure.

- [ ] **Step 1: Replace `src/countdown.js`**

```js
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    cd_title: document.getElementById('cd-title'),
    cd_days: document.getElementById('cd-days'),
    cd_hours: document.getElementById('cd-hours'),
    cd_mins: document.getElementById('cd-mins'),
    cd_secs: document.getElementById('cd-secs'),
    cd_timetil: document.getElementById('cd-timetil'),
  };

  const SEC = 1000;
  const MIN = SEC * 60;
  const HOUR = MIN * 60;
  const DAY = HOUR * 24;

  const setValue = (valueEl, value, width, singularLabel) => {
    valueEl.textContent = String(value).padStart(width, '0');
    valueEl.nextElementSibling.textContent = singularLabel + (value === 1 ? '' : 's');
  };

  const nextYear = new Date().getFullYear() + 1;
  elements.cd_title.textContent += ' ' + nextYear;

  // Next January 1st, 00:00:00 local time.
  const endDate = new Date(nextYear + '/1/1');
  elements.cd_timetil.textContent = 'Time until ' + endDate.toDateString();

  const cdInterval = setInterval(() => {
    const diff = endDate.getTime() - new Date().getTime();
    if (diff <= 0) {
      elements.cd_title.classList.add('cd__title--newyear');
      elements.cd_title.textContent = 'Happy New Year!';
      clearInterval(cdInterval);
      return;
    }
    setValue(elements.cd_days, Math.floor(diff / DAY), 3, 'Day');
    setValue(elements.cd_hours, Math.floor((diff % DAY) / HOUR), 2, 'Hour');
    setValue(elements.cd_mins, Math.floor((diff % HOUR) / MIN), 2, 'Minute');
    setValue(elements.cd_secs, Math.floor((diff % MIN) / SEC), 2, 'Second');
  }, 1000);
});
```

This preserves the original's exact behavior: same title suffix (`" " + nextYear`), same "Time until <date>" text, same day/hour/minute/second padding widths (3/2/2/2), same singular/plural label logic, same rollover text (`Happy New Year!`) and class (`cd__title--newyear`). Changes are purely internal: fixes the undeclared-`secs` bug (now impossible — everything is `const`), swaps `innerHTML` for `textContent`, swaps `window.onload` for `DOMContentLoaded`, and de-duplicates the 4x-repeated pad/pluralize block into `setValue`.

- [ ] **Step 2: Create `.github/scripts/test-countdown.js`**

```js
// Verifies the countdown actually ticks down and rolls over to "Happy New
// Year!" at midnight, not just that the page returns 200. Uses Playwright's
// Clock API (page.clock) to fake the browser's Date/setInterval a few
// seconds before a Jan 1st rollover, since we can't wait for a real New
// Year's Eve in CI.
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || 'http://localhost:8080';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  // 5 seconds before the next Jan 1st 00:00:00, local time - matches the
  // page's own `new Date(nextYear + "/1/1")` target calculation.
  const now = new Date();
  const targetYear = now.getFullYear() + 1;
  const rollover = new Date(targetYear, 0, 1, 0, 0, 0, 0);
  const preRollover = new Date(rollover.getTime() - 5000);

  await page.clock.install({ time: preRollover });
  await page.goto(`${BASE_URL}/countdown.html`, { waitUntil: 'load' });

  await page.waitForFunction(
    () => document.getElementById('cd-secs').textContent !== '??',
    { timeout: 10000 },
  );

  const secsBefore = await page.locator('#cd-secs').innerText();
  if (Number(secsBefore) > 5) {
    throw new Error(`Expected countdown to show <=5 seconds remaining before rollover, got "${secsBefore}"`);
  }

  const titleBefore = await page.locator('#cd-title').innerText();
  if (!titleBefore.includes(String(targetYear))) {
    throw new Error(`Expected title to include target year ${targetYear}, got "${titleBefore}"`);
  }

  // Fast forward the faked clock past midnight - the page's own
  // setInterval(..., 1000) callback fires against the new time as if the
  // laptop lid had been closed and reopened past New Year.
  await page.clock.fastForward(8000);

  await page.waitForFunction(
    () => document.getElementById('cd-title').textContent === 'Happy New Year!',
    { timeout: 10000 },
  );

  const titleClass = await page.locator('#cd-title').getAttribute('class');
  if (!titleClass || !titleClass.includes('cd__title--newyear')) {
    throw new Error(`Expected #cd-title to have class "cd__title--newyear", got "${titleClass}"`);
  }

  if (consoleErrors.length > 0) {
    throw new Error(`Console errors detected:\n${consoleErrors.join('\n')}`);
  }

  await browser.close();
  console.log('Countdown rollover test passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Build the image with the rewritten JS**

```bash
docker build -t newyearcountdown:test .
docker run -d --name nyc-test -p 8080:8080 newyearcountdown:test
for i in $(seq 1 30); do docker exec nyc-test curl -fsS http://localhost:8080/healthz && break; sleep 1; done
```

- [ ] **Step 4: Install Playwright locally (once, reused by Tasks 5 and 8) and run the rollover test — verify it fails against a broken assumption first**

Use a fixed, non-session-specific path under `/tmp` so this install is reusable by later tasks (and by whichever subagent executes them) without depending on any particular session's scratchpad location:

```bash
mkdir -p /tmp/newyearcountdown-playwright-verify
cd /tmp/newyearcountdown-playwright-verify
npm init -y >/dev/null
npm install --no-save playwright@1.61.1
npx playwright install --with-deps chromium
cd /home/modem7/project/Docker-NewYearCountdown
```

First prove the test can actually fail (sanity-check the test itself isn't vacuously passing) by pointing it at a URL with no server:

```bash
NODE_PATH=/tmp/newyearcountdown-playwright-verify/node_modules \
  node .github/scripts/test-countdown.js http://localhost:9999 ; echo "exit code: $?"
```

Expected: non-zero exit code, an error printed (connection refused / navigation failure) — confirms the script actually exercises the page rather than trivially succeeding.

- [ ] **Step 5: Run it against the real container and verify it passes**

```bash
NODE_PATH=/tmp/newyearcountdown-playwright-verify/node_modules \
  node .github/scripts/test-countdown.js http://localhost:8080 ; echo "exit code: $?"
```

Expected: prints `Countdown rollover test passed.` and `exit code: 0`.

- [ ] **Step 6: Clean up the container (leave the `/tmp/newyearcountdown-playwright-verify` install in place — Tasks 5 and 8 reuse it)**

```bash
docker rm -f nyc-test
```

- [ ] **Step 7: Commit**

```bash
git add src/countdown.js .github/scripts/test-countdown.js
git commit -m "Rewrite countdown.js and add Playwright rollover test"
```

---

### Task 5: CI workflow — `.github/workflows/test.yml`, delete `.github/workflows/CI.yml`

**Files:**
- Create: `.github/workflows/test.yml`
- Delete: `.github/workflows/CI.yml`

**Interfaces:**
- Consumes: `.github/scripts/test-countdown.js` from Task 4 (invoked as `node .github/scripts/test-countdown.js http://localhost:8080`); `conf/nginx-site.conf` headers from Task 2; `src/favicon.svg` from Task 3.
- Produces: a GitHub Actions check named "Test image" that Task 8's PR will show as a required-looking status; README's Test badge (Task 7) links to this workflow's file path.

- [ ] **Step 1: Delete the old shallow workflow**

```bash
git rm .github/workflows/CI.yml
```

- [ ] **Step 2: Create `.github/workflows/test.yml`**

```yaml
name: Test image

on:
  push:
    paths:
      - Dockerfile
      - src/**
      - conf/nginx-site.conf
      - .github/workflows/test.yml
      - .github/scripts/test-countdown.js
  pull_request:
    paths:
      - Dockerfile
      - src/**
      - conf/nginx-site.conf
      - .github/workflows/test.yml
      - .github/scripts/test-countdown.js
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4

      - name: Build image
        uses: docker/build-push-action@v7
        with:
          context: .
          file: ./Dockerfile
          load: true
          tags: newyearcountdown:test
          cache-from: type=gha,scope=test
          cache-to: type=gha,mode=max,scope=test

      - name: Start container
        run: docker run -d --name newyearcountdown -p 8080:8080 newyearcountdown:test

      - name: Wait for container to be healthy
        run: |
          for i in $(seq 1 30); do
            docker exec newyearcountdown curl -fsS http://localhost:8080/healthz && exit 0
            sleep 1
          done
          docker logs newyearcountdown
          exit 1

      - name: Check root path redirects to countdown.html
        run: |
          set -eu
          status=$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:8080/)
          [ "$status" = "200" ]
          html=$(curl -fsS http://localhost:8080/)
          echo "$html" | grep -qi 'url=countdown.html'

      - name: Check countdown page structure
        run: |
          set -eu
          html=$(curl -fsS http://localhost:8080/countdown.html)
          echo "$html" | grep -q '<title>NewYear Countdown</title>'
          echo "$html" | grep -q 'id="cd-title"'
          echo "$html" | grep -q 'id="cd-days"'
          echo "$html" | grep -q 'id="cd-hours"'
          echo "$html" | grep -q 'id="cd-mins"'
          echo "$html" | grep -q 'id="cd-secs"'
          echo "$html" | grep -q 'id="cd-timetil"'

      - name: Check static assets are served with correct content-type
        run: |
          set -eu
          headers=$(curl -sS -o /dev/null -D - http://localhost:8080/countdown.css)
          echo "$headers" | grep -qE '^HTTP/[0-9.]+ 200'
          echo "$headers" | grep -qi '^content-type: *text/css'
          headers=$(curl -sS -o /dev/null -D - http://localhost:8080/countdown.js)
          echo "$headers" | grep -qE '^HTTP/[0-9.]+ 200'
          echo "$headers" | grep -qiE '^content-type: *(application|text)/javascript'

      - name: Check favicon is served
        run: |
          set -eu
          headers=$(curl -sS -o /dev/null -D - http://localhost:8080/favicon.svg)
          echo "$headers" | grep -qE '^HTTP/[0-9.]+ 200'
          echo "$headers" | grep -qi '^content-type: *image/svg+xml'

      - name: Check gzip compression is applied to countdown.html
        run: |
          headers=$(curl -sS -H 'Accept-Encoding: gzip' -o /dev/null -D - http://localhost:8080/countdown.html)
          echo "$headers" | grep -qi '^content-encoding: *gzip'

      - name: Check security headers are present
        run: |
          set -eu
          headers=$(curl -sS -o /dev/null -D - http://localhost:8080/countdown.html)
          echo "$headers" | grep -qi '^x-content-type-options: *nosniff'
          echo "$headers" | grep -qi '^x-frame-options: *deny'
          echo "$headers" | grep -qi '^referrer-policy: *no-referrer'
          echo "$headers" | grep -qi '^content-security-policy:'

      - name: Check an unknown path still falls back to the redirect page
        run: |
          set -eu
          status=$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:8080/some/random/path)
          [ "$status" = "404" ]
          html=$(curl -sS http://localhost:8080/some/random/path)
          echo "$html" | grep -qi 'url=countdown.html'

      - name: Check container runs as non-root
        run: |
          docker exec newyearcountdown whoami | grep -qv root
          docker exec newyearcountdown id | grep -q 'uid=101'

      - name: Check no sudo access
        run: docker exec newyearcountdown which sudo && exit 1 || true

      - name: Check no world-writable files
        run: |
          count=$(docker exec newyearcountdown find /usr/share/nginx/html -type f -perm /o+w | wc -l)
          [ "$count" -eq 0 ]

      - name: Set up Node
        uses: actions/setup-node@v7
        with:
          node-version: 24

      - name: Install Playwright package
        run: |
          npm init -y >/dev/null
          # Pinned exact version - the cache key below is keyed on this
          # version, and an unpinned install could silently resolve a
          # newer release whose browser binaries no longer match a
          # stale cache.
          npm install --no-save playwright@1.61.1

      - name: Cache Playwright browsers
        id: playwright-cache
        uses: actions/cache@v6
        with:
          path: ~/.cache/ms-playwright
          key: playwright-browsers-${{ runner.os }}-1.61.1

      - name: Install Playwright OS dependencies
        run: npx playwright install-deps chromium

      - name: Install Playwright browsers
        if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install chromium

      - name: Verify countdown ticks down and rolls over at New Year
        run: node .github/scripts/test-countdown.js http://localhost:8080

      - name: Stop container
        if: always()
        run: docker rm -f newyearcountdown || true
```

- [ ] **Step 3: Validate YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/test.yml')); print('valid YAML')"
```

Expected: `valid YAML`.

- [ ] **Step 4: Full local dry run of the workflow's own steps (end to end, as CI will execute them)**

```bash
docker build -t newyearcountdown:test .
docker run -d --name newyearcountdown -p 8080:8080 newyearcountdown:test
for i in $(seq 1 30); do docker exec newyearcountdown curl -fsS http://localhost:8080/healthz && break; sleep 1; done

status=$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:8080/); [ "$status" = "200" ] && echo PASS || echo FAIL
curl -fsS http://localhost:8080/ | grep -qi 'url=countdown.html' && echo PASS || echo FAIL
curl -fsS http://localhost:8080/countdown.html | grep -q '<title>NewYear Countdown</title>' && echo PASS || echo FAIL
docker exec newyearcountdown whoami | grep -qv root && echo PASS || echo FAIL
docker exec newyearcountdown which sudo && echo FAIL || echo PASS

# Reuses the Playwright install from Task 4 Step 4 - if that directory
# doesn't exist (e.g. this task is run standalone by a different
# subagent), recreate it the same way: mkdir -p
# /tmp/newyearcountdown-playwright-verify && cd there && npm init -y &&
# npm install --no-save playwright@1.61.1 && npx playwright install
# --with-deps chromium && cd back to the repo root.
NODE_PATH=/tmp/newyearcountdown-playwright-verify/node_modules \
  node .github/scripts/test-countdown.js http://localhost:8080

docker rm -f newyearcountdown
```

Expected: every check prints `PASS`, and the last line before cleanup is `Countdown rollover test passed.`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "Replace shallow CI.yml with a full test.yml workflow"
```

---

### Task 6: Consolidate onto `.github/settings.yml`

**Files:**
- Create: `.github/settings.yml`
- Delete: `.github/config/labels.yml`
- Delete: `.github/workflows/labelsync.yml`

**Interfaces:** None — this task doesn't affect the running image or any other task's code.

- [ ] **Step 1: Capture the current label set for comparison**

```bash
cat .github/config/labels.yml
```

Expected output (for reference while writing Step 3): 10 labels — `bug`, `dependencies`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`.

- [ ] **Step 2: Delete the old label-sync mechanism**

```bash
git rm .github/config/labels.yml .github/workflows/labelsync.yml
```

- [ ] **Step 3: Create `.github/settings.yml`**

```yaml
# https://github.com/apps/settings
# https://github.com/repository-settings/app

repository:
  name: Docker-NewYearCountdown
  description: >-
    Self hosted, self contained New Year countdown clock. Automatically
    counts down to the next January 1st based on local system time.
  homepage: https://hub.docker.com/r/modem7/newyearcountdown
  topics: docker, new-year, countdown, nginx, self-hosted, homelab, docker-compose
  private: false
  has_issues: true
  has_wiki: false
  has_downloads: true
  has_projects: false
  has_discussions: false
  default_branch: master
  allow_squash_merge: true
  allow_rebase_merge: true
  allow_merge_commit: true
  # Auto-delete head branches after merge
  delete_branch_on_merge: true
  # Always suggest updating PR branches that are behind base
  allow_update_branch: true
  enable_automated_security_fixes: true
  enable_vulnerability_alerts: true

# Labels: define labels for Issues and Pull Requests
labels:
  - name: bug
    color: d73a4a
    description: "Something isn't working"
  - name: dependencies
    color: C62109
    description: "Pull requests that update a dependency file"
  - name: documentation
    color: "0075ca"
    description: "Improvements or additions to documentation"
  - name: duplicate
    color: cfd3d7
    description: "This issue or pull request already exists"
  - name: enhancement
    color: a2eeef
    description: "New feature or request"
  - name: good first issue
    color: "7057ff"
    description: "Good for newcomers"
  - name: help wanted
    color: "008672"
    description: "Extra attention is needed"
  - name: invalid
    color: e4e669
    description: "This doesn't seem right"
  - name: question
    color: d876e3
    description: "Further information is requested"
  - name: wontfix
    color: "ffffff"
    description: "This will not be worked on"
```

- [ ] **Step 4: Validate YAML syntax and confirm no labels were dropped**

```bash
python3 -c "
import yaml
data = yaml.safe_load(open('.github/settings.yml'))
names = sorted(l['name'] for l in data['labels'])
expected = sorted(['bug', 'dependencies', 'documentation', 'duplicate', 'enhancement', 'good first issue', 'help wanted', 'invalid', 'question', 'wontfix'])
assert names == expected, f'label mismatch: {names} != {expected}'
print('valid YAML, all 10 labels present')
"
```

Expected: `valid YAML, all 10 labels present`.

- [ ] **Step 5: Commit**

```bash
git add .github/settings.yml
git commit -m "Consolidate repo settings and labels onto .github/settings.yml"
```

---

### Task 7: Rewrite `README.md`

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the Woodpecker badge URL and repo link from the Global Constraints section; the Docker Hub repo name `modem7/newyearcountdown` (matches `.woodpecker.yml`'s `repo:` setting, unchanged by this plan); the multi-arch platform list from `.woodpecker.yml`'s existing `platforms:` line (`linux/amd64,linux/arm/v6,linux/arm/v7,linux/arm64/v8`); the `test.yml` workflow path from Task 5.

- [ ] **Step 1: Replace `README.md`**

```markdown
# Docker-NewYearCountdown

Self hosted, self contained countdown clock to the next New Year.
Automatically targets the next January 1st based on local system time — no
configuration needed, just run it.

[![status-badge](https://woodpecker.modem7.com/api/badges/9/status.svg?events=push%2Cmanual)](https://woodpecker.modem7.com/repos/9)
[![Test](https://github.com/modem7/Docker-NewYearCountdown/actions/workflows/test.yml/badge.svg)](https://github.com/modem7/Docker-NewYearCountdown/actions/workflows/test.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/modem7/newyearcountdown)](https://hub.docker.com/r/modem7/newyearcountdown)
[![Docker Image Size (tag)](https://img.shields.io/docker/image-size/modem7/newyearcountdown/latest)](https://hub.docker.com/r/modem7/newyearcountdown)
[![GitHub last commit](https://img.shields.io/github/last-commit/modem7/Docker-NewYearCountdown)](https://github.com/modem7/Docker-NewYearCountdown/commits/master)
[![License: MIT](https://img.shields.io/github/license/modem7/Docker-NewYearCountdown)](LICENSE)

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/modem7)

## Screenshot

![image](https://user-images.githubusercontent.com/4349962/147395358-ec5bcffc-5bf2-4b43-af5f-5459f5d14b00.png)

See it live: https://modem7.github.io/Docker-NewYearCountdown/

## Quick start

```bash
docker run -d --name newyearcountdown -p 8080:8080 modem7/newyearcountdown
```

Or Compose, if that's more your thing:

```yaml
services:
  newyearcountdown:
    image: modem7/newyearcountdown
    container_name: NewYearCountdown
    ports:
      - 8080:8080
```

Open `http://localhost:8080` and enjoy.

## What's actually in the image

- Built on `nginxinc/nginx-unprivileged`, runs as `uid 101`. No root, anywhere
- gzip on, plus the usual security headers (`X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Content-Security-Policy`) — see
  `conf/nginx-site.conf` if you want the specifics
- `/healthz` backs the built-in `HEALTHCHECK`, so it actually means something
- Multi-arch: `amd64`, `arm/v6`, `arm/v7`, `arm64/v8`

## Testing / CI

Every push/PR touching the image builds it, boots a real container, and
pokes at it: page structure, gzip, the security headers, static assets,
non-root/no-sudo/no-world-writable-files, and a Playwright script that fakes
the browser clock to a few seconds before midnight on New Year's Eve and
confirms the countdown actually rolls over to "Happy New Year!". See
`.github/workflows/test.yml` if you want the gory details.

`.woodpecker.yml` does the actual multi-arch build and Docker Hub push once
something's merged to `master`.

## Tags

| Tag | Description |
| :----: | --- |
| `latest` | Latest version |

## Credits

Not my work, I just packaged it up: original creator
[patrickgold](https://github.com/patrickgold/newyear-countdown).

## License

MIT, see [LICENSE](LICENSE).
```

- [ ] **Step 2: Verify no broken relative links**

```bash
grep -oE '\]\([^)]+\)' README.md | grep -v '^\](http' | tr -d '](' | tr -d ')' | while read -r f; do
  [ -f "$f" ] && echo "OK: $f" || echo "MISSING: $f"
done
```

Expected: `OK: LICENSE` (the only relative link in the file — everything else is `https://...`).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Rewrite README with modern badges and updated structure"
```

---

### Task 8: Final integration check, push, and open PR

**Files:** None — verification and git/GitHub operations only.

**Interfaces:** None.

- [ ] **Step 1: Full clean-room smoke test of the final state**

```bash
docker build -t newyearcountdown:final .
docker run -d --name nyc-final -p 8080:8080 newyearcountdown:final
for i in $(seq 1 30); do docker exec nyc-final curl -fsS http://localhost:8080/healthz && break; sleep 1; done

status=$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:8080/); [ "$status" = "200" ] && echo "PASS: root 200" || echo "FAIL: root"
curl -fsS http://localhost:8080/countdown.html | grep -q '<title>NewYear Countdown</title>' && echo "PASS: title" || echo "FAIL: title"
curl -sS -o /dev/null -D - http://localhost:8080/countdown.html | grep -qi 'x-frame-options: *deny' && echo "PASS: headers" || echo "FAIL: headers"
curl -sS -H 'Accept-Encoding: gzip' -o /dev/null -D - http://localhost:8080/countdown.html | grep -qi 'content-encoding: *gzip' && echo "PASS: gzip" || echo "FAIL: gzip"
docker exec nyc-final id | grep -q 'uid=101' && echo "PASS: non-root" || echo "FAIL: non-root"

# Reuses the Playwright install from Task 4 Step 4 / Task 5 Step 4 - see
# Task 5 Step 4's comment for how to recreate it if it's missing.
NODE_PATH=/tmp/newyearcountdown-playwright-verify/node_modules \
  node .github/scripts/test-countdown.js http://localhost:8080

docker rm -f nyc-final
rm -rf /tmp/newyearcountdown-playwright-verify
```

Expected: every check prints `PASS`, and `node .github/scripts/test-countdown.js` prints `Countdown rollover test passed.`.

- [ ] **Step 2: Confirm the branch has all 7 commits and a clean tree**

```bash
git log --oneline origin/master..HEAD
git status
```

Expected: 7 commits listed (Tasks 1–7), `nothing to commit, working tree clean`.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin chore/readme-ci-refresh
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "Modernize README, CI tests, nginx hardening, and src/ cleanup" --body "$(cat <<'EOF'
## Summary
- Rewrites README.md with current badges (including the Woodpecker repo/9 badge), a trimmed structure, and drops the stale "breaking change" notice
- Hardens conf/nginx-site.conf with gzip + the standard security header set (matches docker-starwars)
- Replaces the build-only CI.yml with a full test.yml: structure/header/gzip/non-root checks plus a Playwright test that fakes the clock to verify the countdown actually rolls over to "Happy New Year!"
- Consolidates repo metadata and labels onto .github/settings.yml, dropping the older CI-based label-sync workflow (matches docker-rickroll/docker-starwars; confirmed the repository-settings app is active on this account)
- Rewrites src/countdown.js (fixes an undeclared-variable bug, modernizes to const/let/textContent/DOMContentLoaded, dedupes the pad/pluralize logic) and cleans up src/countdown.html and src/index.html (favicon, meta description, removes a dead invisible credit link) — all existing element ids/classes/titles are unchanged
- Adds .gitignore for local Claude Code settings

Full design rationale: docs/superpowers/specs/2026-07-16-readme-ci-refresh-design.md

## Test plan
- [x] Local docker build + curl checks for headers, gzip, structure, non-root (see plan Tasks 2-6)
- [x] Local Playwright rollover test run against the built image (Task 4 Steps 4-5, Task 8 Step 1)
- [ ] `test.yml` GitHub Actions workflow passes on this PR
EOF
)"
```

- [ ] **Step 5: Report the PR URL to the user and wait for CI**

`gh pr create` prints the PR URL — surface it. The new `test.yml` workflow runs automatically on this PR (it's a `pull_request`-triggered workflow); `.woodpecker.yml` stays `event: manual`-only as before, so it won't fire automatically. Confirm the GitHub Actions check goes green before considering this plan done.

---

## Testing Summary

Every task carries its own local verification (curl assertions against a locally built+run container, YAML `safe_load` checks, or the Playwright script itself) — there's no separate test suite beyond what's built in Tasks 4-5, which *is* the project's new test suite. Task 8 re-runs the full set once more against the final combined state before pushing, and the real end-to-end validation is watching `test.yml` go green on the opened PR.
