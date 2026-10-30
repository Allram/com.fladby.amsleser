# Security

## Reporting a vulnerability

Please report security issues privately to Vegard Fladby, the author of this app, through the
contact details on the app's page in the Homey App Store, or with a private issue on
https://github.com/Allram/com.fladby.amsleser. Do not open a public issue for a vulnerability.

## Scope

In scope: this Homey app (pairing, discovery, polling of the reader, flow cards).

Out of scope: the amsreader firmware itself (report to UtilitechAS/amsreader-firmware), the Homey
platform, and the fact that the reader only offers plain HTTP with Basic authentication.

## Trust boundaries

- The app talks to the reader over the local network without TLS. Any device on that network can
  answer discovery and pretend to be a reader, so discovery results are not trusted on their own.
- A reader with a username and password is only contacted at the address the user entered; the
  app does not follow it to a new address automatically.
- Set a password on the reader's web page if other people or devices share your network.

## Who can reach it
The app runs on the user's Homey. It opens no port of its own: it only makes outgoing HTTP requests to the readers the user added. Anything on the local network can answer discovery or reply as a reader.

## Identity and roles
No users or roles in the app; Homey handles who may use it. The reader's own login (HTTP Basic, optional) is entered when pairing and stored as the device settings `username` and `password` (`drivers/amsreader/driver.compose.json`, password field). `lib/AmsClient.ts` adds the `Authorization` header only when a username is set and uses `redirect: 'error'`, so a login is never sent along a redirect. A 401 becomes the `auth` error.

## Values
- The reader's username and password (device settings).
- Meter readings the app feeds into Homey Energy and flows. The app only reads: the only requests are `GET /data.json` and `GET /sysinfo.json` (`lib/AmsClient.ts`). It cannot change the reader.

## Foreign data in
- Discovery answers (SSDP, mDNS; `.homeycompose/discovery`) and the pairing form (`drivers/amsreader/pair/connect.html`, `drivers/amsreader/driver.ts`).
- The JSON from the reader (`lib/AmsClient.ts`, interpreted in `lib/values.ts`). A non-2xx status or a body that is not JSON is reported as `not_reader`.
- `device.ts`, `updateAddress`: moving a device to a new SSDP address requires the same chipId/MAC, and never happens for a reader with a username.

## OTA source and signing
Not applicable: the app does not update or flash readers. The firmware is a separate project.

## Build and release
`.forgejo/workflows/validate.yml` runs tests and validation on `main`. A tag `vX.Y.Z` runs `publish.yml`: it checks that the tag, version files and `.homeychangelog.json` agree and that the commit is on `main`, runs tests, lint and `homey app validate`, and publishes with the secret `HOMEY_PAT`. `.github/workflows/pr.yml` (pull requests on the mirror) has read-only `contents` permission and no secrets.

## Manifest permissions
`.homeycompose/app.json` declares none (`"permissions": []`).

## Out of scope
`assets/`, `locales/`, `node_modules`, generated `app.json`.

---
Checked against the code 2026-10-30 (fd60add). This is a description, not a review: verify against the code before relying on it.
