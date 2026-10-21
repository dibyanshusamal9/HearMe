# HearMe

> Helping passengers and cabin crew understand each other. In any language. In a noisy cabin. Even with no internet.

A working prototype of *HearMe · Idea Submission* by Nidhish Bansal, Dhruv Mittal and Dibyanshu Samal.

**Example.** Sharda is 68, speaks only Hindi and is a little hard of hearing. She holds her phone's microphone and says *"मुझे दवाई के लिए गरम पानी चाहिए"*. About three seconds later the crew tablet shows **23C · お湯 · 薬を飲むため** (hot water, to take medicine) in Japanese. One tap sends *"I'll bring it right away"* back to her in Hindi, on screen and read aloud. Speech recognition and matching run on a laptop standing in for the crew tablet, with no internet.

▶ **[Watch the demo](docs/demo.mp4)**, recorded from the running prototype with `npm run record-demo`. There is also a [30-second silent clip for slides](docs/demo-short.mp4). Decks: [idea submission](docs/deck/HearMe_Idea_Submission.pdf) and [with results](docs/deck/HearMe_Deck_Results.pdf).

![Demo stage: passenger phone, cabin network, crew console](docs/screenshots/stage.png)

| [Care Mode: urgent report, doctor call captioned on every seat](docs/screenshots/care-mode.png) | [Crew console](docs/screenshots/crew.png) | [Launcher](docs/screenshots/launcher.png) | [Printable seat cards](docs/screenshots/seats.png) |
| --- | --- | --- | --- |

---

## Run the demo

You need Node 20 or newer and about 1.5 GB of free RAM. ffmpeg is optional: it is only needed for audio from native phones.

```bash
npm install
npm run demo -- --check   # checks models, build, ports, Wi-Fi address and certificate
npm run demo
```

`npm run demo` does three things:

1. On the first run, it downloads the offline AI models into `apps/hub/.models`, about 480 MB, once.
2. It builds the apps.
3. It starts the **cabin hub** and opens the **demo stage**.

| Open | What |
| --- | --- |
| `http://localhost:8080/#/stage` | Demo stage: the phone or seatback, the network timeline and the crew tablet side by side, with cabin noise and a recorded backup of the demo. |
| `http://localhost:8080/` | Launcher: every surface, the phone QR code, seat cards and the recorded demo. |
| `https://<laptop-ip>:8443/mobile/?seat=23C` | **A real phone** on the same Wi-Fi. Scan the QR code on the stage or in the terminal. |
| `http://localhost:8080/#/crew` | Crew console. |
| `http://localhost:8080/?seat=23C#/ife` | Seatback (IFE) screen. |
| `https://<laptop-ip>:8443/seats` | Printable seat-pocket cards: a QR code per seat, plus a picture card for passengers without a phone. |

> **Certificate warning on phones.** Browsers only allow the microphone over HTTPS, so the hub uses a self-signed certificate (created in `apps/hub/.cert`). On the phone, choose *Advanced → Continue*. Taps and typing also work over plain HTTP.

Options:
- `--no-ai` starts without speech (taps and typing still work).
- `--rebuild` forces a fresh build.
- `--no-open` does not open a browser.

On the stage, click the **Whisper** chip to switch live between *small*, which is more accurate, and *base*, which is about 4× faster.

---

## How it works

![Architecture](docs/architecture.svg)

- **Tap it, say it, or point at it.** The passenger taps one of 40 pictures, holds the microphone, or types. Without a phone, they point at the printed seat card.
- **Understanding, not translation.** Whisper transcribes the passenger's language on the hub. Four signals then pick one of 40 needs:
  1. Exact keywords in 6 languages.
  2. A **sound-alike** tier for the way Whisper misspells what it hears (डवा → दवा, *xinh* → *sinh*, นาว → หนาว).
  3. **multilingual-e5** sentence embeddings.
  4. A **classifier trained** for cabin requests.

  At 85% confidence or above, the request is ready to send. Below that, the passenger sees *"Did you mean?"* pictures and *None of these, call crew*. When a keyword and the meaning model disagree, both are shown as pictures rather than one being guessed.
- **Verified replies only.** Crew replies are pre-written phrases checked in all 6 languages. A crew member can also *say* a reply in Japanese; it is matched to the closest verified phrase and confirmed before it is sent. Free machine translation never reaches a passenger.
- **Care Mode.** A body map, a 0–10 pain scale, and symptom and condition lists, one tap from the home screen on both phone and seatback. The crew get a Japanese and English summary, with urgent reports first in red. One tap calls for a doctor; the call is captioned on every seat in that seat's language. The crew can also print a **handover sheet** for the doctor or the ground team.
- **Crew console.** Live numbers: open requests, median answer time, understood first time, needed pictures, oldest wait, medical, languages.
  - Click a seat to see its language and the needs shared at check-in.
  - A heat view shows which rows ask most.
  - A **post-flight report** can be printed.
