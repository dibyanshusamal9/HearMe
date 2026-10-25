import { LANGUAGES, getNeed, getReply, languageName, readUnderstandStream, type ReplyId, type UnderstandProgress, type UnderstandResult } from '@hearme/shared';
import {
  LAB_MICS,
  LAB_MODES,
  LAB_OUTCOMES,
  LAB_PLACES,
  OUTCOME_LABEL,
  fmtRate,
  fmtSeconds,
  isBuiltInLang,
  labItemLabel,
  labLanguage,
  labPrompts,
  labTakeQuery,
  pct,
  summarizeBy,
  summarizeTakes,
  type LabMic,
  type LabMode,
  type LabPlace,
  type LabPrompt,
  type LabSpeaker,
  type LabTake,
} from '@hearme/shared/lab';
import { MicRecorder, MicUnavailableError } from '@hearme/shared/web';
import { ArrowRight, Download, FlaskConical, Mic, RotateCcw, Square, Star, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NeedIcon } from '../common/Icon';
import { JalBrand } from '../common/JalBrand';
import { hubBaseUrl, useHubStatus } from '../common/hub';
import { CabinNoise } from '../common/sounds';

/**
 * Voice lab (#/lab): a teammate speaks into a real microphone, the hub runs
 * the same pipeline as a passenger's phone (Whisper, then matching) and logs
 * what would have appeared on screen, so we can quote real-voice numbers.
 * Results stay on the hub laptop (apps/hub/.lab); `npm run lab-report` turns
 * them into docs/voice-lab.md.
 */

interface Setup {
  tester: string;
  speaker: LabSpeaker;
  /** One of the 6 languages, or a language pack's code (own words only). */
  lang: string;
  firstLanguage: boolean;
  place: LabPlace;
  mic: LabMic;
  mode: LabMode;
  keepAudio: boolean;
}

type Phase = 'setup' | 'ready' | 'listening' | 'thinking' | 'result' | 'done';
type GroupBy = 'lang' | 'place' | 'mic' | 'mode' | 'speaker' | 'tester';

const DEFAULT_SETUP: Setup = { tester: '', speaker: 'passenger', lang: 'hi', firstLanguage: true, place: 'quiet', mic: 'laptop', mode: 'read', keepAudio: false };
const SETUP_KEY = 'hearme.lab.setup';
const HOLD_MS = 500;

function loadSetup(): Setup {
  try {
    return { ...DEFAULT_SETUP, ...(JSON.parse(localStorage.getItem(SETUP_KEY) ?? '{}') as Partial<Setup>) };
  } catch {
    return DEFAULT_SETUP;
  }
}

function saveSetup(s: Setup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(s));
  } catch {
    /* private window: the form just starts empty next time */
  }
}

const shuffled = <T,>(items: T[]): T[] => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/** A language pack the hub can hear (Bengali, Tamil…): understood, no screens yet. */
type Pack = { code: string; name: string };

const bcp47Of = (code: string) => LANGUAGES.find((l) => l.code === code)?.bcp47 ?? code;
const nativeNameOf = (code: string, packs: Pack[]) => LANGUAGES.find((l) => l.code === code)?.nativeName ?? packs.find((p) => p.code === code)?.name ?? languageName(code);
/** English name, with a pack's own name first ("Bengali", where browsers may say "Bangla"). */
const nameOf = (code: string, packs: Pack[]) => packs.find((p) => p.code === code)?.name ?? languageName(code);
/** Language packs have no sentences to read yet. */
const modeFor = (setup: Setup): LabMode => (isBuiltInLang(setup.lang) || setup.speaker === 'crew' ? setup.mode : 'own-words');

const newSession = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function micError(e: unknown): string {
  if (e instanceof MicUnavailableError) {
    if (e.reason === 'insecure') return 'The microphone needs HTTPS or localhost. On the hub laptop open http://localhost:8080/#/lab; on a phone, the hub’s https:// address.';
    if (e.reason === 'denied') return 'Microphone permission was refused. Allow it in the browser’s site settings, then try again.';
  }
  return 'This browser cannot record audio.';
}

