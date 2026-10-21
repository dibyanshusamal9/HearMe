import { CONFIDENCE_THRESHOLD, LANGUAGES, getNeed, type LangCode } from '@hearme/shared';
import { MicRecorder, MicUnavailableError, recordAndUnderstand } from '@hearme/shared/web';
import { Check, Mic, Square, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NeedIcon } from '../common/Icon';
import { hubBaseUrl, useHubStatus } from '../common/hub';
import { CabinNoise } from '../common/sounds';

/**
 * Voice lab: real people say requests, the hub's Whisper and matcher
 * understand them, and each result is logged on the hub (text only, never
 * audio) so `npm run voicelab -w @hearme/hub` can report real-voice accuracy
 * next to the synthetic-voice numbers. Cabin noise can play from the laptop
 * while people speak.
 */

const PROMPTS = ['water', 'hot_water', 'tea', 'blanket', 'meal', 'toilet', 'medicine', 'unwell', 'too_cold', 'sick_bag', 'charger', 'wheelchair_arrival'];

interface Result {
  expected: string;
  transcript: string;
  got: string | null;
  top3: string[];
  confidence: number;
  asrMs: number;
}

const builtIn = LANGUAGES.map((l) => ({ code: l.code as string, name: l.englishName }));
const shuffled = () => [...PROMPTS].sort(() => Math.random() - 0.5);
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—');

export function VoiceLab() {
  const status = useHubStatus(5000);
  const [langs, setLangs] = useState(builtIn);
  const [lang, setLang] = useState('hi');
  const [speakerLabel, setSpeakerLabel] = useState('');
  const [order, setOrder] = useState(shuffled);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'working'>('idle');
  const [db, setDb] = useState(0);
  const [log, setLog] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [noiseOn, setNoiseOn] = useState(false);
  const recorder = useMemo(() => new MicRecorder(), []);
  const noise = useMemo(() => new CabinNoise(), []);
  useEffect(() => () => noise.stop(), [noise]);
  useEffect(() => {
    fetch('/api/languages')
      .then((r) => r.json() as Promise<{ packs: { code: string; name: string; speech: boolean }[] }>)
      .then((d) => setLangs([...builtIn, ...d.packs.filter((p) => p.speech).map((p) => ({ code: p.code, name: `${p.name} (language pack)` }))]))
      .catch(() => undefined);
  }, []);

  const expected = order[i % order.length]!;
  const need = getNeed(expected)!;
  const isBuiltIn = LANGUAGES.some((l) => l.code === lang);
  const last = log[0];

  const toggle = async () => {
    setError(null);
    if (phase === 'idle') {
      try {
        await recorder.start(setDb);
        setPhase('recording');
      } catch (e) {
        setError(e instanceof MicUnavailableError ? 'No microphone: allow it in the browser (needs localhost or HTTPS).' : String(e));
      }
      return;
    }
    if (phase !== 'recording') return;
    setPhase('working');
    try {
      const r = await recordAndUnderstand(recorder, hubBaseUrl(), lang, 'needs');
      const result: Result = {
        expected,
        transcript: r.transcript,
        got: r.match?.candidates[0]?.needId ?? null,
        top3: (r.match?.candidates ?? []).slice(0, 3).map((c) => c.needId),
        confidence: r.match?.confidence ?? 0,
        asrMs: r.asrMs,
      };
      setLog((l) => [result, ...l]);
      await fetch('/api/voicelab', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...result, lang, noise: noiseOn, speaker: speakerLabel.trim() || undefined }),
      }).catch(() => undefined);
      setI((x) => x + 1);
    } catch (e) {
      setError(String(e));
    }
    setPhase('idle');
  };

  const sent = log.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD);
  return (
    <div className="vlab">
      <header className="vlab-top">
        <a className="stage-brand" href="#/">
          Hear<span>Me</span>
        </a>
        <span className="stage-title">Voice lab · real voices, real numbers</span>
        <span className={`stage-chip${status?.asr.state === 'ready' ? ' ok' : ''}`}>Whisper {status?.asr.state ?? 'offline'}</span>
      </header>

      <div className="vlab-body">
        <section className="vlab-panel">
          <label>
            Language
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {langs.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Speaker (initials only)
            <input value={speakerLabel} maxLength={8} onChange={(e) => setSpeakerLabel(e.target.value)} placeholder="e.g. NB" />
          </label>
          <button
            className={`stage-btn ghost${noiseOn ? ' on' : ''}`}
            aria-pressed={noiseOn}
            onClick={() => {
              if (noise.playing) noise.stop();
              else noise.start(0.6);
              setNoiseOn(noise.playing);
            }}
          >
            {noiseOn ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />} Cabin noise from this laptop
          </button>
          <p className="vlab-fine">Only the text Whisper heard is saved on this laptop, never the audio.</p>
        </section>

        <section className="vlab-card" aria-live="polite">
          <p className="vlab-ask">Ask for this, in your own words:</p>
          <div className="vlab-need">
            <NeedIcon name={need.icon} size={72} />
            <div>
              <b>{isBuiltIn ? need.label[lang as LangCode] : need.label.en}</b>
              {isBuiltIn && lang !== 'en' && <span>{need.label.en}</span>}
            </div>
          </div>
          <button className={`vlab-mic ${phase}`} onClick={toggle} disabled={phase === 'working' || !status}>
            {phase === 'recording' ? <Square aria-hidden /> : <Mic aria-hidden />}
            {phase === 'idle' ? 'Tap and speak' : phase === 'recording' ? `Listening… ${Math.round(db)} dB · tap to stop` : 'Understanding…'}
          </button>
          {error && <p className="vlab-error">{error}</p>}
          {last && (
            <div className={`vlab-result ${last.got === last.expected ? 'ok' : 'bad'}`}>
              {last.got === last.expected ? <Check aria-hidden /> : <X aria-hidden />}
              <div>
                <q>{last.transcript || '(nothing heard)'}</q>
                <span>
                  → {last.got ? getNeed(last.got)?.label.en : 'no match'} · {Math.round(last.confidence * 100)}% ·{' '}
                  {last.confidence >= CONFIDENCE_THRESHOLD ? 'would send' : 'would ask with pictures'} · {(last.asrMs / 1000).toFixed(1)} s
                </span>
              </div>
            </div>
          )}
          <button className="stage-btn ghost" onClick={() => (setOrder(shuffled()), setI(0))}>
            New order
          </button>
        </section>

        <section className="vlab-panel">
          <h2>This session</h2>
          <dl className="vlab-tally">
            <dt>Requests</dt>
            <dd>{log.length}</dd>
            <dt>Right first</dt>
            <dd>{pct(log.filter((r) => r.got === r.expected).length, log.length)}</dd>
            <dt>Right in top 3</dt>
            <dd>{pct(log.filter((r) => r.top3.includes(r.expected)).length, log.length)}</dd>
            <dt>Sent wrong</dt>
            <dd>{pct(sent.filter((r) => r.got !== r.expected).length, log.length)}</dd>
          </dl>
          <p className="vlab-fine">
            All sessions: <code>npm run voicelab -w @hearme/hub</code>
          </p>
        </section>
      </div>
    </div>
  );
}
