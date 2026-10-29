# AMS reader for Homey

Homey app for the [AMS reader](https://www.amsleser.no/) from Utilitech, which reads Norwegian, Swedish and Danish smart meters through the HAN port. The app polls the reader's local web API (`/data.json`) over HTTP, so it needs no MQTT broker or cloud service.

This app is not made by or affiliated with Utilitech AS. It talks to the open source [amsreader-firmware](https://github.com/UtilitechAS/amsreader-firmware).

## Features

- The reader becomes the main meter in Homey Energy (imported and exported kWh)
- Power, also per phase when the meter sends it; negative while solar panels export
- Voltage and current per phase, with an estimate of the L2 current for meters on IT networks that do not measure it
- Imported and exported energy today, usage this hour, this month's capacity average and the capacity step from the reader
- Temperature, when a sensor is connected to the reader
- Flow cards: contact with the meter lost and restored, usage this hour passed a limit, capacity step changed; conditions for the meter sending data and usage this hour
- Readers are found with SSDP and mDNS, or added by IP address; readers found with SSDP are followed to a new address

## Development

```sh
npm ci
npm test            # unit tests
npm run lint
npx homey app run   # run on your Homey
```

Releases are published from Forgejo when a `vX.Y.Z` tag is pushed. This GitHub repository is a mirror; pull requests are welcome here.

## License

GPL-3.0
