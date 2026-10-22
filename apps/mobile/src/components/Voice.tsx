import { decide, defaultMatcher, matchOnHub, translator, type LangCode, type MatchResult, type RequestSource, type SpeechRecognizer, type UnderstandProgress, splitRequests, understandRequests } from '@hearme/shared';
import { MicUnavailableError } from '@hearme/shared/web';
import Mic from 'lucide-react-native/icons/mic';
import Square from 'lucide-react-native/icons/square';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useNav } from '../nav';
import { clipRecognizer, currentSpeech, getHubUrl, inStage, session } from '../runtime';
import { useTheme } from '../theme';
import { T } from './ui';

type Phase = 'idle' | 'listening' | 'processing';

/** Live progress of one recording on the hub, with when the current stage began. */
interface Progress {
  p: UnderstandProgress;
  since: number;
}

const MIN_HOLD_MS = 400;

/**
 * Route what the passenger said or typed: confident → review; unsure →
 * "Did you mean?" pictures. Uses the hub's meaning-based match when there is
 * one (speech always comes with it), otherwise the on-device keyword matcher.
 */
export function useRouteTranscript() {
  const nav = useNav();
  return async (transcript: string, source: RequestSource, lang: LangCode, hubMatch?: MatchResult) => {
    const hub = getHubUrl();
    // Several requests in one sentence, or something refused ("not cold water"): match each part.
    const parts = splitRequests(transcript);
    if (parts.length > 1 || parts.some((p) => p.refused)) {
      const matchPart = async (t: string) => (hub ? (await matchOnHub(hub, t, { lang }))?.match : undefined) ?? defaultMatcher.match(t);
      const many = await understandRequests(transcript, matchPart, defaultMatcher);
      if (many.requests.length >= 2 || (many.requests.length === 1 && many.refused.length > 0)) {
        nav.open({ kind: 'reviewMany', items: many.requests, refused: many.refused, source, transcript });
        return;
      }
      if (many.requests.length === 0 && many.refused.length > 0) {
        // Only a refusal: ask with pictures, leaving out what was refused.
        const d = decide(hubMatch ?? defaultMatcher.match(transcript));
        const options = (d.kind === 'confident' ? [d.needId] : d.options).filter((id) => !many.refused.includes(id));
        nav.open({ kind: 'ask', options, purposeId: d.purposeId, source, transcript, confidence: 0 });
        return;
      }
    }
    let match = hubMatch;
    if (!match && hub) match = (await matchOnHub(hub, transcript, { lang }))?.match;
    const d = decide(match ?? defaultMatcher.match(transcript));
    if (d.kind === 'confident') {
      nav.open({ kind: 'review', needId: d.needId, purposeId: d.purposeId, source, understanding: { confidence: d.confidence, viaPictures: false } });
    } else {
      nav.open({ kind: 'ask', options: d.options, purposeId: d.purposeId, source, transcript, confidence: d.confidence });
    }
  };
}

/**
 * Hold-to-speak. Press and hold, speak, release. A short tap keeps listening
 * until a second tap (easier for people who cannot hold a button), and with a
 * screen reader one tap starts and the next stops. Speech recognition is
 * SIMULATED (MockSpeechRecognizer): no microphone access, nothing is recorded.
 */
