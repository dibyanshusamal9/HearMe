import {
  ago,
  ANNOUNCEMENTS,
  CATEGORIES,
  CATEGORY_LABELS,
  type CrewMode,
  DemoCabinLink,
  describeStatus,
  captionOf,
  getNeed,
  isValidSeat,
  type LangCode,
  LANGUAGES,
  localized,
  needLabel,
  needsInCategory,
  type NetworkCondition,
  normalizeSeat,
  PROFILE_TAGS,
  translator,
  type ReplyChannel,
  replyText,
  requestTitle,
  SAFETY_STEPS,
  sanitizeName,
  type UtteranceMode,
} from '@hearme/shared';
import { useSession } from '@hearme/shared/react';
import Accessibility from 'lucide-react-native/icons/accessibility';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Megaphone from 'lucide-react-native/icons/megaphone';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import Trash from 'lucide-react-native/icons/trash';
import { useEffect, useReducer, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { NeedIcon } from '../components/Icon';
import { Btn, Card, Segmented, StatusChip, T, ToggleRow } from '../components/ui';
import { VoiceCheck } from '../components/VoiceCheck';
import { useNav } from '../nav';
import { clearStoredSession, connectHub, forgetHub, link, mockSpeech, session, useHubUrl } from '../runtime';
import { useTheme } from '../theme';

// ── Requests ──────────────────────────────────────────────────────────────
export function RequestsTab({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  const requests = useSession(session, (s) => s.requests);
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const i = setInterval(tick, 5000);
    return () => clearInterval(i);
  }, []);
  return (
    <ScrollView contentContainerStyle={{ padding: th.space.lg, gap: th.space.md }}>
      <T v="heading" role="header">
        {tr('requests.title')}
      </T>
      {requests.length === 0 && (
        <Card>
          <T muted>{tr('requests.empty')}</T>
          <Btn label={tr('nav.home')} onPress={() => nav.setTab('home')} />
        </Card>
      )}
      {requests.map((r) => {
        const need = getNeed(r.needId);
        const v = describeStatus(r, lang);
        return (
          <Card key={r.id} accent={r.status === 'failed' ? th.p.danger : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space.md }}>
              {need && <NeedIcon name={need.icon} color={th.p.primary} size={th.fs(28)} />}
              <View style={{ flex: 1, gap: 4 }}>
                <T bold>{requestTitle(r, lang)}</T>
                <StatusChip r={r} lang={lang} />
              </View>
              <T v="caption" muted>
                {ago(r.createdAt)}
              </T>
            </View>
            {v.hint && r.status !== 'acknowledged' && (
              <T v="caption" muted>
                {v.hint}
              </T>
            )}
            {r.status === 'acknowledged' && <T bold>“{replyText(r, lang)}”</T>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.sm }}>
              {r.status === 'failed' && <Btn label={tr('common.retry')} onPress={() => session.retry(r.id)} icon={(c, s) => <RotateCcw color={c} size={s} />} />}
              {(r.status === 'failed' || r.waitingForConnection) && <Btn variant="secondary" label={tr('requests.showCard')} onPress={() => nav.open({ kind: 'showCard', needId: r.needId })} />}
              {r.status === 'acknowledged' && <Btn variant="success" label={tr('requests.thanks')} onPress={() => session.thank(r.id)} />}
              {(r.status === 'pending' || r.status === 'sent' || r.status === 'acknowledged') && (
                <Btn variant="ghost" label={tr('requests.cancel')} onPress={() => session.cancel(r.id)} />
              )}
            </View>
          </Card>
        );
      })}
      {requests.some((r) => r.status === 'closed' || r.status === 'cancelled') && (
        <Btn variant="ghost" label={`${tr('common.close')}: ${tr('status.closed')} / ${tr('status.cancelled')}`} onPress={() => session.clearFinished()} />
      )}
    </ScrollView>
  );
}

