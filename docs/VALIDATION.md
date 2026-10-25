# Validation · 2026-10-25

## Online / Offline modes and automatic speech submission (current)

- All workspace typechecks and the production Expo web/Vite build pass.
- Current suites passed: **690 tests** (602 shared, 73 hub, 15 IFE), using a single thread worker per workspace. New coverage checks cloud routing, explicit consent, local Asian-language fallback, automatic catalogue submission, excluded refusals/uncertain matches, pause detection, pending-audio cancellation and seatback announcement playback/replay in both modes.
- Live synthetic checks passed through the new existing microphone endpoint: Saaras transcribed “I would like some tea, please.” and Groq returned the `tea` catalogue keyword. An English crew reply translated into Hindi and generated a valid Bulbul MP3 with HTTP 200.
- Browser checks confirmed right-side mode switches, synchronization between the stage and embedded crew/passenger views, the unchanged microphone button, the pause-to-submit hint, removal of Tara, and the seatback announcement banner with replay. The phone header was adjusted to keep the original seat/language controls clear at 390px.
- `git diff --check` passed. The design detector reported no deterministic issues. The inherited native workspace still has no lint script; no lint success is claimed.
- Actual acoustic pause detection under cabin noise and native Android/iOS runtime were not exercised. Device voices are required for offline speech. Browser microphone access needs HTTPS or localhost, and autoplay may require a tap.

All assistant checkpoints below are historical; the mode-based pipeline above supersedes them.

## Earlier Bulbul voice and embedded passenger phone

- Tara offers exactly ten Indian languages plus English. All assistant endpoints reject other languages before provider calls; original screen language choices remain unchanged.
- Bulbul v3 generates the translated reply and follow-up together. Speech is enabled by default for both typed and voice requests. Wake listening stays paused until playback ends; cancelled or hidden panels cannot play delayed audio.
- Suites passed: **694 tests** (599 shared, 74 hub, 21 IFE). Coverage includes binary MP3 responses, consent denial, invalid provider audio, locale routing, unsupported languages, translated spoken follow-ups, blocked-autoplay replay without another paid request, close during synthesis, and phone dispatch through its existing PassengerSession. A Windows fork worker crashed in a combined run; isolated hub and IFE runs passed with `--pool=threads --maxWorkers=1`.
- All workspace typechecks and the Expo web/Vite production build passed. The inherited native workspace still has no lint script; no lint success is claimed.
- Live synthetic Bulbul calls returned HTTP 200 in English, Hindi, Odia and Malayalam. English output was verified by ffprobe as MP3, 22050 Hz, 1.85 seconds. Hindi conversation and follow-up completed in the stage's embedded phone with Bulbul playback enabled.
- Browser inspection verified the pinned **Talk to Tara** control above the original microphone, the inline phone assistant, current seat, eleven language options, translated Hindi follow-up, playback controls and original navigation. The phone uses the existing sans-serif interface family. Native Android/iOS runtime was not exercised; those builds use a browser handoff.

The earlier checkpoints below record the former device-voice implementation and expanded language list; they are retained as history and superseded by this section.

## Earlier integrated online voice assistant

Tara now opens from an optional passenger-home control and launcher link, while original controls and local processing remain available. The inline seatback panel shares the existing seat and PassengerSession; the phone opens the standalone foreground browser assistant.

- `npm run typecheck`: passed in all workspaces after the final changes.
- `npm test -- --maxWorkers=1`: **684 passed** (599 shared, 69 hub, 16 IFE). The 69 hub tests passed again after tightening the conversation instructions.
- `npm run build`: passed, including Expo web export and Vite production assets.
- New integration tests cover opening the panel without gating original controls, session-end consent revocation, wake → microphone → cloud transcription → follow-up → spoken reply → wake rearming, cancelled recordings without uploads, and playback cleanup on page hiding.
- Live provider checks passed using server-side credentials: synthetic English WAV speech was transcribed as “I would like some tea, please.”; Groq returned English and Hindi conversations; a caffeine-free preference produced “Would you prefer water or juice?” in the browser.
- The synthetic translation benchmark measured a 696 ms median across five uncached English-to-Hindi phrases and a repeat cache hit below 1 ms. See [performance notes](PERFORMANCE.md) for sample sizes and limits.
- Browser inspection confirmed the original passenger controls remain available, all 26 Tara language options, disabled inline seat editing, configured voice controls, a live follow-up, desktop panel layout and the standalone 390px phone layout. The original seatback retains its desktop layout; phones use the standalone responsive route.
- Design detector reported no deterministic issues. `git diff --check` passed. The root `.env` is ignored by Git; credentials are not part of client configuration.

Real microphone accuracy, acoustic wake detection and native-device runtime were not exercised. Wake and playback lifecycle behavior is covered by injected browser API tests. Browser recognition and available playback voices depend on the deployment device; keep Tara open and visible with microphone permission and HTTPS or localhost.

The sections below record earlier checkpoints and their limitations at that time; the live provider checks above supersede the earlier missing-key notes.

## Original-interface restoration

The original launcher, mobile app, IFE screens, demo stage, voice lab, CSS and interface strings now match the upstream sources. The crew console differs only in a TypeScript dictionary annotation; its original rendered content and behavior are unchanged. The only new browser route is the optional `/#/assistant`; no original route is wrapped in cloud consent.

- Typechecking passed for all workspaces.
- Current suites passed: **681 tests** (599 shared, 69 hub, 13 IFE). The IFE suite was rerun successfully after a Windows worker stalled during the combined run.
- Expo web export and Vite production build passed.
- `npm run demo -- --check` passed.
- Local Whisper-small and e5 reported **ready** after warm-up. Existing model files were recovered from the local backups; Whisper-base was also installed for the original fast-model switch.
- The original launcher was checked in the browser with no consent gate or Tara navigation additions.
- Source comparison confirmed that original mobile screens, IFE screens, launcher, stage, lab, styles and localized strings are unchanged.

The earlier online-only validation below is retained as history. Default application processing is now restored to the original local engine. Optional Tara provider calls still need configured API keys for live verification.

## Earlier online implementation

Validated from the repository root on Windows with Node.js 24.15.0.

- `npm run typecheck`: passed for shared, hub, IFE and Expo workspaces.
- `npm test -- --maxWorkers=1`: **703 passed** — 622 shared, 68 hub, 13 IFE tests. Sequential execution avoids a transient Windows worker crash observed in a concurrent certificate test run.
- `npm run build`: passed, including Expo web export and the Vite production build.
- `git diff --check`: no whitespace errors.
- Browser inspection: consent disclosure, Tara setup state, all 26 language options, desktop layout and 390px phone layout. No horizontal overflow was observed. Microphone controls remain disabled when provider keys are missing.
- Design detector: no deterministic issues in the new assistant/consent UI.

New automated coverage includes consent denial/revocation, provider routing, Odia locale mapping, translation cache expiry and in-flight deduplication, concurrency limits, bounded queues, missing credentials, sanitized errors, WAV encoding, urgent-result behavior, personalized context, explicit crew dispatch and wake-listener cleanup.

`npm run check` confirms Node and both built clients; it reports missing **SARVAM_API_KEY** and **GROQ_API_KEY**. A credential-free root `.env` is ready for configuration. No live provider calls, paid benchmarks, real microphone speech accuracy, acoustic wake-word performance, or end-to-end provider latency were validated. The native app was typechecked and exported for web; native device runtime was not exercised.

The inherited Expo workspace has no lint script: `npm run lint -w @hearme/mobile` reports “Missing script: lint”. No lint success is claimed. CI currently uses typechecking, tests and builds.
