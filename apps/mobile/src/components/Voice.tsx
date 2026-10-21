import { decide, defaultMatcher, matchOnHub, translator, type LangCode, type MatchResult, type RequestSource } from '@hearme/shared';
import { MicUnavailableError } from '@hearme/shared/web';
import Check from 'lucide-react-native/icons/check';
import Mic from 'lucide-react-native/icons/mic';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Square from 'lucide-react-native/icons/square';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useNav } from '../nav';
import { currentSpeech, getHubUrl, session } from '../runtime';
import { useTheme } from '../theme';
import { T } from './ui';

type Phase = 'idle' | 'listening' | 'processing';

const MIN_HOLD_MS = 400;

/**
 * Route what the passenger said or typed: confident → review; unsure →
 * "Did you mean?" pictures. Uses the hub's meaning-based match when there is
 * one (speech always comes with it), otherwise the on-device keyword matcher.
 */
export function useRouteTranscript() {
  const nav = useNav();
  return async (transcript: string, source: RequestSource, lang: LangCode, hubMatch?: MatchResult) => {
    let match = hubMatch;
    const hub = getHubUrl();
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
  const speech = currentSpeech();
  const startedAt = useRef(0);
  /** True while a pointer gesture is in progress; activations without one come from screen readers or keyboards. */
  const lastPointer = useRef(0);

  useEffect(() => () => speech.cancel(), [speech]);

  const start = () => {
    if (phaseRef.current !== 'idle') return;
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

  const finish = async () => {
    if (phaseRef.current !== 'listening') return;
    setPhase('processing');
    try {
      const { transcript, match } = await speech.stop();
      setPhase('idle');
      if (!transcript.trim()) {
        setError(tr('speech.tooShort'));
        return;
      }
      await route(transcript, 'speech', lang, match);
    } catch {
      setPhase('idle');
      setError(tr('speech.error'));
    }
  };

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

  // Seconds since the recording was sent: shows the passenger something is happening.
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (phase !== 'processing') return;
    const t0 = Date.now();
    setWaited(0);
    const timer = setInterval(() => setWaited((Date.now() - t0) / 1000), 100);
    return () => clearInterval(timer);
  }, [phase]);
  const step = (Icon: typeof Mic, state: 'done' | 'active' | 'todo', key: string) => (
    <View
      key={key}
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: state === 'done' ? th.p.primary : state === 'active' ? th.p.primarySoft : th.p.surface,
        borderWidth: 2,
        borderColor: state === 'todo' ? th.p.border : th.p.primary,
      }}
    >
      <Icon color={state === 'done' ? '#fff' : state === 'active' ? th.p.primary : th.p.textMuted} size={18} />
    </View>
  );
  const line = (done: boolean, key: string) => <View key={key} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: done ? th.p.primary : th.p.border }} />;

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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {phase === 'processing' ? <ActivityIndicator color={th.p.primary} /> : <Mic color={th.p.primary} size={20} />}
              <T bold>{phase === 'listening' ? tr('speech.listening') : tr('speech.processing')}</T>
            </View>
            {phase === 'processing' && <Text style={{ color: th.p.textMuted, fontWeight: '700', fontSize: th.fs(14) }}>{waited.toFixed(1)} s</Text>}
            {phase === 'listening' && speech.simulated && (
              <View style={{ backgroundColor: th.p.warningSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: th.p.warning, fontWeight: '700', fontSize: th.fs(13) }}>{db} dB</Text>
              </View>
            )}
          </View>
          {/* Heard → understanding → ready: the three steps, so a few seconds of waiting reads as progress. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} importantForAccessibility="no-hide-descendants">
            {[
              step(Mic, phase === 'listening' ? 'active' : 'done', 'mic'),
              line(phase === 'processing', 'l1'),
              step(Sparkles, phase === 'processing' ? 'active' : 'todo', 'ai'),
              line(false, 'l2'),
              step(Check, 'todo', 'ok'),
            ]}
          </View>
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
          opacity: pressed && phase === 'idle' ? 0.9 : 1,
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