export function HoldToSpeak({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const tr = translator(lang);
  const route = useRouteTranscript();
  const [phase, setPhaseState] = useState<Phase>('idle');
  // Press handlers can be captured at press start, so read the live phase from a ref.
  const phaseRef = useRef<Phase>('idle');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [db, setDb] = useState(0);
  const [tapMode, setTapMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [, setTick] = useState(0);
  // The demo stage can play a recording in place of the microphone (see below).
  const override = useRef<SpeechRecognizer | null>(null);
  const speech = override.current ?? currentSpeech();
  const startedAt = useRef(0);
  /** True while a pointer gesture is in progress; activations without one come from screen readers or keyboards. */
  const lastPointer = useRef(0);

  useEffect(() => () => speech.cancel(), [speech]);

  const start = () => {
    if (phaseRef.current !== 'idle') return;
    const speech = override.current ?? currentSpeech();
    setTapMode(false);
    setError(null);
    startedAt.current = Date.now();
    setPhase('listening');
    AccessibilityInfo.announceForAccessibility(tr('speech.listening'));
    // A passenger with a language pack (e.g. Bengali) speaks it; the screens stay in `lang`.
    Promise.resolve(speech.start(session.getState().profile?.speechLang ?? lang, setDb)).catch((e: unknown) => {
      setPhase('idle');
      setError(e instanceof MicUnavailableError && e.reason !== 'denied' ? tr('speech.needsHub') : tr('speech.micDenied'));
    });
  };

  const finish = async (): Promise<string | null> => {
    if (phaseRef.current !== 'listening') return null;
    const speech = override.current ?? currentSpeech();
    setPhase('processing');
    setProgress({ p: { stage: 'sending' }, since: Date.now() });
    try {
      const { transcript, match } = await speech.stop((p) => {
        setProgress({ p, since: Date.now() });
        if (p.stage === 'matching' && p.transcript) AccessibilityInfo.announceForAccessibility(tr('speech.heard', { text: p.transcript }));
      });
      setPhase('idle');
      setProgress(null);
      if (!transcript.trim()) {
        setError(tr('speech.tooShort'));
        return '';
      }
      await route(transcript, 'speech', lang, match);
      return transcript;
    } catch {
      setPhase('idle');
      setProgress(null);
      setError(tr('speech.error'));
      return null;
    }
  };

  /**
   * Demo stage only: lets the stage's scripted story "speak" a recording into
   * this phone. Everything after the microphone is the real flow: the clip
   * goes to the hub, Whisper and matching run there, and the phone shows the
   * same progress and result as for a live voice.
   */
  useEffect(() => {
    if (!inStage) return;
    const w = globalThis as unknown as { __hearmeStory?: Record<string, unknown> };
    w.__hearmeStory = {
      ...w.__hearmeStory,
      speakClip: async (wav: ArrayBuffer, levels: number[], seconds: number) => {
        override.current = clipRecognizer(wav, levels);
        try {
          start();
          await new Promise((r) => setTimeout(r, Math.max(800, seconds * 1000)));
          return await finish();
        } finally {
          override.current = null;
        }
      },
    };
    return () => {
      if (w.__hearmeStory) delete w.__hearmeStory.speakClip;
    };
  });

  // Redraw the estimate a few times a second while Whisper works.
  useEffect(() => {
    if (phase !== 'processing') return;
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [phase]);

  /** Pointer released: a real hold finishes; a quick tap switches to tap-to-finish. */
  const release = () => {
    lastPointer.current = Date.now();
    if (phaseRef.current !== 'listening') return;
    if (Date.now() - startedAt.current < MIN_HOLD_MS) setTapMode(true);
    else finish();
  };

  /** Pointer down: starts listening, or finishes when already listening in tap mode. */
  const pressIn = () => {
    lastPointer.current = Date.now();
    if (phaseRef.current === 'listening') finish();
    else start();
  };

  /**
   * Activation without a pointer (VoiceOver/TalkBack double-tap, keyboard): toggle.
   * The browser also sends a click right after every pointer press; that one
   * was already handled by pressIn/release, so it is ignored.
   */
  const activate = () => {
    if (Date.now() - lastPointer.current < 800) return;
    if (phaseRef.current === 'idle') {
      start();
      setTapMode(true);
    } else finish();
  };

  // On web the release can be missed when the DOM updates under the pointer, so also listen on the window.
  useEffect(() => {
    if (Platform.OS !== 'web' || phase !== 'listening' || tapMode) return;
    const w = globalThis as unknown as { addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void };
    w.addEventListener('pointerup', release);
    w.addEventListener('touchend', release);
    return () => {
      w.removeEventListener('pointerup', release);
      w.removeEventListener('touchend', release);
    };
  });

  const bars = Array.from({ length: 14 }, (_, i) => {
    const level = Math.max(0.15, Math.min(1, ((db - 70) / 18) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + db)))));
    return level;
  });

  return (
    <View style={{ gap: th.space.sm }}>
      {phase !== 'idle' && (
        <View
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={phase === 'listening' ? tr('speech.listening') : tr('speech.processing')}
          style={{ backgroundColor: th.p.surface, borderRadius: th.radius.md, borderWidth: 2, borderColor: th.p.primary, padding: th.space.md, gap: th.space.sm }}
        >
          <Steps step={phase === 'listening' ? 0 : progress?.p.stage === 'matching' ? 2 : 1} lang={lang} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              {phase === 'processing' ? <ActivityIndicator color={th.p.primary} /> : <Mic color={th.p.primary} size={20} />}
              <T bold style={{ flexShrink: 1 }}>
                {phase === 'listening' ? tr('speech.listening') : stageText(progress, tr)}
              </T>
            </View>
            {phase === 'listening' && speech.simulated && (
              <View style={{ backgroundColor: th.p.warningSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: th.p.warning, fontWeight: '700', fontSize: th.fs(13) }}>{db} dB</Text>
              </View>
            )}
          </View>
          {phase === 'processing' && <EstimateBar progress={progress} />}
          {phase === 'processing' && progress?.p.stage === 'matching' && progress.p.transcript && (
            <T lang={lang} style={{ fontStyle: 'italic' }}>
              {tr('speech.heard', { text: progress.p.transcript })}
            </T>
          )}
          {phase === 'listening' && !th.reduceMotion && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36 }} importantForAccessibility="no-hide-descendants">
              {bars.map((b, i) => (
                <View key={i} style={{ flex: 1, height: `${Math.round(b * 100)}%`, backgroundColor: th.p.primary, borderRadius: 3 }} />
              ))}
            </View>
          )}
          <T v="caption" muted>
            {speech.simulated ? tr('speech.simulated') : tr('speech.private')}
          </T>
        </View>
      )}
      {error && phase === 'idle' && (
        <T v="caption" color={th.p.danger} role="alert" live="assertive">
          {error}
        </T>
      )}
      <Pressable
        onPressIn={pressIn}
        onPressOut={release}
        onPress={activate}
        disabled={phase === 'processing'}
        accessibilityRole="button"
        accessibilityLabel={phase === 'listening' ? tr('speech.tapToFinish') : tr('home.holdToSpeak')}
        accessibilityState={{ busy: phase === 'processing', selected: phase === 'listening' }}
        style={({ pressed }) => ({
          minHeight: 64,
          borderRadius: th.radius.md,
          backgroundColor: phase === 'listening' ? th.p.navy : th.p.primary,
          borderWidth: th.hc ? 2 : 0,
          borderColor: th.p.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: th.space.sm,
          opacity: phase === 'processing' ? 0.55 : pressed && phase === 'idle' ? 0.9 : 1,
        })}
      >
        {phase === 'listening' ? <Square color={th.p.onNavy} size={th.fs(22)} /> : <Mic color={th.p.onPrimary} size={th.fs(26)} />}
        <Text maxFontSizeMultiplier={1.4} style={{ color: phase === 'listening' ? th.p.onNavy : th.p.onPrimary, fontSize: th.fs(th.t.bodyLarge), fontWeight: '800' }}>
          {phase === 'listening' ? (tapMode ? tr('speech.tapToFinish') : tr('speech.listening')) : tr('home.holdToSpeak')}
        </Text>
      </Pressable>
    </View>
  );
}