function progressText(p: { p: UnderstandProgress; since: number } | null): string {
  if (!p) return 'Sending…';
  const s = p.p;
  if (s.stage === 'queued') return `Waiting: ${s.ahead} ahead of you…`;
  if (s.stage === 'transcribing') {
    const left = Math.max(0, Math.ceil((s.estimateMs - (Date.now() - p.since)) / 1000));
    return left > 0 ? `Whisper is listening… about ${left} s` : 'Whisper is listening… almost done';
  }
  if (s.stage === 'matching') return `Heard “${s.transcript}”, matching…`;
  return 'Sending…';
}

const GROUPS: Record<GroupBy, { label: string; key: (t: LabTake, packs: Pack[]) => string }> = {
  lang: { label: 'Language', key: (t, packs) => `${nameOf(t.lang, packs)}${t.speaker === 'crew' ? ' (crew)' : ''}` },
  place: { label: 'Place', key: (t) => LAB_PLACES[t.place] },
  mic: { label: 'Microphone', key: (t) => LAB_MICS[t.mic] },
  mode: { label: 'Task', key: (t) => LAB_MODES[t.mode] },
  speaker: { label: 'Speaker', key: (t) => (t.speaker === 'crew' ? 'Crew (Japanese)' : 'Passenger') },
  tester: { label: 'Person', key: (t) => t.tester || '(no name)' },
};

