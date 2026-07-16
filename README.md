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
