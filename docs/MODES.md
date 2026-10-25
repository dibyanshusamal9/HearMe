# Online and Offline modes

Use the switch on the right of the demo, phone, crew console or seatback header. Pages start in **Offline mode**. Enabling Online mode shows a cloud disclosure and requires explicit opt-in. The demo synchronizes the choice with its embedded passenger and crew devices. Standalone devices choose their own mode. The choice is held in memory and is cleared when the passenger session ends.

## Passenger requests

Use the original **hold-to-speak** button. A short tap also starts recording; pause after speaking to finish automatically. After at least two voiced microphone frames, a 1.2-second pause ends the recording. Recordings are capped at fifteen seconds. Silence does not create a request. Releasing a held button still ends the clip as before.

Confidently recognized catalogue needs are automatically submitted through the existing cabin relay, in either mode. Several explicit needs can be submitted together; refusals and uncertain matches are excluded. Ambiguous speech still opens the original clarification pictures. Typed and picture requests retain their original review flow. Delivery acknowledgements, crew replies, duplicate suppression and retry behavior remain unchanged.

- **Offline mode:** original local Whisper, e5 matching and NLLB translation from GitHub.
- **Online mode, supported languages:** Saaras speech-to-text, Groq keyword extraction, Sarvam text translation and Bulbul v3 speech.
- **Online mode, other Asian languages:** Japanese, Thai, Indonesian and Vietnamese retain local processing and device speech. No Sarvam request is made for unsupported languages.

Online coverage is ten Indian languages plus English: Hindi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Marathi, Punjabi and Odia. Application `or` maps to Sarvam `od-IN`. Translation involving another Asian language uses the original local translator, including Japanese crew text. Fixed crew replies already contain translations and do not need another translation call.

## Crew replies and announcements

Crew receive catalogue keywords in the existing console and answer normally. Their own words are translated before being sent; passengers see translated text and hear it through Bulbul in Online mode for supported languages. Offline and unsupported-language playback uses installed device voices. Browser autoplay may require a passenger tap; the original reply dialog provides replay.

Seatback announcements automatically play when voice output is enabled (the default). The announcement banner and announcements list also have replay controls. The seatback unlocks audio on the first real tap or keypress. If an offline language voice is missing, the interface reports it instead of claiming audio played. Offline audio requires an installed device voice. Safety announcements keep their fixed, pretranslated text.

The retired Tara screen, wake phrase and chat/follow-up flow are removed. Keep the page visible while recording. Switching modes or leaving the recording screen stops recording; switching offline stops pending cloud playback. Already forwarded provider requests cannot be recalled.

## Setup and checks

Keep `SARVAM_API_KEY` and `GROQ_API_KEY` in the root `.env`; restart the hub after editing them. Keys never enter browser or Expo public configuration. Run `npm run demo` for original setup, or `npm run hub` when models and clients are already built. `npm run check` checks configuration without paid calls.

Run `npm run typecheck`, `npm test -- --maxWorkers=1 --pool=threads` and `npm run build`. Native Android/iOS runtime has not been exercised; the original native speech adapter remains simulated. Live microphone and Bulbul behavior is implemented in the browser phone and seatback.
