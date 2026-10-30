# com.fladby.amsleser

Homey app (SDK 3, TypeScript) that reads an AMS reader (Utilitech amsreader-firmware, Norwegian smart-meter HAN reader) by polling its local web API. Made for Homey Pro owners; published in the Homey App Store. Not affiliated with Utilitech.

## Kart
- `lib/AmsClient.ts`: HTTP client for `/data.json` and `/sysinfo.json`. `lib/values.ts`: turns readings into capability values. `lib/AmsError.ts`: error codes.
- `drivers/amsreader/`: `driver.ts` (discovery and pairing), `device.ts` (polling, address changes), `pair/connect.html`, flow compose files.
- `.homeycompose/` is the source for `app.json` (generated, committed): keep both in step. Discovery rules are in `.homeycompose/discovery`.
- `test/values.test.ts`: the only test file; the polling and pairing code is not covered.

## Kommandoer
```
npm ci
npm test
npm run lint
npx homey app validate --level publish
```

## Utgivelse
Push to `main` runs tests and validation (`validate.yml`). A tag `vX.Y.Z` runs `publish.yml` and publishes to the Homey App Store; it fails unless tag, `.homeycompose/app.json`, `package.json` and `.homeychangelog.json` agree and the commit is on `main`. Do not tag or bump for repo-file changes.

## Feller
- `.homeyignore` decides what goes into the published app: new repo-only files must be listed there.
- Build against upstream's firmware API, not a fork's. The firmware's SSDP answers only to `ssdp:all`, so discovery searches with that and filters on the server header.
- `README.txt` and `README.no.txt` are the store text: the text shown in the Homey App Store.

## Se også
`SECURITY.md`: trust boundaries, discovery and login handling. `README.md`: features and development.
