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