// ── Show to crew ──────────────────────────────────────────────────────────
export function CardTab({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  return (
    <ScrollView contentContainerStyle={{ padding: th.space.lg, gap: th.space.md }}>
      <T v="heading" role="header">
        {tr('card.title')}
      </T>
      <T muted>{tr('card.hint')}</T>
      {CATEGORIES.map((c) => (
        <View key={c} style={{ gap: th.space.sm }}>
          <T v="title" role="header">
            {localized(CATEGORY_LABELS[c], lang)}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.sm }}>
            {needsInCategory(c).map((n) => (
              <Pressable
                key={n.id}
                onPress={() => nav.open({ kind: 'showCard', needId: n.id })}
                accessibilityRole="button"
                accessibilityLabel={`${needLabel(n, lang)}. ${tr('requests.showCard')}`}
                style={({ pressed }) => ({
                  flexBasis: '30%',
                  flexGrow: 1,
                  minHeight: 96,
                  borderRadius: th.radius.md,
                  borderWidth: 2,
                  borderColor: pressed ? th.p.primary : th.p.border,
                  backgroundColor: th.p.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: th.space.sm,
                  gap: 4,
                })}
              >
                <NeedIcon name={n.icon} color={th.p.primary} size={th.fs(30)} />
                <Text maxFontSizeMultiplier={1.4} style={{ color: th.p.text, fontWeight: '700', fontSize: th.fs(14), textAlign: 'center' }}>
                  {needLabel(n, lang)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ── Flight: safety pictures, captions, arrival help ───────────────────────
export function FlightTab({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  const [step, setStep] = useState(0);
  const announcements = useSession(session, (s) => s.announcements);
  const profile = useSession(session, (s) => s.profile);
  useEffect(() => session.markAnnouncementsSeen(), [announcements]);
  const s = SAFETY_STEPS[step]!;
  return (
    <ScrollView contentContainerStyle={{ padding: th.space.lg, gap: th.space.lg }}>
      <View style={{ gap: th.space.sm }}>
        <T v="heading" role="header">
          {tr('captions.title')}
        </T>
        {announcements.length === 0 ? (
          <T muted>{tr('captions.empty')}</T>
        ) : (
          announcements.slice(0, 5).map((a) => {
            const cap = captionOf(a, lang);
            if (!cap) return null;
            return (
              <Card key={a.id} accent={cap.safety ? th.p.primary : undefined}>
                <View style={{ flexDirection: 'row', gap: th.space.md, alignItems: 'flex-start' }}>
                  <NeedIcon name={cap.icon} color={th.p.primary} size={th.fs(26)} />
                  <View style={{ flex: 1 }}>
                    <T v="caption" muted>
                      {ago(a.at)}
                      {cap.sender ? ` · ${tr(cap.sender === 'captain' ? 'announce.captain' : 'announce.crew')}` : ''}
                    </T>
                    <T v="bodyLarge">{cap.text}</T>
                  </View>
                </View>
              </Card>
            );
          })
        )}
        <T v="caption" muted>
          {tr('captions.needsConnection')}
        </T>
      </View>

      <View style={{ gap: th.space.sm }}>
        <T v="heading" role="header">
          {tr('safety.title')}
        </T>
        <T v="caption" muted>
          {tr('safety.sample')}
        </T>
        <Card accent={th.p.navy}>
          <View accessible accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: th.space.sm }}>
            <NeedIcon name={s.icon} color={th.hc ? th.p.primary : th.p.navy} size={96} strokeWidth={1.75} />
            <T v="caption" muted>
              {tr('safety.step', { n: step + 1, total: SAFETY_STEPS.length })}
            </T>
            <T v="title" center>
              {localized(s.title, lang)}
            </T>
            <T v="bodyLarge" center>
              {localized(s.body, lang)}
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: th.space.sm }}>
            <Btn style={{ flex: 1 }} variant="ghost" label={tr('safety.prev')} disabled={step === 0} onPress={() => setStep(step - 1)} icon={(c, z) => <ChevronLeft color={c} size={z} />} />
            <Btn style={{ flex: 1 }} label={tr('safety.next')} disabled={step === SAFETY_STEPS.length - 1} onPress={() => setStep(step + 1)} icon={(c, z) => <ChevronRight color={c} size={z} />} />
          </View>
        </Card>
      </View>

      <View style={{ gap: th.space.sm }}>
        <T v="heading" role="header">
          {tr('arrival.title')}
        </T>
        <T muted>{tr('arrival.hint')}</T>
        <Btn
          variant="secondary"
          big
          label={needLabel(getNeed('wheelchair_arrival')!, lang)}
          onPress={() => nav.open({ kind: 'review', needId: 'wheelchair_arrival', source: 'tap' })}
          icon={(c, z) => <Accessibility color={c} size={z} />}
        />
        {profile?.tags.includes('medical') && (
          <Btn variant="ghost" label={needLabel(getNeed('unwell')!, lang)} onPress={() => nav.open({ kind: 'review', needId: 'unwell', source: 'tap' })} />
        )}
      </View>
    </ScrollView>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────
export function SettingsTab({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const tr = translator(lang);
  const profile = useSession(session, (s) => s.profile);
  const prefs = useSession(session, (s) => s.prefs);
  const [seat, setSeat] = useState(profile?.seat ?? '');
  const [seatError, setSeatError] = useState(false);
  const [name, setName] = useState(profile?.name ?? '');
  if (!profile) return null;

  const toggleChannel = (c: ReplyChannel, on: boolean) => {
    const next = on ? [...new Set([...prefs.replyChannels, c])] : prefs.replyChannels.filter((x) => x !== c);
    session.setPrefs({ replyChannels: next.includes('text') ? next : ['text', ...next] });
  };

  const saveSeat = () => {
    if (!isValidSeat(seat)) return setSeatError(true);
    session.updateProfile({ seat: normalizeSeat(seat) });
    setSeat(normalizeSeat(seat));
  };

  const reset = () => {
    const doIt = () => void clearStoredSession();
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (globalThis.confirm?.(tr('settings.resetConfirm')) ?? true) doIt();
      return;
    }
    Alert.alert(tr('settings.reset'), tr('settings.resetConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('settings.reset'), style: 'destructive', onPress: doIt },
    ]);
  };

  const section = (title: string) => (
    <T v="title" role="header" style={{ marginTop: th.space.md }}>
      {title}
    </T>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: th.space.lg, gap: th.space.md }} keyboardShouldPersistTaps="handled">
      <T v="heading" role="header">
        {tr('settings.title')}
      </T>

      {section(tr('settings.language'))}
      <Segmented
        label={tr('settings.language')}
        value={profile.lang}
        onChange={(l) => session.updateProfile({ lang: l })}
        options={LANGUAGES.map((l) => ({ value: l.code, label: l.nativeName, a11y: `${l.nativeName}, ${l.englishName}` }))}
      />

      {section(tr('settings.textSize'))}
      <Segmented
        label={tr('settings.textSize')}
        value={prefs.textScale}
        onChange={(v) => session.setPrefs({ textScale: v })}
        options={[
          { value: 1 as const, label: 'A', a11y: '100%' },
          { value: 1.25 as const, label: 'A+', a11y: '125%' },
          { value: 1.5 as const, label: 'A++', a11y: '150%' },
        ]}
      />
      <ToggleRow label={tr('settings.highContrast')} value={prefs.highContrast} onChange={(v) => session.setPrefs({ highContrast: v })} />
      <ToggleRow label={tr('settings.reduceMotion')} value={prefs.reduceMotion} onChange={(v) => session.setPrefs({ reduceMotion: v })} />

      {section(tr('settings.replies'))}
      <T v="caption" muted>
        {tr('settings.repliesHint')}
      </T>
      <ToggleRow label={tr('channel.voice')} value={prefs.replyChannels.includes('voice')} onChange={(v) => toggleChannel('voice', v)} />
      {prefs.replyChannels.includes('voice') && <VoiceCheck lang={lang} inSettings />}
      <ToggleRow label={tr('channel.buzz')} value={prefs.replyChannels.includes('buzz')} onChange={(v) => toggleChannel('buzz', v)} />

      {section(tr('settings.needs'))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.sm }}>
        {PROFILE_TAGS.map((tag) => {
          const on = profile.tags.includes(tag);
          return (
            <Pressable
              key={tag}
              onPress={() => session.updateProfile({ tags: on ? profile.tags.filter((x) => x !== tag) : [...profile.tags, tag] })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{
                minHeight: th.minTouch,
                paddingHorizontal: th.space.lg,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: on ? th.p.primary : th.p.border,
                backgroundColor: on ? th.p.primarySoft : th.p.surface,
                justifyContent: 'center',
              }}
            >
              <T bold color={on ? th.p.primary : th.p.text}>
                {tr(`tag.${tag}`)}
              </T>
            </Pressable>
          );
        })}
      </View>
      <ToggleRow label={tr('settings.share')} value={profile.shareTagsWithCrew} onChange={(v) => session.updateProfile({ shareTagsWithCrew: v })} />

      {section(tr('common.seat'))}
      <View style={{ flexDirection: 'row', gap: th.space.sm }}>
        <TextInput
          value={seat}
          onChangeText={(v) => {
            setSeat(v.toUpperCase());
            setSeatError(false);
          }}
          autoCapitalize="characters"
          maxLength={4}
          accessibilityLabel={tr('common.seat')}
          style={{ flex: 1, minHeight: th.minTouch, borderWidth: 2, borderColor: seatError ? th.p.danger : th.p.border, borderRadius: th.radius.md, paddingHorizontal: th.space.lg, fontSize: th.fs(20), fontWeight: '700', color: th.p.text, backgroundColor: th.p.surface }}
        />
        <Btn label={tr('common.continue')} onPress={saveSeat} disabled={normalizeSeat(seat) === profile.seat} />
      </View>
      {seatError && (
        <T color={th.p.danger} role="alert">
          {tr('onboard.seatInvalid')}
        </T>
      )}

      {section(tr('onboard.name'))}
      <TextInput
        value={name}
        onChangeText={setName}
        onEndEditing={() => session.updateProfile({ name: sanitizeName(name) || undefined })}
        onBlur={() => session.updateProfile({ name: sanitizeName(name) || undefined })}
        maxLength={40}
        accessibilityLabel={tr('onboard.name')}
        accessibilityHint={tr('onboard.nameHint')}
        style={{ minHeight: th.minTouch, borderWidth: 2, borderColor: th.p.border, borderRadius: th.radius.md, paddingHorizontal: th.space.lg, fontSize: th.fs(th.t.body), color: th.p.text, backgroundColor: th.p.surface }}
      />
      <T v="caption" muted>
        {tr('onboard.nameHint')}
      </T>

      <Btn variant="danger" label={tr('settings.reset')} onPress={reset} icon={(c, s) => <Trash color={c} size={s} />} style={{ marginTop: th.space.lg }} />

      <PrototypeControls />
    </ScrollView>
  );
}

/** PROTOTYPE-ONLY controls, kept in English and visually separated from passenger settings. */
function PrototypeControls() {
  const th = useTheme();
  const hub = useHubUrl();
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => link.onChange(force), []);
  const crew = link.simulatedCrew;
  return (
    <View style={{ marginTop: th.space.xl, borderWidth: 2, borderStyle: 'dashed', borderColor: th.p.textMuted, borderRadius: th.radius.md, padding: th.space.lg, gap: th.space.md }}>
      <Text accessibilityRole="header" style={{ fontWeight: '800', color: th.p.text, fontSize: 18 }} accessibilityLanguage="en">
        Prototype controls · SIMULATION
      </Text>
      <Text style={{ color: th.p.textMuted, fontSize: 14 }}>
        {hub
          ? `Connected to the cabin hub (${hub}): real crew console, offline speech recognition and booking lookup. Not connected to any aircraft system.`
          : 'No cabin hub: the crew tablet, speech recognition and booking data are simulated on this phone. Nothing here is connected to an aircraft.'}
      </Text>
      <HubAddress />
      <Text style={{ color: th.p.text, fontWeight: '700' }}>Cabin network</Text>
      <Segmented<NetworkCondition>
        label="Cabin network"
        value={link.networkCondition}
        onChange={(v) => link.setCondition(v)}
        options={[
          { value: 'good', label: 'Good' },
          { value: 'unstable', label: 'Unstable' },
          { value: 'offline', label: 'Offline' },
        ]}
      />
      <Text style={{ color: th.p.text, fontWeight: '700' }}>Crew tablet</Text>
      <Segmented<CrewMode>
        label="Crew tablet"
        value={link.mode}
        onChange={(v) => link.setMode(v)}
        options={[
          ...(hub ? [{ value: 'hub' as const, label: 'Cabin hub (real)' }] : []),
          { value: 'simulated', label: 'Simulated (auto-reply)' },
          ...(DemoCabinLink.consoleSupported() ? [{ value: 'console' as const, label: 'Crew console tab' }] : []),
        ]}
      />
      {link.mode === 'console' && (
        <Text style={{ color: th.p.textMuted }}>Open the crew console (#/crew) in another browser tab. Without it nobody confirms requests, so they stay pending and then fail.</Text>
      )}
      <Text style={{ color: th.p.text, fontWeight: '700' }}>Simulated speech result</Text>
      <SpeechMode />
      {crew && (
        <>
          <Text style={{ color: th.p.text, fontWeight: '700' }}>Simulated crew: send an announcement</Text>
          {ANNOUNCEMENTS.slice(0, 4).map((a) => (
            <Btn key={a.id} variant="ghost" label={a.text.en.split('.')[0]!} onPress={() => crew.announce(a.id)} icon={(c, s) => <Megaphone color={c} size={s} />} />
          ))}
        </>
      )}
    </View>
  );
}

function SpeechMode() {
  const [mode, setMode] = useState<UtteranceMode>(mockSpeech.mode);
  return (
    <Segmented<UtteranceMode>
      label="Simulated speech result"
      value={mode}
      onChange={(v) => {
        mockSpeech.mode = v;
        setMode(v);
      }}
      options={[
        { value: 'alternate', label: 'Alternate' },
        { value: 'noisy', label: 'Noisy (ask)' },
        { value: 'clear', label: 'Clear' },
      ]}
    />
  );
}

/** Native builds: type the cabin hub address shown by `npm run demo` (web builds use the page origin automatically). */
function HubAddress() {
  const th = useTheme();
  const hub = useHubUrl();
  const [value, setValue] = useState(hub ?? 'https://');
  const [state, setState] = useState<'idle' | 'checking' | 'failed'>('idle');
  const connect = async () => {
    setState('checking');
    setState((await connectHub(value.trim())) ? 'idle' : 'failed');
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: th.p.text, fontWeight: '700' }}>Cabin hub address</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Cabin hub address"
        placeholder="https://192.168.1.20:8443"
        placeholderTextColor={th.p.textMuted}
        style={{ minHeight: 48, borderWidth: 2, borderColor: state === 'failed' ? th.p.danger : th.p.border, borderRadius: th.radius.md, paddingHorizontal: 12, color: th.p.text, backgroundColor: th.p.surface }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn style={{ flex: 1 }} variant="secondary" label={state === 'checking' ? 'Connecting…' : 'Connect'} onPress={() => void connect()} disabled={state === 'checking'} />
        {hub && <Btn style={{ flex: 1 }} variant="ghost" label="Disconnect" onPress={() => void forgetHub()} />}
      </View>
      {state === 'failed' && <Text style={{ color: th.p.danger }}>No HearMe hub answered at that address.</Text>}
    </View>
  );
}
