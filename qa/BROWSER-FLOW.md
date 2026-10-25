# Passenger browser flow — 24 October 2026

- Seat QR codes now open `/mobile/?seat=...` directly. Local certificate setup remains optional at `/trust`; QR links never send passengers there.
- Local certificates use the existing HTTP listener for direct browser access. Custom HTTPS with no local CA uses HTTPS. Browser microphone access requires trusted HTTPS.
- IFE welcome and home screens display a QR for their own seat using the hub's LAN address. QR UI is absent without a connected hub rather than advertising an unreachable localhost link.
- Phone browser content is the existing Expo web export. No app installation is required.
- Workspace typechecks pass. IFE suite: 8 tests pass. Targeted hub/certificate suites: 23 tests pass, including direct browser page serving and installation-free join links.
- Mobile web export and final IFE production build passed after correcting language-pack fallback typing.
- Browser check used the exact QR destination for sample seat 31A: booking opened in Vietnamese, the passenger home appeared, and a water request was received by the live local hub. AI was disabled for this verification.
- Screenshots: `ife-browser-qr.png`, `ife-home-browser-qr.png`, `passenger-browser-request.png`. Physical phone scanning and native app execution were not tested.