- **Privacy.** Audio is processed in memory on the hub and then dropped; it is never written to disk. Only the meaning travels: need, purpose, seat, language and confidence. The seatback stores nothing.
- **Resilience.**
  - Each transcription has a time limit, and the speech model reloads itself after repeated failures.
  - If meaning-matching fails, matching falls back to keywords.
  - Phones reconnect on their own.
  - Without a hub, the apps run a simulated crew, clearly labelled.

| Part | Stack | Folder |
| --- | --- | --- |
| Cabin hub: HTTP/HTTPS, WebSocket relay, offline AI, booking lookup, QR codes | Node + TypeScript, `@huggingface/transformers` (onnxruntime-node), `ws` | `apps/hub` |
| Passenger phone app (also native Android/iOS through Expo); 0.8 MB web bundle | Expo / React Native, exported to the web as a PWA | `apps/mobile` |
| Seatback screen, crew console, demo stage, launcher | React 19 + Vite | `apps/ife` |
| Shared core: 40 needs, translations, matcher, protocol, request state machine, Care Mode, metrics | TypeScript | `packages/shared` |

---

## Measured results

All numbers were measured on a MacBook Air (M2, 8 GB RAM). The scripts and test phrases are in `apps/hub/src/scripts`.

**Typed requests in 6 languages.** The held-out set is 72 phrasings that were never used for tuning or training.

| | top-1 | right picture in top 3 | wrong but sent confidently |
| --- | --- | --- | --- |
| Keywords only (original prototype) | 72% | 75% | 1% |
| Keywords + e5 | 89% | 94% | 1% |
| **Keywords + e5 + trained classifier (now)** | **94%** | **100%** | **0%** |

**Spoken requests.** These are the held-out phrasings spoken by macOS voices, run through Whisper-small, with synthetic cabin noise (engine rumble, hum and airflow) mixed in.

| Noise | top-1 | sent without asking | wrong but sent confidently | median recognition time |
| --- | --- | --- | --- | --- |
| Clean | 82% | 53% | 1% | 3.1 s |
| 10 dB SNR | 85% | 56% | 1% | 3.5 s |
| 0 dB SNR (noise as loud as the voice) | 67% | 44% | 0% | 3.4 s |

![Spoken requests understood, by language and noise level](docs/results.svg)

**How the speech numbers were made, honestly:**
- The first blind run on these phrasings sent 4–6% of requests confidently with the wrong need.
- We looked at those errors and made three general fixes:
  - When a keyword and the meaning model disagree, ask instead of guessing.
  - A longer phrase heard by sound overrides the keyword inside it.
  - One Thai keyword was removed because it sits inside "ขอชาร์จ" ("may I charge").
- The table shows the results after these fixes, so it is no longer fully blind.
- On the development phrasings, which were used to design the sound-alike rules, the results are 92% / 85% / 75% top-1.
- Thai is the weak spot, especially in loud noise. Thai vocabulary and two Whisper Thai spellings (ขออยาก → ขอยา, ชาติ → ชาร์จ) were then fixed using the development set only. Thai on the held-out set went from 53% to 56%, and the development set from 50% to 64%. Folding long and short Thai vowels together was also tried: no measurable change.
- Whisper-base is about 4× faster but less accurate (57–69% top-1).

**Languages HearMe has never seen.** Typed requests in Bengali, Tamil and Tagalog, with no HearMe vocabulary, translations or training data for them:

| | top-1 | right picture in top 3 | wrong but sent confidently |
| --- | --- | --- | --- |
| Bengali (no pack) | 67% | 92% | 0% |
| Tamil (no pack) | 58% | 92% | 0% |
| Tagalog (no pack) | 58% | 92% | 0% |

The trained classifier roughly doubles e5's zero-shot top-1 (33–42% → 58–67%). The sample is small: 12 requests per language.

**Adding a language is a data file.** A language pack (`apps/hub/data/languages/<code>.json`) lists keywords for the 40 needs, plus templates or example requests. With a pack:

- The hub understands the language **typed and spoken**: Whisper runs in it, and the sound-alike tier covers Indian scripts.
- The phone offers it at onboarding ("speak or type in Bengali · screens in English").
- The crew console and the stage show it.
- It is loaded without restarting the hub.

To add a language:

```bash
npm run models -- translate                                # once: NLLB-200 offline translation model (~900 MB)
npm run add-language -w @hearme/hub -- ta --draft          # draft data/languages/ta.json offline, retrain, measure, load
```

`--draft` translates the English catalogue with NLLB-200 on the laptop. The draft is marked `machine` and is only used to *understand* passengers; it is never shown to them, and it needs a native speaker's review. Some of its words are wrong: in the Tamil draft, "blanket" came out as "cloth".

| Typed (12 requests each) | top-1 | top-3 | wrong but sent confidently |
| --- | --- | --- | --- |
| Bengali, hand-written pack | 100%* | 100% | 0% |
| Tamil, machine-drafted pack | 67% (was 58%) | 83% | 0% |

| Spoken (macOS voices → Whisper-small, 12 each) | top-1 | top-3 | wrong but sent confidently |
| --- | --- | --- | --- |
| Bengali, with pack | 42% (was 17%) | 67% | 0% |
| Tamil, with pack | 50% | 67% | 0% |