export function VoiceLab() {
  const status = useHubStatus(4000);
  const [setup, setSetupState] = useState<Setup>(loadSetup);
  const [phase, setPhaseState] = useState<Phase>('setup');
  const phaseRef = useRef<Phase>('setup');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [session, setSession] = useState(newSession);
  const [prompts, setPrompts] = useState<LabPrompt[]>([]);
  const [index, setIndex] = useState(0);
  const [level, setLevel] = useState(0);
  const [progress, setProgress] = useState<{ p: UnderstandProgress; since: number } | null>(null);
  const [last, setLast] = useState<{ take: LabTake; waitedMs: number; pcm: Uint8Array; discarded?: boolean; story?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [takes, setTakes] = useState<LabTake[]>([]);
  const [storyCanSave, setStoryCanSave] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);
  const [view, setView] = useState<'session' | 'all'>('session');
  const [groupBy, setGroupBy] = useState<GroupBy>('lang');
  const [noiseOn, setNoiseOn] = useState(false);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [, redraw] = useState(0);
  const rec = useRef(new MicRecorder());
  const noise = useRef(new CabinNoise());
  const pressedAt = useRef(0);

  const setSetup = (patch: Partial<Setup>) =>
    setSetupState((s) => {
      const next = { ...s, ...patch };
      saveSetup(next);
      return next;
    });
  const lang = labLanguage(setup.speaker, setup.lang);
  const prompt = prompts[index] ?? null;
  const ready = status?.asr.state === 'ready' || status?.asr.state === 'warming';
  // The microphone's 15 s auto-stop calls back later: it must log against the prompt shown then.
  const live = useRef({ prompt, session, setup, lang });
  live.current = { prompt, session, setup, lang };

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${hubBaseUrl()}/api/lab/takes`, { cache: 'no-store' });
      if (res.status === 403) return setClosed(((await res.json()) as { error: string }).error);
      if (!res.ok) return;
      const body = (await res.json()) as { takes: LabTake[]; storyCanSave: boolean };
      setClosed(null);
      setTakes(body.takes);
      setStoryCanSave(body.storyCanSave);
    } catch {
      /* hub offline: the status chip says so */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    let alive = true;
    fetch(`${hubBaseUrl()}/api/languages`)
      .then((r) => r.json() as Promise<{ packs: (Pack & { speech: boolean })[] }>)
      .then((d) => {
        if (!alive) return;
        const heard = d.packs.filter((p) => p.speech);
        setPacks(heard);
        // A language pack chosen last time that this hub no longer has.
        setSetupState((s) => (isBuiltInLang(s.lang) || heard.some((p) => p.code === s.lang) ? s : { ...s, lang: 'hi' }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const r = rec.current;
    const n = noise.current;
    return () => {
      r.cancel();
      n.stop();
    };
  }, []);
  useEffect(() => {
    if (phase !== 'thinking') return;
    const t = setInterval(() => redraw((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [phase]);

  const start = () => {
    setSession(newSession());
    setPrompts(shuffled(labPrompts(setup.speaker, modeFor(setup), lang)));
    setIndex(0);
    setLast(null);
    setError(null);
    setPhase('ready');
  };

  const another = () => {
    setPrompts(shuffled(labPrompts(setup.speaker, modeFor(setup), lang)));
    setIndex(0);
    setLast(null);
    setPhase('ready');
  };

  const next = () => {
    setLast(null);
    setError(null);
    if (index + 1 >= prompts.length) setPhase('done');
    else {
      setIndex(index + 1);
      setPhase('ready');
    }
  };

  const listen = async () => {
    if (phaseRef.current === 'result') next();
    if (phaseRef.current !== 'ready' && phaseRef.current !== 'result') return;
    setError(null);
    setLast(null);
    pressedAt.current = Date.now();
    setPhase('listening');
    try {
      await rec.current.start(setLevel, () => void finish());
    } catch (e) {
      setPhase('ready');
      setError(micError(e));
    }
  };

  const finish = async () => {
    const { prompt, session, setup, lang } = live.current;
    if (phaseRef.current !== 'listening' || !prompt) return;
    const { pcm, seconds } = rec.current.stop();
    setLevel(0);
    if (seconds < 0.4) {
      setPhase('ready');
      setError('Too short: hold the button (or Space) while you speak, or tap once to start and again to stop.');
      return;
    }
    setPhase('thinking');
    setProgress(null);
    const t0 = Date.now();
    const info = { session, tester: setup.tester.trim(), speaker: setup.speaker, lang, firstLanguage: setup.firstLanguage, place: setup.place, mic: setup.mic, mode: modeFor(setup), expected: prompt.expected, prompt: prompt.text, keepAudio: setup.keepAudio };
    try {
      const res = await fetch(`${hubBaseUrl()}/api/lab/take?${labTakeQuery(info)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/L16;rate=16000;channels=1', Accept: 'application/x-ndjson, application/json' },
        body: pcm as BodyInit,
      });
      if (!res.ok) {
        const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `hub ${res.status}`;
        if (res.status === 403) setClosed(msg);
        throw new Error(msg);
      }
      const result = (await readUnderstandStream(res, (p) => setProgress({ p, since: Date.now() }))) as UnderstandResult & { take: LabTake };
      setLast({ take: result.take, waitedMs: Date.now() - t0, pcm });
      setPhase('result');
      void refresh();
    } catch (e) {
      setPhase('ready');
      setError(`Not logged: ${e instanceof Error ? e.message : 'the hub did not answer'}. Try again.`);
    }
  };

  const discard = async (id: string) => {
    await fetch(`${hubBaseUrl()}/api/lab/takes/${encodeURIComponent(id)}/discard`, { method: 'POST' }).catch(() => undefined);
    if (last?.take.id === id) setLast({ ...last, discarded: true });
    void refresh();
  };

  const useForStory = async () => {
    if (!last) return;
    const res = await fetch(`${hubBaseUrl()}/api/story/voice?lang=${last.take.lang}`, { method: 'POST', headers: { 'Content-Type': 'audio/L16;rate=16000;channels=1' }, body: last.pcm as BodyInit }).catch(() => null);
    setLast({ ...last, story: res?.ok ? 'Saved: “Run the story” on the stage now plays this recording.' : 'Could not save it (only from the hub laptop).' });
  };

  // Press and hold to talk; a quick tap keeps listening until the next tap.
  const down = () => {
    if (phaseRef.current === 'listening') void finish();
    else void listen();
  };
  const up = () => {
    if (phaseRef.current === 'listening' && Date.now() - pressedAt.current >= HOLD_MS) void finish();
  };

  // Space works the same way from anywhere on the page (not while typing in the form).
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName);
    const kd = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || typing(e.target) || !['ready', 'listening', 'result'].includes(phaseRef.current)) return;
      e.preventDefault();
      down();
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e.target)) return;
      e.preventDefault();
      up();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  });

  const toggleNoise = () => {
    if (noise.current.playing) noise.current.stop();
    else noise.current.start(0.5);
    setNoiseOn(noise.current.playing);
  };

  const shown = view === 'session' ? takes.filter((t) => t.session === session) : takes;

  return (
    <div className="lab">
      <header className="lab-top">
        <a className="stage-brand lab-brand" href="#/">
          <JalBrand />
        </a>
        <span className="lab-title">
          <FlaskConical aria-hidden /> Voice lab
        </span>
        <HubChip status={status} />
      </header>

      <main className="lab-main">
        <section className="lab-work" aria-label="Recording">
          {closed && <p className="lab-note warn">{closed}</p>}
          {phase === 'setup' ? (
            <SetupForm setup={setup} setSetup={setSetup} lang={lang} packs={packs} onStart={start} canStart={!!status && !closed} />
          ) : (
            <>
              <div className="lab-run-head">
                <span>
                  {setup.speaker === 'crew' ? 'Crew · 日本語' : nativeNameOf(lang, packs)} · {LAB_PLACES[setup.place]} · {LAB_MICS[setup.mic]} · {LAB_MODES[modeFor(setup)]}
                </span>
                <button className="lab-link" onClick={() => setPhase('setup')} disabled={phase === 'listening' || phase === 'thinking'}>
                  Change setup
                </button>
              </div>
              {setup.place === 'cabin-noise' && (
                <div className="lab-noise">
                  <button className={`lab-btn ghost${noiseOn ? ' on' : ''}`} onClick={toggleNoise} aria-pressed={noiseOn}>
                    {noiseOn ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />} {noiseOn ? 'Stop cabin noise' : 'Play cabin noise'}
                  </button>
                  <small>Recording with this laptop’s mic? Play the noise from another device instead: the browser’s echo cancellation removes sound played by this page.</small>
                </div>
              )}
              {phase === 'done' ? (
                <div className="lab-card lab-done">
                  <b>Round done: thank you!</b>
                  <p>
                    {prompts.length} prompts. Every take is logged on the hub laptop. Another round uses a new order; change the setup to try another place or microphone.
                  </p>
                  <div className="lab-actions">
                    <button className="lab-btn" onClick={another}>
                      <RotateCcw aria-hidden /> Another round
                    </button>
                    <button className="lab-btn ghost" onClick={() => setPhase('setup')}>
                      Change setup
                    </button>
                  </div>
                </div>
              ) : (
                prompt && (
                  <>
                    <div className="lab-progress" aria-label={`Prompt ${index + 1} of ${prompts.length}`}>
                      <span style={{ width: `${(100 * index) / prompts.length}%` }} />
                    </div>
                    <PromptCard prompt={prompt} speaker={setup.speaker} lang={lang} langName={nameOf(lang, packs)} n={index + 1} of={prompts.length} />
                    <div className="lab-rec">
                      <button
                        className={`lab-mic${phase === 'listening' ? ' on' : ''}`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          down();
                        }}
                        onPointerUp={up}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
                            e.preventDefault();
                            down();
                          }
                        }}
                        onKeyUp={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') up();
                        }}
                        disabled={phase === 'thinking' || !ready}
                        aria-pressed={phase === 'listening'}
                      >
                        {phase === 'listening' ? <Square aria-hidden /> : <Mic aria-hidden />}
                        {phase === 'listening' ? 'Listening… release (or tap) when done' : phase === 'thinking' ? progressText(progress) : phase === 'result' ? 'Hold to record the next one' : 'Hold to talk (or Space)'}
                      </button>
                      {phase === 'listening' && (
                        <div className="lab-level" aria-hidden>
                          <span style={{ width: `${Math.max(0, Math.min(100, ((level - 40) / 50) * 100))}%` }} />
                        </div>
                      )}
                      {!ready && status && <small>The speech model is {status.asr.state}; recording starts when it is ready.</small>}
                    </div>
                    {error && (
                      <p className="lab-note warn" role="alert">
                        {error}
                      </p>
                    )}
                    {last && (
                      <ResultCard
                        last={last}
                        speaker={setup.speaker}
                        story={!!prompt.story && storyCanSave}
                        onNext={next}
                        onAgain={() => {
                          setLast(null);
                          setPhase('ready');
                        }}
                        onDiscard={() => void discard(last.take.id)}
                        onStory={() => void useForStory()}
                      />
                    )}
                    {phase === 'ready' && !last && (
                      <button className="lab-link" onClick={next}>
                        Skip this one
                      </button>
                    )}
                  </>
                )
              )}
            </>
          )}
        </section>

        <section className="lab-results" aria-label="Results">
          <div className="lab-results__head">
            <div className="lab-seg" role="group" aria-label="Which takes">
              <button className={view === 'session' ? 'on' : ''} onClick={() => setView('session')} aria-pressed={view === 'session'}>
                This sitting
              </button>
              <button className={view === 'all' ? 'on' : ''} onClick={() => setView('all')} aria-pressed={view === 'all'}>
                Everyone ({takes.length})
              </button>
            </div>
            <label>
              By{' '}
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                {Object.entries(GROUPS).map(([k, g]) => (
                  <option key={k} value={k}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <SummaryTable takes={shown} groupBy={groupBy} packs={packs} />
          <RecentTakes takes={shown} onDiscard={(id) => void discard(id)} />
          <div className="lab-export">
            <a className="lab-btn ghost" href={`${hubBaseUrl()}/api/lab/takes.csv`} download>
              <Download aria-hidden /> Download CSV
            </a>
            <small>
              Report for the README: <code>npm run lab-report</code> writes docs/voice-lab.md. Only the text Whisper heard is kept; recordings only if “keep my recordings” was ticked. Everything stays on the hub laptop
              (apps/hub/.lab).
            </small>
          </div>
        </section>
      </main>
    </div>
  );
}

function HubChip({ status }: { status: ReturnType<typeof useHubStatus> }) {
  if (status === undefined) return <span className="lab-chip">Looking for the hub…</span>;
  if (status === null) return <span className="lab-chip warn">No cabin hub: start it with “npm run hub” (the lab needs the real speech model)</span>;
  const asr = status.asr;
  return (
    <span className={`lab-chip${asr.state === 'ready' ? ' ok' : ''}`}>
      {asr.model.split('/').pop()} {asr.state}
      {asr.state === 'ready' && asr.typicalMs ? ` · ~${(asr.typicalMs / 1000).toFixed(1)} s` : ''}
    </span>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <fieldset className="lab-field">
      <legend>{label}</legend>
      <div className="lab-chips">
        {(Object.entries(options) as [T, string][]).map(([k, text]) => (
          <button type="button" key={k} className={k === value ? 'on' : ''} aria-pressed={k === value} onClick={() => onChange(k)}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SetupForm({
  setup,
  setSetup,
  lang,
  packs,
  onStart,
  canStart,
}: {
  setup: Setup;
  setSetup: (p: Partial<Setup>) => void;
  lang: string;
  packs: Pack[];
  onStart: () => void;
  canStart: boolean;
}) {
  const n = labPrompts(setup.speaker, modeFor(setup), lang).length;
  const pack = setup.speaker === 'passenger' && !isBuiltInLang(lang);
  return (
    <form
      className="lab-card lab-setup"
      onSubmit={(e) => {
        e.preventDefault();
        onStart();
      }}
    >
      <h1>Test HearMe with your real voice</h1>
      <p>
        You see a sentence (or a picture), hold the button and say it. The hub runs exactly what a passenger’s phone runs and logs what would have appeared on screen. About {Math.ceil((n * 12) / 60)} minutes
        for {n} prompts.
      </p>
      <Choice label="Who is speaking?" value={setup.speaker} options={{ passenger: 'Passenger asking for something', crew: 'Crew replying in Japanese' }} onChange={(speaker) => setSetup({ speaker })} />
      {setup.speaker === 'passenger' && (
        <fieldset className="lab-field">
          <legend>Language you will speak</legend>
          <div className="lab-chips">
            {LANGUAGES.map((l) => (
              <button type="button" key={l.code} lang={l.bcp47} className={l.code === setup.lang ? 'on' : ''} aria-pressed={l.code === setup.lang} onClick={() => setSetup({ lang: l.code })}>
                {l.nativeName}
              </button>
            ))}
            {packs.map((p) => (
              <button type="button" key={p.code} lang={p.code} className={p.code === setup.lang ? 'on' : ''} aria-pressed={p.code === setup.lang} onClick={() => setSetup({ lang: p.code })} title="Language pack: understood, screens in English">
                {p.name} <small>pack</small>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <Choice
        label={`Is ${nameOf(lang, packs)} your first language?`}
        value={setup.firstLanguage ? 'yes' : 'no'}
        options={{ yes: 'Yes', no: 'No' }}
        onChange={(v) => setSetup({ firstLanguage: v === 'yes' })}
      />
      <Choice label="Where are you?" value={setup.place} options={LAB_PLACES} onChange={(place) => setSetup({ place })} />
      <Choice label="Microphone" value={setup.mic} options={LAB_MICS} onChange={(mic) => setSetup({ mic })} />
      {pack ? (
        <p className="lab-note">
          {nameOf(lang, packs)} is a language pack: it has no sentences to read yet, so you ask for each picture in your own words.
        </p>
      ) : (
        <Choice
          label="Task"
          value={setup.mode}
          options={{ read: 'Read the sentence shown', 'own-words': 'Say it in my own words (closer to real use)' }}
          onChange={(mode) => setSetup({ mode })}
        />
      )}
      <label className="lab-field lab-text">
        <span>Initials or a nickname (optional, no full names)</span>
        <input value={setup.tester} maxLength={40} onChange={(e) => setSetup({ tester: e.target.value })} placeholder="e.g. DM" autoComplete="off" />
      </label>
      <label className="lab-check">
        <input type="checkbox" checked={setup.keepAudio} onChange={(e) => setSetup({ keepAudio: e.target.checked })} />
        <span>
          Keep my recordings on the hub laptop (apps/hub/.lab/audio) so new models can be re-tested on them. Off: only the text Whisper heard is kept.
        </span>
      </label>
      <button className="lab-btn big" type="submit" disabled={!canStart}>
        Start · {n} prompts <ArrowRight aria-hidden />
      </button>
    </form>
  );
}

function PromptCard({ prompt, speaker, lang, langName, n, of }: { prompt: LabPrompt; speaker: LabSpeaker; lang: string; langName: string; n: number; of: number }) {
  const bcp47 = bcp47Of(lang);
  const need = speaker === 'passenger' ? getNeed(prompt.expected) : undefined;
  const reply = speaker === 'crew' ? getReply(prompt.expected as ReplyId) : undefined;
  return (
    <div className="lab-card lab-prompt" aria-live="polite">
      <small className="lab-count">
        {n} / {of}
        {prompt.story && (
          <span className="lab-badge">
            <Star aria-hidden /> Stage story sentence
          </span>
        )}
      </small>
      {prompt.text ? (
        <>
          <span className="lab-say-label">{speaker === 'crew' ? 'Say this to the passenger:' : 'Say:'}</span>
          <p className="lab-say" lang={bcp47}>
            {prompt.text}
          </p>
          <small>Means: {labItemLabel(speaker, prompt.expected)}</small>
        </>
      ) : need ? (
        <>
          {/* Only the English name, so the speaker is not handed the exact words to say. */}
          <span className="lab-say-label">Ask for this in {langName}, in your own words, the way you would on a plane:</span>
          <div className="lab-need">
            <NeedIcon name={need.icon} size={56} />
            <b>{need.label.en}</b>
          </div>
        </>
      ) : (
        reply && (
          <>
            <span className="lab-say-label">Tell the passenger this in Japanese, your own way:</span>
            <p className="lab-say">“{reply.text.en}”</p>
          </>
        )
      )}
    </div>
  );
}

function ResultCard({
  last,
  speaker,
  story,
  onNext,
  onAgain,
  onDiscard,
  onStory,
}: {
  last: { take: LabTake; waitedMs: number; discarded?: boolean; story?: string };
  speaker: LabSpeaker;
  story: boolean;
  onNext: () => void;
  onAgain: () => void;
  onDiscard: () => void;
  onStory: () => void;
}) {
  const t = last.take;
  const bcp47 = bcp47Of(t.lang);
  return (
    <div className={`lab-card lab-result o-${t.outcome}${last.discarded ? ' discarded' : ''}`} role="status">
      <span className={`lab-outcome o-${t.outcome}`}>{last.discarded ? 'Discarded' : OUTCOME_LABEL[t.outcome]}</span>
      <p>
        Whisper heard: <q lang={bcp47}>{t.transcript || '…'}</q>
      </p>
      {t.outcome !== 'silent' && (
        <p>
          {speaker === 'crew'
            ? t.outcome === 'missed'
              ? 'No verified reply suggested: crew would tap one.'
              : `Suggested reply: ${labItemLabel('crew', t.got)} (${Math.round(t.confidence * 100)}% match)`
            : t.options.length
              ? `“Did you mean…?” offered: ${t.options.map((o) => labItemLabel('passenger', o)).join(' · ')}`
              : `Shown, ready to send: ${labItemLabel('passenger', t.got)}`}
        </p>
      )}
      <small>
        Whisper {fmtSeconds(t.asrMs)} · matching {t.matchMs} ms · on the hub {fmtSeconds(t.hubMs)} · you waited {fmtSeconds(last.waitedMs)}
      </small>
      {last.story && <p className="lab-note">{last.story}</p>}
      <div className="lab-actions">
        <button className="lab-btn" onClick={onNext} autoFocus>
          Next <ArrowRight aria-hidden />
        </button>
        <button className="lab-btn ghost" onClick={onAgain}>
          <RotateCcw aria-hidden /> Record again
        </button>
        {!last.discarded && (
          <button className="lab-btn ghost" onClick={onDiscard} title="I misread it, coughed, or it was not a fair take">
            <Trash2 aria-hidden /> Discard take
          </button>
        )}
        {story && t.outcome === 'right' && !last.discarded && !last.story && (
          <button className="lab-btn ghost" onClick={onStory}>
            <Star aria-hidden /> Use as Sharda’s voice in the stage story
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryTable({ takes, groupBy, packs }: { takes: LabTake[]; groupBy: GroupBy; packs: Pack[] }) {
  if (!takes.length) return <p className="lab-empty">No takes yet. Each recording appears here as soon as the hub has scored it.</p>;
  const rows = [...summarizeBy(takes, (t) => GROUPS[groupBy].key(t, packs)), ...(takes.length > 1 ? [summarizeTakes(takes, 'All')] : [])];
  return (
    <div className="lab-table-wrap">
      <table className="lab-table">
        <thead>
          <tr>
            <th scope="col">{GROUPS[groupBy].label}</th>
            <th scope="col">Takes</th>
            {LAB_OUTCOMES.map((o) => (
              <th key={o} scope="col" className={`o-${o}`}>
                {OUTCOME_LABEL[o]}
              </th>
            ))}
            <th scope="col">Had to tap or type</th>
            <th scope="col">Speech error rate</th>
            <th scope="col">Median on hub</th>
            <th scope="col">90% within</th>
            <th scope="col">95% within</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={r.label === 'All' ? 'all' : ''}>
              <th scope="row">{r.label}</th>
              <td>{r.takes}</td>
              {LAB_OUTCOMES.map((o) => (
                <td key={o} title={`${r.counts[o]} of ${r.takes}`}>
                  {pct(r.counts[o], r.takes)}
                </td>
              ))}
              <td title="Asked without the right picture, or nothing heard">{Math.round(r.fallbackRate * 100)}%</td>
              <td title={r.wer ? `${r.wer.edits} ${r.wer.unit}s wrong out of ${r.wer.reference}, over ${r.werTakes} read takes` : 'Only measurable for takes that read a given sentence'}>
                {r.wer ? fmtRate(r.wer) : '—'}
              </td>
              <td>{fmtSeconds(r.medianMs)}</td>
              <td>{fmtSeconds(r.p90Ms)}</td>
              <td>{fmtSeconds(r.p95Ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="lab-legend">
        <summary>What the columns mean</summary>
        <ul>
          <li>
            <b>{OUTCOME_LABEL.right}</b>: the right picture (crew: the right verified reply) appeared, ready to send.
          </li>
          <li>
            <b>{OUTCOME_LABEL.offered}</b>: HearMe was unsure and offered three pictures; the right one was among them (one more tap).
          </li>
          <li>
            <b>{OUTCOME_LABEL.missed}</b>: unsure, and the right picture was not offered (crew: no reply suggested). The passenger picks from all pictures or types.
          </li>
          <li>
            <b>{OUTCOME_LABEL.wrong}</b>: a wrong picture or reply appeared, ready to send. The passenger (or crew) must notice before sending. This is the number to keep low.
          </li>
          <li>
            <b>Had to tap or type</b>: the share of takes that left the passenger without a ready request — unsure and the right picture was not offered, or nothing heard. The one number that says how often voice let someone down.
          </li>
          <li>
            <b>Speech error rate</b>: how wrong Whisper's <i>text</i> was against the sentence the person read — mistaken words ÷ total words (characters for Japanese and Thai). Only read takes count; own-words takes have no sentence to compare with. A high error rate beside a low “{OUTCOME_LABEL.wrong}” means the matcher is recovering from bad transcripts, which is what it is for.
          </li>
          <li>
            <b>Median on hub</b>: from the recording arriving to the answer (Whisper and matching), on this laptop. Wi-Fi upload comes on top. <b>95% within</b> is the slow tail a passenger actually notices.
          </li>
        </ul>
      </details>
    </div>
  );
}

function RecentTakes({ takes, onDiscard }: { takes: LabTake[]; onDiscard: (id: string) => void }) {
  if (!takes.length) return null;
  return (
    <ol className="lab-recent" aria-label="Latest takes">
      {takes
        .slice(-8)
        .reverse()
        .map((t) => (
          <li key={t.id}>
            <span className={`lab-dot o-${t.outcome}`} title={OUTCOME_LABEL[t.outcome]} />
            <span className="lab-recent__what">
              <b>{labItemLabel(t.speaker, t.expected)}</b>
              <q lang={bcp47Of(t.lang)}>{t.transcript || '…'}</q>
            </span>
            <span className="lab-recent__meta">
              {OUTCOME_LABEL[t.outcome]} · {fmtSeconds(t.hubMs)}
            </span>
            <button className="lab-icon" onClick={() => onDiscard(t.id)} aria-label={`Discard take: ${labItemLabel(t.speaker, t.expected)}`} title="Discard">
              <Trash2 aria-hidden />
            </button>
          </li>
        ))}
    </ol>
  );
}
