# Translation latency

Scope: these controls apply to the optional online provider adapter. The original UI and local NLLB translation workflow have been restored; this document does not claim changes to that engine’s latency.

The online path removes local NLLB loading, local model warm-up and inference queues shared with Whisper. This changes the runtime architecture; it does not establish a measured improvement over the old offline model on a particular network.

Implemented latency controls:

1. A same-language translation returns immediately without a provider call.
2. Identical text/source/target translations share one in-flight promise.
3. Successful translations are cached in memory for 60 seconds, with at most 256 entries. Failures are not cached.
4. Online mode’s online translation adapter supports up to four simultaneous translations; original announcements retain their original local workflow.
5. Online mode translates answer and follow-up concurrently and carries English conversation context forward, avoiding repeated history translation.
6. Online speech accepts preprocessed 16kHz mono audio. WAV encoding is in memory; there is no model load or temporary recording file.
7. Provider requests have abortable 12-second deadlines by default. Queue capacity is bounded; changing `HEARME_API_TIMEOUT_MS` adjusts per-provider deadlines from 1–30 seconds.
8. Bulbul v3 synthesizes answer and follow-up in one request using MP3 at 22050 Hz. Four synthesis operations may run concurrently. Replaying the current reply reuses one audio object in browser memory; it is released on close, clear or page hiding. The browser's speech-loading deadline is 20 seconds. Audio latency is additional to the conversation's reported `ms`.

`GET /api/status` exposes `online.translation` counters (`requests`, `hits`, `shared`, `providerCalls`, `lastMs`) without logging passenger text. `lastMs` measures the latest uncached operation, not an overall percentile or SLA.

## Measure with your account

```powershell
npm run benchmark:translation
```

This explicitly invoked benchmark sends five synthetic English cabin phrases to Sarvam Hindi translation and then measures a cache hit. It prints uncached timings and the median. It uses paid provider credits; it sends no bookings, recordings or live passenger data. Compare from the deployment network and report uncached latency separately from cache-hit latency. Follow-up end-to-end latency also includes speech, normalization, Groq and output translation.

On 2026-10-25, one live run from this Windows host measured uncached translations at 1180, 706, 670, 642 and 696 ms: median **696 ms**. The repeated phrase returned in less than 1 ms (rounded to 0 ms). This small sample describes this network and account, not a production percentile, guaranteed latency or comparison against the original local model. Tests use deterministic injected providers to verify deduplication, errors and concurrency.
