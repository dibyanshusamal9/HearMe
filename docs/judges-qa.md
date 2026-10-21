# HearMe: questions judges ask

Short, honest answers. The numbers come from the [README](../README.md#measured-results). That README section also says how each number was measured and where the limits are.

### Why not just use Google Translate?
Google Translate needs the internet, which most cabins don't have or don't trust, and it translates every word. A crew member then has to read the result, guess what the passenger needs, and answer in a language they can't check.

HearMe works differently:
- It matches the passenger's words to one of 40 cabin needs.
- The crew see that need in Japanese, with the seat and context.
- One tap sends a reply that has already been checked in the passenger's language.
- It runs offline, and safety wording is never machine-translated.

### How accurate is it?
**Typed requests** in the 6 languages, on 72 phrasings never used for tuning:
- The right need comes first 94% of the time.
- It is in the top 3 pictures 100% of the time.

**Spoken requests** with synthetic cabin noise, through offline Whisper:
- Clean: 82% top-1.
- At 10 dB: 85%.
- With noise as loud as the voice: 67%.

When unsure, HearMe asks with pictures instead of guessing; at most 1% of requests were sent confidently with the wrong need. These numbers come from synthetic voices, not real passengers. The voice lab (`#/voicelab`) is how we collect real-voice results.

### What happens when it gets it wrong?
Below 85% confidence it never sends. It shows "Did you mean?" pictures, plus *None of these, call crew*. When a keyword and the meaning model disagree, it asks. The passenger always sees what will be sent before it goes, and the crew can still walk over.

### Does it need the internet or new aircraft hardware?
No to both:
- Everything runs inside the cabin, on cabin Wi-Fi, on a laptop standing in for the crew tablet.
- Passengers use their own phone, the seatback screen, or the printed picture card in the seat pocket.
- The card works even if the Wi-Fi is down.

### What about certification?
HearMe does not connect to aircraft systems. It runs on passengers' phones and on a crew device, like other cabin apps. Airlines still have their own approval process for crew-device software. We have not done that, and the seatback version would need integration with the IFE vendor. We call this a prototype, not a certified product.

### Privacy?
- Audio is processed in memory and dropped; it is never written to disk.
- Only the meaning travels: need, seat, language and confidence.
- Needs such as "hard of hearing" are shared with the crew only if the passenger agrees.
- The seatback screen stores nothing and clears itself.

This follows the spirit of GDPR, India's DPDP Act and Japan's APPI. It has not been legally reviewed.

### Will crew actually use it?
It is built around their workflow:
- Requests arrive by seat, in Japanese, with urgent medical ones first.
- Most replies are one or two taps. A crew member can also *say* a reply in Japanese, and the closest checked phrase is shown to confirm.
- A dashboard shows open requests, answer time and the oldest wait. A post-flight report can be printed.

### How fast is it?
- Taps reach the crew tablet instantly.
- Spoken requests take about 3–4 s on a laptop CPU with Whisper-small. The AI warms up at start-up, so the first request is not the slowest: 4.4 s, against 6.0 s without warm-up.
- The faster Whisper-base mode takes about 0.8 s but is less accurate.

### What about medical emergencies?
Care Mode lets a passenger mark where it hurts and how much, and pick symptoms and known conditions. The crew get it first, in red, in Japanese and English. One tap captions "Is there a doctor on board?" on every seat, in that seat's language. A handover sheet can be printed for the doctor or ground staff. The medical wording still needs clinical review.

### Only 6 languages?
Six have full screens. Any other language can be added for *understanding* as a data file:
- `npm run add-language -- <code> --draft` drafts it offline, retrains, measures and loads it, all on the laptop.
- Bengali and Tamil are included as examples.
- Even with no data at all, Bengali, Tamil and Tagalog requests show the right picture in the top 3 for 83–92% of typed requests.
- Spoken Bengali and Tamil are still weak (42–50% top-1).

### What does it cost?
See [Cost and business model](../README.md#cost-and-business-model). In short, no new hardware and a per-aircraft subscription; our working assumptions are listed there.

### What is real and what is simulated?
Real:
- offline speech and meaning models;
- the cross-device network;
- microphone capture;
- seat QR → booking lookup;
- the offline phone app.

Simulated or sample:
- the booking data (a sample manifest, no airline system);
- the crew tablet hardware (a laptop);
- the IFE platform.

The translations are drafts that need native review.

### What would you do with 3 months?
1. A pilot on Tokyo–Delhi and Tokyo–Bangkok.
2. Real-voice data with cabin noise, to improve Thai and tune accuracy.
3. Native and clinical review of the wording.
4. Integration with the airline's booking data and the IFE vendor.
