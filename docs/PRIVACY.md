# Processing and consent

All pages start offline and keep the original cabin-network processing. Selecting Online mode requires explicit acceptance of the cloud disclosure. The demo propagates this choice only between its same-origin parent and embedded device frames, validating message origin and source. Standalone devices choose independently. Consent and mode are not persisted across page loads or passengers.

Online mode sends supported-language recordings to Saaras, request text to Groq for structured catalogue matching, and text to Sarvam for translation and Bulbul speech. Request, crew-reply and announcement text can contain sensitive or medical details. Booking manifests and medical profiles are never automatically added to provider prompts. No chat history or wake-word recognition is used.

Other Asian languages remain on the local engine. Offline requests never select cloud adapters. Switching offline prevents new cloud calls and aborts pending browser audio loads; work already forwarded to providers cannot necessarily be recalled. Microphone cancellation also stops streams whose permission prompt resolves after cancellation.

Recordings and synthesized audio are not persisted in the normal service path. Translation uses a bounded sixty-second memory cache. One synthesized reply may remain in browser memory for replay; clearing or stopping the mode voice releases it. Provider retention follows the configured account agreements. The development voice lab keeps its original explicit recording-retention option.

The fixed announcement catalogue has separate, pre-generated MP3 assets in every selectable language. These contain only public template text. Bulbul generates Indian-language/English clips; Microsoft Edge TTS generates the four other Asian-language clips at build-time asset preparation. Neither receives passenger data through that generation command. Normal recorded-announcement playback serves these bundled files from the hub without a TTS provider call. Custom announcements keep the ordinary consent-controlled provider/device route.

Spoken requests now submit automatically after a pause when catalogue matching is confident. Refusals and uncertain matches are excluded; duplicate suppression and seat-scoped delivery remain enforced. Typed and picture requests keep their review screen. All passengers see delivery state, and an AI response cannot claim crew receipt.

Keep keys in the server `.env`, outside Git and public client configuration. Cloud consent headers are not authentication; add access control at the deployment boundary.

## Optional private phone tunnel

`npm run phone-link` is a separately opted-in, temporary Cloudflare HTTPS route for the browser phone. Phone recordings, requests, cabin replies and announcements pass through Cloudflare, even when inference uses Offline mode. This transport requires internet access. It does not expose crew/observer WebSocket roles, crew commands, the console, lab or administrative APIs. Access uses a private link exchanged for a secure HttpOnly cookie, with a two-hour lifetime. The helper binds only to loopback, limits request sizes and rates, and retains no recordings. Its state and executable live in ignored `.npm-cache` files. Keep the link private and stop the helper to end access. Provider and transport retention are subject to the respective service agreements.