/** What the passenger is waiting for, in their language, with the time left when the hub gave an estimate. */
function stageText(progress: Progress | null, tr: ReturnType<typeof translator>): string {
  const p = progress?.p;
  if (!p || !progress) return tr('speech.processing');
  switch (p.stage) {
    case 'sending':
      // Older hubs do not stream their stages; after a moment just say we are understanding.
      return Date.now() - progress.since > 700 ? tr('speech.processing') : tr('speech.sending');
    case 'queued':
      return tr('speech.queued');
    case 'transcribing': {
      const left = Math.ceil((p.estimateMs - (Date.now() - progress.since)) / 1000);
      return left >= 1 ? `${tr('speech.processing')} ${tr('speech.secondsLeft', { s: left })}` : tr('speech.almost');
    }
    case 'matching':
    case 'done':
      return tr('speech.matching');
  }
}

/** Listen → Understand → Picture, so the passenger can see where their request is. */
function Steps({ step, lang }: { step: 0 | 1 | 2; lang: LangCode }) {
  const th = useTheme();
  const tr = translator(lang);
  const labels = [tr('speech.stepListen'), tr('speech.stepUnderstand'), tr('speech.stepPicture')];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 3, now: step + 1, text: labels[step] }}>
      {labels.map((label, i) => {
        const done = i < step;
        const on = i === step;
        return (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            {i > 0 && <View style={{ width: 12, height: 2, backgroundColor: done || on ? th.p.primary : th.p.border }} />}
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: on ? th.p.primary : done ? th.p.primarySoft : th.p.surfaceAlt,
                borderWidth: th.hc ? 1 : 0,
                borderColor: th.p.border,
              }}
            >
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: th.fs(12), fontWeight: '700', color: on ? th.p.onPrimary : done ? th.p.primary : th.p.textMuted }}>
                {done ? '✓ ' : ''}
                {label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Fills towards the hub's typical time, slowing near the end; never claims to be done before it is. */
function EstimateBar({ progress }: { progress: Progress | null }) {
  const th = useTheme();
  const p = progress?.p;
  let fraction = 0.08;
  if (p && progress) {
    if (p.stage === 'transcribing') {
      const x = (Date.now() - progress.since) / Math.max(500, p.estimateMs);
      fraction = 0.1 + 0.8 * (1 - Math.exp(-2.2 * x)); // approaches 90% while waiting
    } else if (p.stage === 'matching' || p.stage === 'done') fraction = 0.95;
    else if (p.stage === 'queued') fraction = 0.08;
  }
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ height: 8, borderRadius: 4, backgroundColor: th.p.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(fraction * 100)}%`, height: '100%', backgroundColor: th.p.primary, borderRadius: 4 }} />
    </View>
  );
}
