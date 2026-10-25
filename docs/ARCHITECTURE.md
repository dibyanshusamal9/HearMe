# Architecture

HearMe remains an npm workspace monorepo. The original AiEngine owns local Whisper, e5 and NLLB. A separate OnlineService owns Saaras, Groq structured keyword extraction, Sarvam translation and Bulbul. Only the hub reads credentials.

`packages/shared/src/cabin/processingMode.ts` holds the per-page mode and cloud headers. It defaults offline, exposes a subscription for React and speech adapters, and synchronizes the demo frames with validated same-origin messages. The browser phone, seatback, crew console and stage expose the right-side switch.

The existing `/api/understand` and `/api/match` handlers choose a provider per request and language. Cloud speech is limited to ten Indian languages plus English. Other Asian languages and mixed translation pairs use the original offline engine. No global server mode leaks one passenger's opt-in into another passenger's requests.

Groq outputs catalogue IDs, confidence and refusals. The shared auto-submit helper excludes uncertain or refused needs and uses PassengerSession to submit recognized speech. The original WebSocket relay delivers each request to crew and routes replies to the registered seat. No provider has direct relay access. Typed and picture requests retain their original review flow.

The microphone pause detector ends voiced recordings after 1.2 seconds of silence, with a fifteen-second cap. Silence and stale results after a mode change cannot submit requests. The demo's prerecorded story uses the same matching and auto-submit path, ending the clip at its recorded duration.

`packages/shared/src/web/cloudVoice.ts` implements the existing ReplyVoice interface. It selects Bulbul only in Online mode for supported languages and device voices otherwise. Mode changes stop pending audio. The stage reads embedded-phone replies through its existing message bridge; standalone browser phones and seatbacks use the same mode-aware voice adapter. Seatback announcements auto-play with voice enabled and provide replay controls.

See [modes](MODES.md), [API](API.md) and [privacy](PRIVACY.md). Tara, wake recognition and personalized follow-ups are retired.
