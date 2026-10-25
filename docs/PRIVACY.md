# Processing and consent

All pages start offline and keep the original cabin-network processing. Selecting Online mode requires explicit acceptance of the cloud disclosure. The demo propagates this choice only between its same-origin parent and embedded device frames, validating message origin and source. Standalone devices choose independently. Consent and mode are not persisted across page loads or passengers.

Online mode sends supported-language recordings to Saaras, request text to Groq for structured catalogue matching, and text to Sarvam for translation and Bulbul speech. Request, crew-reply and announcement text can contain sensitive or medical details. Booking manifests and medical profiles are never automatically added to provider prompts. No chat history or wake-word recognition is used.

Other Asian languages remain on the local engine. Offline requests never select cloud adapters. Switching offline prevents new cloud calls and aborts pending browser audio loads; work already forwarded to providers cannot necessarily be recalled. Microphone cancellation also stops streams whose permission prompt resolves after cancellation.

Recordings and synthesized audio are not persisted in the normal service path. Translation uses a bounded sixty-second memory cache. One synthesized reply may remain in browser memory for replay; clearing or stopping the mode voice releases it. Provider retention follows the configured account agreements. The development voice lab keeps its original explicit recording-retention option.

Spoken requests now submit automatically after a pause when catalogue matching is confident. Refusals and uncertain matches are excluded; duplicate suppression and seat-scoped delivery remain enforced. Typed and picture requests keep their review screen. All passengers see delivery state, and an AI response cannot claim crew receipt.

Keep keys in the server `.env`, outside Git and public client configuration. Cloud consent headers are not authentication; add access control at the deployment boundary.
