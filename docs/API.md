# Mode-aware API

Original endpoint contracts are retained. Requests default to the original offline AiEngine. For supported languages, Online mode adds `X-HearMe-Mode: online` and `X-HearMe-Cloud-Consent: yes`. Missing consent returns 428 before any cloud call. These headers express opt-in, not authentication; deployments still need network access control.

- `POST /api/understand?lang=hi&target=needs`: recorded audio to transcript, match and explicit requests/refusals. NDJSON progress remains supported. In Online mode Saaras transcribes and Groq extracts catalogue IDs; otherwise the original local engine runs. Clips are capped at thirty seconds on the provider side; the UI caps at fifteen seconds.
- `POST /api/match`: `{text, lang, target}`; the same structured matching path for typed text. Maximum 300 characters. Failed online matching is reported instead of silently submitting a local guess.
- `POST /api/translate`: `{text, from, to}`; Sarvam when both languages are supported and Online mode is selected; otherwise original NLLB. Maximum 300 characters.
- `POST /api/announce/translate`: `{text, from}`; per-language routing as above. Returns `texts`, `failed`, `ms`, `machine`. No failed translation is presented as successful.
- `POST /api/speech`: `{text, lang}`, 1-2500 characters. Requires Online mode plus explicit cloud consent. Returns `audio/mpeg` with `Cache-Control: no-store`. Bulbul v3, speaker simran, 22050 Hz. Ten Indian languages plus English only.
- `GET /api/status`: original model status plus `online` configuration booleans and translation counters. Credential presence does not guarantee account access.
- `/ws`: original seat-scoped catalogue requests, crew acknowledgements and replies. Groq cannot issue relay commands; the client submits validated catalogue IDs.
- Former `/api/assistant*` POSTs return 410. No wake listener or chat endpoints remain active.

Supported cloud language codes: `hi en bn ta pa mr gu kn ml or te`; `or` maps to Sarvam `od-IN`. Japanese, Thai, Indonesian and Vietnamese always use the local engine, even in Online mode. Raw provider errors and credentials are never returned.