\* Optimistic: the pack and the test phrases were written by the same person and share words.

Notes on these numbers:
- Whisper-small writes Bengali speech in Hindi letters ("अमार" for "আমার"). The hub converts it to Bengali script, which is why spoken Bengali rose from 17% to 42%.
- Spoken Bengali and Tamil are still weak. Whisper-small hears these languages poorly; a larger speech model would be the next step.
- The screens, replies and captions for pack languages are still in English.

**Other results:**
- **Crew voice replies:** 14 of 14 spoken Japanese phrasings matched the right verified reply. Each takes about 1.7 s.
- **Noise reduction:** tested and not used. Spectral subtraction before Whisper did not help: 65% at 0 dB with it, against 68% without.
- **Accessibility:** axe-core found no WCAG 2.1 A or AA violations on the launcher, stage, crew console, seatback, phone app or seat cards.

> These numbers come from synthetic voices and synthetic noise, not from real passengers in a real cabin. They show that the pipeline works and how it degrades with noise; they are not a field result. The design prefers asking with pictures to guessing.

---

## What is real and what is simulated

| Real in this prototype | Simulated or sample |
| --- | --- |
| Offline speech recognition (Whisper) and need matching (keywords, e5, trained classifier) on the hub | Booking lookup uses a sample passenger manifest (`apps/hub/data/manifest.json`), not an airline PNR system |
| Phone ↔ hub ↔ crew over WebSocket across devices, with seat-scoped delivery, receipts and reconnects | The crew tablet is a laptop browser; there is no certified aircraft hardware |
| Microphone capture in the phone browser (echo cancellation, noise suppression, 110 Hz high-pass filter, 16 kHz) | Seatback (IFE) is a browser page with no IFE platform integration |
| Seat QR → booking → language and seat filled in, no typing | Translations are prototype drafts that need native and airline review; Care Mode wording needs clinical review |
| Offline PWA (service worker), bundled fonts, no internet calls | Without a hub, the apps fall back to a simulated crew, clearly labelled |

---

## Cost and business model

These are working assumptions for a pilot conversation, not quotes. Slide 7 of the [results deck](docs/deck/HearMe_Deck_Results.pdf) shows the same thing.

| | Assumption |
| --- | --- |
| Hardware | None new: passengers' own phones, the crew's existing tablet (or a small cabin PC per aircraft), printed seat cards |
| Running cost | No internet, no cloud bill, no per-request AI fees: everything runs on board |
| Price | About $150 per aircraft per month for software, updates, languages, the crew dashboard and flight reports. A 100-aircraft airline would pay about $180k a year |
| New language | A data file (draft it with `add-language --draft`) plus a one-off native review. No code |
| Value to prove in a 3-month pilot | Answer time, understood first time, repeats avoided, medical response time, passenger satisfaction |

Questions judges ask, with short honest answers: [docs/judges-qa.md](docs/judges-qa.md).

---

## Development

```bash
npm run dev            # Vite dev server for the web apps (proxies /api and /ws to a running hub)
npm run hub            # the cabin hub on its own
npm run mobile         # Expo dev server (Expo Go on Android/iOS); set the hub address in Settings
npm run typecheck      # shared, hub, ife, mobile
npm test               # shared, hub and IFE tests (CI runs these plus the builds on every push)
npm run build          # Expo web export + web apps (apps/ife/dist)
npm run eval           # typed + crew evaluation; add `-- --speech --snr 10,0` (and `--set heldout`, `--denoise`)
npm run record-demo    # re-record docs/demo.mp4 (needs Google Chrome, ffmpeg, macOS `say`)
npm run train -w @hearme/hub      # retrain the need classifier (minutes, on the laptop CPU)
npm run rescore -w @hearme/hub    # re-score saved Whisper transcripts after matcher changes (seconds)
npm run zeroshot -w @hearme/hub   # Bengali / Tamil / Tagalog check
npm run add-language -w @hearme/hub -- bn   # add a language from data/languages/<code>.json, retrain, measure
npm run chart -w @hearme/hub      # redraw docs/results.svg
npm run a11y -w @hearme/hub       # axe-core accessibility check of every screen
```

## Assumptions

- **Languages:** Hindi, English, Japanese, Thai, Indonesian and Vietnamese, chosen for the persona, the crew and the India / South-East Asia routes. The crew language is Japanese.
- **The hub is the crew tablet.** The PDF puts the speech AI on the crew tablet; here it is a Node service on any laptop on the cabin Wi-Fi.
- **The seatback has no microphone or keyboard.** It offers pictures, the show-to-crew card and read-aloud replies.

## Remaining work

- Field test with real voices at 75–85 dB of cabin noise, and improve Thai.
- Professional, human-checked translations; airline-approved safety and announcement content; clinical review of Care Mode.
- UI in more languages. Matching already reaches unseen languages (see above); the screens, replies and captions need translating.
- Integration with the airline booking/PNR system and the ground handover. Certified crew-tablet and IFE hardware.
- Native device testing of the Expo app. In this environment it has been exercised on the web build only.
