import { JalBrand } from '../common/JalBrand';
import { Film, FlaskConical, Info, Monitor, Printer, QrCode, Smartphone, Tablet, Theater, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useHubStatus } from '../common/hub';
import { themeVars } from '../common/theme';

/** Start page: the demo stage first, then each piece on its own. */
export function Launcher() {
  const status = useHubStatus(5000);
  const [about, setAbout] = useState(false);
  const hub = !!status;
  const phoneUrl = status?.urls ? (status.urls.join ?? `${status.urls.base}/mobile/?seat=23C`) : null;
  return (
    <div className="home" style={themeVars(false)}>
      <section className="home-hero">
        <img src="/img/cabin-aisle.jpg" alt="" className="home-hero__img" />
        <div className="home-hero__shade" />
        <div className="home-hero__text">
          <div className="home-brand">
            <JalBrand />
          </div>
          <h1>Helping passengers and cabin crew understand each other.</h1>
          <p>In any language. In a noisy cabin. Even with no internet.</p>
          <span className={`home-status${hub ? ' ok' : ''}`}>
            {status === undefined ? 'Looking for the cabin hub…' : hub ? `Cabin hub online · speech AI ${status.asr.state} · ${status.clients ?? 0} devices` : 'No cabin hub: simulated crew in this browser'}
          </span>
        </div>
      </section>

      <nav className="home-cards" aria-label="Open a part of HearMe">
        <a className={`home-card primary${hub ? '' : ' disabled'}`} href={hub ? '#/stage' : undefined} aria-disabled={!hub}>
          <Theater aria-hidden />
          <strong>Demo stage</strong>
          <span>Passenger and crew side by side, with everything that travels between them. Start here.</span>
          {!hub && <em>Needs the hub: run “npm run demo”</em>}
        </a>
        <a className="home-card" href="#/mobile">
          <Smartphone aria-hidden />
          <strong>Passenger phone</strong>
          <span>Opens from the seat QR code. Tap a picture, speak your language, or type.</span>
        </a>
        <a className="home-card" href="?seat=23C#/ife">
          <Monitor aria-hidden />
          <strong>Seatback screen</strong>
          <span>The same help on the in-seat screen. No phone needed; clears itself after use.</span>
        </a>
        <a className="home-card" href="#/crew" target="_blank" rel="noreferrer">
          <Tablet aria-hidden />
          <strong>Crew console</strong>
          <span>Requests by seat in Japanese, live numbers, one-tap or spoken replies.</span>
          {!hub && <em>Without the hub: while it is open, the phone and seatback tabs in this browser send to it</em>}
        </a>
      </nav>

      <section className="home-extra">
        {phoneUrl && <PhoneQr url={phoneUrl} />}
        <a className="home-link" href="/seats" target="_blank" rel="noreferrer">
          <Printer aria-hidden /> Printable seat cards (QR + picture card)
        </a>
        <a className="home-link" href="/demo.mp4" target="_blank" rel="noreferrer">
          <Film aria-hidden /> Recorded demo (75 s)
        </a>
        <a className="home-link" href="#/lab">
          <FlaskConical aria-hidden /> Voice lab: test with real voices
        </a>
        <button className="home-link" onClick={() => setAbout(true)}>
          <Info aria-hidden /> About this prototype
        </button>
      </section>

      {about && (
        <div className="home-about" role="dialog" aria-label="About this prototype">
          <button className="home-about__close" onClick={() => setAbout(false)} aria-label="Close">
            <X aria-hidden />
          </button>
          <h2>About this prototype</h2>
          <p>
            HearMe runs entirely on the cabin network. The <b>cabin hub</b> (here: this laptop, on board: a crew tablet) runs offline speech recognition (Whisper), meaning-based matching
            (multilingual-e5) and the shared request list. Phones and seatback screens connect over Wi-Fi; nothing uses the internet.
          </p>
          <p>
            Not integrated with or certified for any aircraft, seatback or airline system. Booking data comes from a sample passenger list. Translations are drafts that need native-speaker and airline
            review; safety texts are fixed templates, never machine-translated.
          </p>
          {!hub && (
            <p className="home-about__warn">
              <WifiOff aria-hidden /> No hub is running. The phone and seatback answer with a simulated crew, labelled <i>Demo crew</i>, until you open the crew console in
              another tab of this browser; then their requests go to it. Run <code>npm run demo</code> for the real thing.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PhoneQr({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="home-qr">
      <button className="home-link" onClick={() => setOpen(!open)} aria-expanded={open}>
        <QrCode aria-hidden /> Try it on your own phone
      </button>
      {open && (
        <div className="home-qr__panel">
          <img src={`/api/qr.svg?size=200&data=${encodeURIComponent(url)}`} width={200} height={200} alt="QR code for the passenger app, seat 23C" />
          <p>
            Same Wi-Fi as this laptop. <code>{url}</code>
          </p>
        </div>
      )}
    </div>
  );
}

/** The Expo app's web export, shown inside a phone frame. */
export function MobilePreview() {
  const [state, setState] = useState<'checking' | 'ok' | 'missing'>('checking');
  const seat = new URLSearchParams(window.location.search).get('seat') ?? '';
  const src = import.meta.env.VITE_MOBILE_URL ?? `${import.meta.env.BASE_URL}mobile/index.html${seat ? `?seat=${encodeURIComponent(seat)}` : ''}`;
  useEffect(() => {
    if (import.meta.env.VITE_MOBILE_URL) return setState('ok');
    fetch(`${import.meta.env.BASE_URL}mobile/index.html`, { method: 'GET' })
      .then((r) => r.text().then((body) => setState(r.ok && body.includes('<div id="root"') ? 'ok' : 'missing')))
      .catch(() => setState('missing'));
  }, []);
  return (
    <div className="mobile-stage" style={themeVars(false)}>
      <a className="mobile-stage__back" href="#/">
        ← HearMe
      </a>
      {state === 'ok' && (
        <div className="phone">
          <iframe title="HearMe mobile app" src={src} className="phone__screen" allow="microphone; autoplay" />
        </div>
      )}
      {state === 'missing' && (
        <div className="mobile-stage__missing" role="alert">
          <h1>The phone app has not been built yet</h1>
          <p>From the project folder, run:</p>
          <pre>npm run demo</pre>
          <p>
            Or run the Expo app directly: <code>npm run mobile</code> (scan the QR code with Expo Go) or <code>npm run mobile:web</code>.
          </p>
        </div>
      )}
      {state === 'checking' && <p>Loading…</p>}
    </div>
  );
}

