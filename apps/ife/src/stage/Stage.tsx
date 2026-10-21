import {
  WebSocketBus,
  getAnnouncement,
  getNeed,
  getPurpose,
  getReply,
  hubSocketUrl,
  languageInfo,
  languageName,
  type CabinMessage,
  type CrewTabletState,
  type HubEvent,
  type ReplyId,
  type ServerFrame,
} from '@hearme/shared';
import { ArrowLeft, ArrowRight, Cpu, Film, Languages, Megaphone, Mic, Monitor, Play, QrCode, RotateCcw, Smartphone, Square, Volume2, VolumeX, WifiOff, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { hubBaseUrl, useHubStatus } from '../common/hub';
import { CabinNoise } from '../common/sounds';
import { runLiveDemo } from './liveDemo';

/**
 * Demo stage: the passenger and the crew side by side, with what travels
 * between them in the middle. Everything here is real: the phone and the crew
 * console are the actual apps, connected through the cabin hub; the timeline
 * shows the hub's own events (meaning only, never audio).
 */

interface Item {
  id: string;
  at: number;
  dir: 'to-crew' | 'to-passenger' | 'hub';
  title: string;
  detail?: string;
  tone?: 'urgent' | 'ok' | 'info';
}

function describe(m: CabinMessage, state: CrewTabletState | null): Item | null {
  const id = `${m.type}-${'requestId' in m ? m.requestId : 'id' in m ? m.id : ''}-${Date.now()}`;
  switch (m.type) {
    case 'request.create': {
      const need = getNeed(m.needId);
      const purpose = getPurpose(m.purposeId);
      const how = m.source === 'speech' ? 'spoken' : m.source === 'typed' ? 'typed' : 'tapped';
      const pics = m.understanding?.viaPictures ? ', picked from pictures' : '';
      return {
        id,
        at: Date.now(),
        dir: 'to-crew',
        title: `${m.seat} asks: ${need?.label.en ?? m.needId}${purpose ? ` · ${purpose.label.en}` : ''}`,
        detail: `${m.spokenLang ? `${languageName(m.spokenLang)} (language pack)` : languageInfo(m.lang).englishName} · ${how}${pics} · crew sees “${need?.label.ja ?? ''}”`,
        tone: m.medical ? 'urgent' : undefined,
      };
    }
    case 'request.received':
      return { id, at: Date.now(), dir: 'to-passenger', title: `Crew tablet confirmed it received ${m.seat}'s request`, tone: 'ok' };
    case 'request.reply': {
      const req = state?.requests.find((r) => r.requestId === m.requestId);
      const reply = getReply(m.replyId);
      const lang = req?.lang ?? 'en';
      return {
        id,
        at: Date.now(),
        dir: 'to-passenger',
        title: `${m.crewName ?? 'Crew'} replied “${reply.text.ja}”`,
        detail: `${m.seat} sees and hears (${languageInfo(lang).englishName}): “${reply.text[lang]}”`,
        tone: 'ok',
      };
    }
    case 'announcement': {
      const a = getAnnouncement(m.templateId);
      return { id, at: Date.now(), dir: 'to-passenger', title: `Caption to every seat: ${a?.text.en ?? m.templateId}`, detail: 'Each device shows it in its own language', tone: 'info' };
    }
    case 'request.thanks':
      return { id, at: Date.now(), dir: 'to-crew', title: `${m.seat} said thank you ♥`, tone: 'ok' };
    case 'request.cancel':
      return { id, at: Date.now(), dir: 'to-crew', title: `${m.seat} cancelled a request` };
    default:
      return null;
  }
}

function describeEvent(e: HubEvent): Item {
  const lang = languageName(e.lang);
  const target = e.target === 'needs' ? (e.match ? getNeed(e.match)?.label.en : undefined) : e.match ? getReply(e.match as ReplyId).text.en : undefined;
  return {
    id: `ev-${e.at}`,
    at: e.at,
    dir: 'hub',
    title: `Whisper heard (${lang}, ${(e.asrMs / 1000).toFixed(1)} s): “${e.transcript}”`,
    detail: target ? `${e.target === 'needs' ? 'Means' : 'Closest verified reply'}: ${target} · ${Math.round(e.confidence * 100)}% sure${e.confidence < 0.85 && e.target === 'needs' ? ' → asks with pictures' : ''}` : 'No match',
  };
}

export function Stage() {
  const status = useHubStatus(4000);
  const [items, setItems] = useState<Item[]>([]);
  const [passenger, setPassenger] = useState<'phone' | 'bengali' | 'ife'>('phone');
  const [packs, setPacks] = useState<{ code: string; name: string; draft: string }[]>([]);
  const [noiseOn, setNoiseOn] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [showQr, setShowQr] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [caption, setCaption] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const demo = useRef<AbortController | null>(null);
  const noise = useMemo(() => new CabinNoise(), []);
  const crewState = useRef<CrewTabletState | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => () => noise.stop(), [noise]);
  useEffect(() => noise.setVolume(volume), [noise, volume]);

  useEffect(() => {
    if (!status) return;
    const bus = new WebSocketBus(hubSocketUrl(hubBaseUrl()), { role: 'observer' });
    const push = (item: Item | null) => item && setItems((list) => [item, ...list].slice(0, 40));
    const off = bus.onFrame((f: ServerFrame) => {
      if (f.kind === 'crewState') crewState.current = f.state;
      else if (f.kind === 'cabin') push(describe(f.msg, crewState.current));
      else if (f.kind === 'event') push(describeEvent(f.event));
    });
    return () => {
      off();
      bus.close();
    };
    // Reconnect only when the hub appears/disappears, not on every poll.
  }, [!!status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!status) return;
    fetch('/api/languages')
      .then((r) => r.json() as Promise<{ packs: { code: string; name: string; draft: string }[] }>)
      .then((d) => setPacks(d.packs))
      .catch(() => undefined);
  }, [!!status]); // eslint-disable-line react-hooks/exhaustive-deps

  const phoneUrl = status?.urls ? `${status.urls.base}/mobile/?seat=23C` : null;
  const toggleNoise = () => {
    if (noise.playing) {
      noise.stop();
      setNoiseOn(false);
    } else {
      noise.start(volume);
      setNoiseOn(true);
    }
  };
  const reset = () => {
    const bus = new WebSocketBus(hubSocketUrl(hubBaseUrl()), { role: 'crew' });
    const off = bus.onChange((up) => {
      if (!up) return;
      bus.sendFrame({ kind: 'crew', cmd: { type: 'reset' } });
      setTimeout(() => {
        off();
        bus.close();
      }, 200);
    });
    setItems([]);
    setReload((x) => x + 1);
  };

  const liveDemo = async () => {
    if (demo.current) {
      demo.current.abort();
      return;
    }
    const ac = new AbortController();
    demo.current = ac;
    setPassenger('phone');
    setShowQr(false);
    setRunning(true);
    try {
      await runLiveDemo({ caption: setCaption, reset, showQr: () => setShowQr(true), signal: ac.signal });
    } catch (e) {
      setCaption(ac.signal.aborted ? null : `Live demo paused: ${(e as Error).message}. Carry on by hand, or play the recorded demo.`);
    } finally {
      demo.current = null;
      setRunning(false);
    }
  };

  const fast = !!status?.asr.model.endsWith('base');
  const switchSpeech = () => fetch(`/api/asr?size=${fast ? 'small' : 'base'}`, { method: 'POST' }).catch(() => undefined);

  if (status === null) {
    return (
      <div className="stage stage--nohub">
        <div className="stage-nohub">
          <WifiOff aria-hidden />
          <h1>The demo stage needs the cabin hub</h1>
          <p>Start everything with one command from the project folder:</p>
          <pre>npm run demo</pre>
          <p>
            Then open <code>http://localhost:8080/#/stage</code>. Without the hub you can still try the <a href="#/mobile">phone app</a> and <a href="#/ife">seatback screen</a> with a simulated crew.
          </p>
          <p>
            <a href="/demo.mp4" target="_blank" rel="noreferrer">
              Watch the recorded demo
            </a>{' '}
            (75 s, works offline).
          </p>
        </div>
      </div>
    );
  }

  const ready = (s?: string) => s === 'ready';
  return (
    <div className="stage">
      <header className="stage-top">
        <a className="stage-brand" href="#/">
          Hear<span>Me</span>
        </a>
        <span className="stage-title">Live demo · seat 23C ↔ cabin crew</span>
        <div className="stage-chips">
          <button
            className={`stage-chip${ready(status?.asr.state) ? ' ok' : ''}`}
            title={`${status?.asr.model ?? ''} · click to switch between accurate (small) and fast (base)`}
            onClick={switchSpeech}
            disabled={status?.asr.state === 'loading'}
          >
            {fast ? <Zap aria-hidden /> : <Mic aria-hidden />} Whisper {fast ? 'base (fast)' : 'small'} {status?.asr.state ?? '…'}
          </button>
          <span className={`stage-chip${ready(status?.embed.state) ? ' ok' : ''}`} title={status?.embed.model}>
            <Cpu aria-hidden /> e5 matching {status?.embed.state ?? '…'}
          </span>
          <span className="stage-chip ok">
            <WifiOff aria-hidden /> no internet needed
          </span>
          <span className="stage-chip ok" title={packs.map((p) => `${p.name}: understood through a language pack (${p.draft} draft), screens in English`).join('\n') || 'Add one: npm run add-language -w @hearme/hub -- <code> --draft'}>
            <Languages aria-hidden /> 6 languages{packs.length ? ` + ${packs.map((p) => p.name).join(', ')}` : ''}
          </span>
        </div>
        <div className="stage-actions">
          <div className="stage-seg" role="group" aria-label="Passenger device">
            <button className={passenger === 'phone' ? 'on' : ''} onClick={() => setPassenger('phone')}>
              <Smartphone aria-hidden /> Phone
            </button>
            <button className={passenger === 'bengali' ? 'on' : ''} onClick={() => setPassenger('bengali')} title="Rahim, seat 22B, speaks Bengali (language pack)">
              <Smartphone aria-hidden /> Bengali
            </button>
            <button className={passenger === 'ife' ? 'on' : ''} onClick={() => setPassenger('ife')}>
              <Monitor aria-hidden /> Seatback
            </button>
          </div>
          <div className={`stage-noise${noiseOn ? ' on' : ''}`}>
            <button onClick={toggleNoise} aria-pressed={noiseOn}>
              {noiseOn ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />} Cabin noise
            </button>
            <input type="range" min={0.05} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Cabin noise volume" />
          </div>
          <button className="stage-btn" onClick={() => setShowQr(!showQr)} aria-expanded={showQr}>
            <QrCode aria-hidden /> Try on your phone
          </button>
          <button className="stage-btn" onClick={liveDemo} disabled={!ready(status?.asr.state)} title="Runs the whole story live in the real apps, with captions">
            {running ? <Square aria-hidden /> : <Play aria-hidden />} {running ? 'Stop demo' : 'Live demo'}
          </button>
          <button className="stage-btn ghost" onClick={() => setShowVideo(true)} title="Recorded run of this demo, for when the room's Wi-Fi fails">
            <Film aria-hidden /> Recorded demo
          </button>
          <button className="stage-btn ghost" onClick={reset} title="Clear requests and reload both sides">
            <RotateCcw aria-hidden /> Reset
          </button>
        </div>
      </header>

      {showQr && phoneUrl && (
        <div className="stage-qr" role="dialog" aria-label="Open on your phone">
          <img src={`/api/qr.svg?size=240&data=${encodeURIComponent(phoneUrl)}`} alt="QR code to open HearMe as seat 23C" width={240} height={240} />
          <div>
            <b>Scan with your phone camera</b>
            <p>Same Wi-Fi as this laptop. You become seat 23C.</p>
            <code>{phoneUrl}</code>
            <p className="stage-qr__note">
              First time on this phone: open <code>{status?.urls?.lan[0] ? `http://${status.urls.lan[0]}:8080/trust` : '/trust'}</code> to install the cabin certificate (or choose Advanced → Continue at the warning). The microphone needs HTTPS.
            </p>
          </div>
        </div>
      )}

      {showVideo && (
        <div className="stage-video" role="dialog" aria-label="Recorded demo" onClick={() => setShowVideo(false)}>
          <video src="/demo.mp4" controls autoPlay onClick={(e) => e.stopPropagation()} />
          <button className="stage-video__close" onClick={() => setShowVideo(false)} aria-label="Close">
            <X aria-hidden />
          </button>
        </div>
      )}

      {caption && (
        <div className="stage-caption" role="status">
          {caption}
        </div>
      )}

      <main className="stage-main">
        <section className={`stage-device stage-device--${passenger === 'ife' ? 'ife' : 'phone'}`} aria-label="Passenger">
          <div className="stage-label">
            <Smartphone aria-hidden /> {passenger === 'bengali' ? 'Passenger · Rahim, seat 22B · speaks Bengali (language pack)' : 'Passenger · Sharda, seat 23C'}
          </div>
          {passenger !== 'ife' ? (
            <div className="stage-phone">
              <iframe key={`p${reload}${passenger}`} title="Passenger phone" src={`/mobile/?seat=${passenger === 'bengali' ? '22B' : '23C'}&stage=1`} allow="microphone; autoplay" />
            </div>
          ) : (
            <div className="stage-ife">
              <iframe key={`i${reload}`} title="Seatback screen" src="/?seat=23C#/ife" allow="autoplay" />
            </div>
          )}
        </section>

        <section className="stage-flow" aria-label="What travels between them" aria-live="polite">
          <div className="stage-label center">On the cabin network</div>
          {items.length === 0 && (
            <div className="stage-empty">
              <p>
                Tap a picture or hold the microphone on the phone.
                <br />
                Every message between the passenger and the crew appears here.
              </p>
              <p className="stage-empty__tip">
                Tip: switch on <b>Cabin noise</b> and speak to the phone. Whisper runs on this laptop, offline.
              </p>
            </div>
          )}
          <ol className="stage-items">
            {items.map((it) => (
              <li key={it.id} className={`stage-item ${it.dir}${it.tone ? ` ${it.tone}` : ''}`}>
                <span className="stage-item__dir" aria-hidden>
                  {it.dir === 'to-crew' ? <ArrowRight /> : it.dir === 'to-passenger' ? <ArrowLeft /> : it.tone === 'info' ? <Megaphone /> : <Cpu />}
                </span>
                <div>
                  <b>{it.title}</b>
                  {it.detail && <span>{it.detail}</span>}
                </div>
                <time>{new Date(it.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
              </li>
            ))}
          </ol>
        </section>

        <section className="stage-device stage-device--crew" aria-label="Cabin crew">
          <div className="stage-label">
            <Cpu aria-hidden /> Cabin crew · Aoi's tablet
          </div>
          <div className="stage-crew">
            <iframe key={`c${reload}`} title="Crew console" src="/?embed=1#/crew" allow="microphone; autoplay" />
          </div>
        </section>
      </main>
    </div>
  );
}
