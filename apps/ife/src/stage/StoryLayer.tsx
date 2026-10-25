import { LANGUAGES, WebSocketBus, fetchHubStatus, hubSocketUrl, languageInfo, localePack, translator, type CrewCommand, type LangCode } from '@hearme/shared';
import { Film, Gavel, Play, RotateCcw, Square, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { hubBaseUrl } from '../common/hub';
import { PHONE, STORY, StoryContext, StoryRunner, type FailChoice, type HeardBy, type StoryHost } from './story';

/** Send one command to the hub's crew tablet (reset, auto-reply…) and disconnect. */
export function sendCrewCommand(cmd: CrewCommand): Promise<void> {
  return new Promise((resolve) => {
    const bus = new WebSocketBus(hubSocketUrl(hubBaseUrl()), { role: 'crew' });
    let off: () => void = () => undefined;
    const done = () => {
      off();
      bus.close();
      resolve();
    };
    const timer = setTimeout(done, 3000);
    off = bus.onChange((up) => {
      if (!up) return;
      bus.sendFrame({ kind: 'crew', cmd });
      setTimeout(() => {
        clearTimeout(timer);
        done();
      }, 200);
    });
  });
}

/** Loudness per 100 ms in the same scale as the phone's live meter. */
function levelsOf(buffer: AudioBuffer): number[] {
  const data = buffer.getChannelData(0);
  const block = Math.round(buffer.sampleRate / 10);
  const out: number[] = [];
  for (let i = 0; i < data.length; i += block) {
    let sum = 0;
    const end = Math.min(data.length, i + block);
    for (let j = i; j < end; j++) sum += data[j]! * data[j]!;
    const rms = Math.sqrt(sum / Math.max(1, end - i));
    out.push(Math.round(Math.max(30, 94 + (rms > 0 ? 20 * Math.log10(rms) : -100))));
  }
  return out;
}

type Mode = 'idle' | 'running' | 'ended' | 'judge';

export interface Story {
  mode: Mode;
  step: { index: number; title: string } | null;
  caption: string | null;
  marks: { id: number; x: number; y: number }[];
  fail: { title: string; reason: string; choose: (c: FailChoice) => void } | null;
  /** How her sentence got in on the last full run. */
  heardBy: HeardBy | null;
  judgeLang: LangCode;
  autoReply: boolean;
  start(): void;
  stop(): void;
  judge(lang?: LangCode): void;
  exitJudge(): void;
  setJudgeLang(lang: LangCode): void;
  setAutoReply(on: boolean): void;
}

const hi = translator('hi');

/** The scripted story and the judge mode, driving the stage's real iframes. */
export function useStory(resetHub: () => Promise<void>): Story {
  const [mode, setMode] = useState<Mode>('idle');
  const [step, setStep] = useState<Story['step']>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [marks, setMarks] = useState<Story['marks']>([]);
  const [fail, setFail] = useState<Story['fail']>(null);
  const [heardBy, setHeardBy] = useState<HeardBy | null>(null);
  const [judgeLang, setLang] = useState<LangCode>('hi');
  const [autoReply, setAuto] = useState(true);
  const runner = useRef<StoryRunner | null>(null);
  const markId = useRef(0);

  const host = useMemo<StoryHost>(
    () => ({
      frame: (title) => document.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`),
      reset: resetHub,
      caption: setCaption,
      tapMark: (x, y) => {
        const id = ++markId.current;
        setMarks((m) => [...m, { id, x, y }]);
        setTimeout(() => setMarks((m) => m.filter((k) => k.id !== id)), 900);
      },
      playClip: async (wav) => {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const buffer = await ctx.decodeAudioData(wav);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.onended = () => void ctx.close();
        src.start();
        return { levels: levelsOf(buffer), seconds: buffer.duration };
      },
      warmup: async () => {
        await fetch('/api/warmup', { method: 'POST' }).catch(() => undefined);
      },
      speechReady: async () => {
        const s = await fetchHubStatus(hubBaseUrl());
        return s?.asr.state === 'ready' || s?.asr.state === 'warming';
      },
      onFail: (st, reason) =>
        new Promise<FailChoice>((resolve) =>
          setFail({
            title: st.title,
            reason,
            choose: (c) => {
              setFail(null);
              resolve(c);
            },
          }),
        ),
      onStep: (index, st) => setStep({ index, title: st.title }),
    }),
    [resetHub],
  );

  const setPhoneLang = (lang: LangCode) => {
    const story = (host.frame(PHONE)?.contentWindow as { __hearmeStory?: { setLanguage?: (l: LangCode) => void } } | null)?.__hearmeStory;
    story?.setLanguage?.(lang);
  };

  return {
    mode,
    step,
    caption,
    marks,
    fail,
    heardBy,
    judgeLang,
    autoReply,
    start() {
      if (runner.current) return;
      setMode('running');
      setStep(null);
      const r = new StoryRunner(host);
      runner.current = r;
      void sendCrewCommand({ type: 'autoReply', on: false }).then(() =>
        r.run().then((result) => {
          runner.current = null;
          setCaption(null);
          setStep(null);
          setHeardBy(r.heardBy);
          setMode(result === 'done' ? 'ended' : 'idle');
        }),
      );
    },
    stop() {
      runner.current?.stop();
      fail?.choose('stop');
    },
    judge(lang = judgeLang) {
      runner.current?.stop();
      setMode('judge');
      setCaption(null);
      setLang(lang);
      // A clean seat 23C: the phone opens with the booking, then switches to the judge's language.
      void (async () => {
        await resetHub();
        await sendCrewCommand({ type: 'autoReply', on: autoReply });
        const ctx = new StoryContext(host, () => false);
        try {
          await ctx.tap(PHONE, { text: hi('onboard.useThis') }, 30_000);
          await ctx.waitFor(PHONE, { label: hi('home.holdToSpeak') }, 10_000);
          setPhoneLang(lang);
        } catch {
          /* the judge can still tap through it themselves */
        }
      })();
    },
    exitJudge() {
      setMode('idle');
      void sendCrewCommand({ type: 'autoReply', on: false });
    },
    setJudgeLang(lang) {
      setLang(lang);
      setPhoneLang(lang);
    },
    setAutoReply(on) {
      setAuto(on);
      void sendCrewCommand({ type: 'autoReply', on });
    },
  };
}

/** Header controls: run/stop the story, step counter, judge mode. */
export function StoryButtons({ story }: { story: Story }) {
  if (story.mode === 'running') {
    return (
      <div className="story-controls">
        <span className="story-step" aria-live="polite">
          {story.step ? `Step ${story.step.index + 1}/${STORY.length} · ${story.step.title}` : 'Starting…'}
        </span>
        <button className="stage-btn story-stop" onClick={story.stop}>
          <Square aria-hidden /> Stop
        </button>
      </div>
    );
  }
  if (story.mode === 'judge') {
    return (
      <div className="story-controls">
        <button className="stage-btn ghost" onClick={story.exitJudge}>
          <X aria-hidden /> Exit judge mode
        </button>
      </div>
    );
  }
  return (
    <div className="story-controls">
      <button className="stage-btn story-run" onClick={story.start} title="Runs Sharda's story live through the real apps and the hub (about 70 s)">
        <Play aria-hidden /> Run the story
      </button>
      <button className="stage-btn ghost" onClick={() => story.judge()}>
        <Gavel aria-hidden /> Judge, try it
      </button>
    </div>
  );
}

/** Caption bar, tap marks, the stuck-step dialog and the end card. */
export function StoryOverlay({ story, onVideo }: { story: Story; onVideo: () => void }) {
  return (
    <>
      {story.marks.map((m) => (
        <span key={m.id} className="story-tap" style={{ left: m.x - 22, top: m.y - 22 }} aria-hidden />
      ))}
      {story.caption && (
        <div className="story-caption" role="status" aria-live="polite">
          {story.caption}
        </div>
      )}
      {story.fail && (
        <div className="story-modal" role="alertdialog" aria-labelledby="story-fail-title">
          <div className="story-fail">
            <h2 id="story-fail-title">“{story.fail.title}” did not finish</h2>
            <p>{story.fail.reason}. Nothing was faked: the step waits for the real apps and hub.</p>
            <div className="story-fail__actions">
              <button className="stage-btn story-run" onClick={() => story.fail?.choose('retry')} autoFocus>
                <RotateCcw aria-hidden /> Try again
              </button>
              <button className="stage-btn ghost" onClick={() => story.fail?.choose('skip')}>
                Skip this step
              </button>
              <button
                className="stage-btn ghost"
                onClick={() => {
                  story.fail?.choose('stop');
                  onVideo();
                }}
              >
                <Film aria-hidden /> Show the recording instead
              </button>
              <button className="stage-btn ghost" onClick={() => story.fail?.choose('stop')}>
                Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const HOW: Record<HeardBy, string> = {
  recorded: 'Her recorded sentence went through Whisper and the matcher on this laptop; the recording is the only thing prepared in advance.',
  synthesized: 'A computer voice read her sentence aloud, and Whisper and the matcher on this laptop understood it.',
  typed: 'Her sentence was typed (there is no recording of it on this laptop) and matched on this laptop. Hold the mic to try speech yourself.',
};

/** Shown in the middle column after the story: hand over to the judges. */
export function StoryEnd({ story, onVideo }: { story: Story; onVideo: () => void }) {
  return (
    <div className="story-end" role="region" aria-label="Story finished">
      <b>That was live.</b>
      <p>{HOW[story.heardBy ?? 'typed']} The crew tablet got it in Japanese and the verified reply came back in Hindi, read aloud. No internet.</p>
      <div className="story-end__actions">
        <button className="stage-btn story-run" onClick={() => story.judge()}>
          Judge, try it
        </button>
        <button className="stage-btn ghost" onClick={story.start}>
          <Play aria-hidden /> Run again
        </button>
        <button className="stage-btn ghost" onClick={onVideo}>
          <Film aria-hidden /> Recording
        </button>
      </div>
    </div>
  );
}

/** Phrases to try in a language: hand-written ones, else the language pack's own examples (machine drafts included). */
function tryPhrases(lang: LangCode): [string, string][] {
  const own = TRY[lang];
  if (own) return own;
  const ex = localePack(lang)?.examples ?? {};
  return [
    [ex.blanket?.[0], 'Can I have a blanket, please?'],
    [ex.water?.[0], 'Can I have water, please?'],
  ].filter((p): p is [string, string] => !!p[0]);
}

/** Phrases a judge can try in each language (with what they mean). */
const TRY: Partial<Record<LangCode, [string, string][]>> = {
  hi: [
    ['मुझे एक कंबल चाहिए', 'I need a blanket'],
    ['टॉयलेट कहाँ है?', 'Where is the toilet?'],
  ],
  en: [
    ['Could I get a pillow?', ''],
    ['I feel dizzy', ''],
  ],
  ja: [
    ['お水をください', 'Water, please'],
    ['毛布をください', 'A blanket, please'],
  ],
  th: [
    ['ขอน้ำร้อนหน่อย', 'Hot water, please'],
    ['ห้องน้ำอยู่ที่ไหน', 'Where is the toilet?'],
  ],
  id: [
    ['Saya mau ke toilet', 'I want to go to the toilet'],
    ['Minta selimut', 'A blanket, please'],
  ],
  vi: [
    ['Tôi thấy chóng mặt', 'I feel dizzy'],
    ['Cho tôi xin nước', 'Some water, please'],
  ],
  bn: [
    ['আমার একটা কম্বল লাগবে', 'I need a blanket'],
    ['শৌচাগার কোন দিকে?', 'Where is the toilet?'],
  ],
  ta: [
    ['எனக்கு ஒரு போர்வை வேண்டும்', 'I need a blanket'],
    ['கழிப்பறை எங்கே?', 'Where is the toilet?'],
  ],
  pa: [
    ['ਮੈਨੂੰ ਇੱਕ ਕੰਬਲ ਚਾਹੀਦਾ ਹੈ', 'I need a blanket'],
    ['ਬਾਥਰੂਮ ਕਿੱਥੇ ਹੈ?', 'Where is the toilet?'],
  ],
  mr: [
    ['मला एक ब्लँकेट पाहिजे', 'I need a blanket'],
    ['स्वच्छतागृह कुठे आहे?', 'Where is the toilet?'],
  ],
};

/** "Judge, try it": the stage phone in the judge's language, their own phone by QR, and a one-person crew. */
export function JudgePanel({ story, phoneUrl }: { story: Story; phoneUrl: string | null }) {
  const lang = story.judgeLang;
  return (
    <div className="judge" role="region" aria-label="Judge, try it">
      <div className="judge-head">
        <b>Your turn: you are the passenger in 23C</b>
        <span>Tap a picture, hold the microphone and speak, or show where it hurts.</span>
      </div>
      <div className="judge-langs" role="group" aria-label="Phone language">
        {LANGUAGES.map((l) => (
          <button key={l.code} className={l.code === lang ? 'on' : ''} lang={l.bcp47} onClick={() => story.setJudgeLang(l.code)} aria-pressed={l.code === lang}>
            {l.nativeName}
          </button>
        ))}
      </div>
      <div className="judge-try">
        <small>Try saying ({languageInfo(lang).englishName}):</small>
        {tryPhrases(lang).map(([text, gloss]) => (
          <div key={text} className="judge-phrase">
            <q lang={languageInfo(lang).bcp47}>{text}</q>
            {gloss && <span>{gloss}</span>}
          </div>
        ))}
      </div>
      <label className="judge-auto">
        <input type="checkbox" checked={story.autoReply} onChange={(e) => story.setAutoReply(e.target.checked)} /> The crew answers automatically (one person can try it alone)
      </label>
      {phoneUrl && (
        <div className="judge-qr">
          <img src={`/api/qr.svg?size=150&data=${encodeURIComponent(phoneUrl)}`} alt="QR code: use your own phone as seat 23C" width={150} height={150} />
          <span>
            <b>Or use your own phone</b> (same Wi-Fi).{' '}
            Opens in your browser. No app to install.
          </span>
        </div>
      )}
    </div>
  );
}
