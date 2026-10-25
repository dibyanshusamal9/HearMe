import { captionOf, findLanguage, isRtl, type LangCode, languageInfo, translator, installModeBridge } from '@hearme/shared';
import { useCrewMode, useSession } from '@hearme/shared/react';
import { StatusBar } from 'expo-status-bar';
import Hand from 'lucide-react-native/icons/hand';
import House from 'lucide-react-native/icons/house';
import ListChecks from 'lucide-react-native/icons/list-checks';
import Megaphone from 'lucide-react-native/icons/megaphone';
import Plane from 'lucide-react-native/icons/plane';
import Settings from 'lucide-react-native/icons/settings';
import X from 'lucide-react-native/icons/x';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ConnectionPill, T } from './components/ui';
import { NavContext, useNav, type Nav, type Overlay, type Tab } from './nav';
import { clearStoredSession, connectHub, inStage, link as cabinLink, loadSession, registerOfflineCache, replyVoice, session, startAutosave, unlockVoiceOnFirstTap, watchForHub } from './runtime';
import { seatFromUrl } from './screens/Onboarding';
import { Home } from './screens/Home';
import { Onboarding } from './screens/Onboarding';
import { Overlays } from './screens/Overlays';
import { CardTab, FlightTab, RequestsTab, SettingsTab } from './screens/Tabs';
import { ThemeProvider, useTheme } from './theme';
import { ModeToggle } from './components/ModeToggle';

export default function App() {
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const stopModeBridge = Platform.OS === 'web' ? installModeBridge() : () => undefined;
    registerOfflineCache();
    unlockVoiceOnFirstTap();
    if (inStage) {
      // Demo stage only: "Judge, try it" switches this phone to the judge's language
      // (the hub tells Whisper which language to expect).
      const w = globalThis as unknown as { __hearmeStory?: Record<string, unknown> };
      w.__hearmeStory = {
        ...w.__hearmeStory,
        setLanguage: (lang: LangCode) => session.updateProfile({ lang }),
      };
    }
    // Find the cabin hub first (quick), so onboarding can read the booking for this seat.
    // On the demo stage every load is a new passenger: the story, "Run again" and Reset all start at the booking screen.
    const restore = inStage ? clearStoredSession(false).then(() => 'fresh' as const) : loadSession();
    Promise.all([restore, connectHub().catch(() => false)]).then(async ([r]) => {
      if (r === 'corrupt') setNotice('Saved data could not be read and was cleared.');
      // Opened from another seat's QR code: a new passenger, so start fresh.
      const qr = seatFromUrl();
      const saved = session.getState().profile?.seat;
      if (qr && saved && qr !== saved) await clearStoredSession();
      setReady(true);
    });
    const stopWatching = watchForHub();
    const stopAutosave = startAutosave();
    return () => {
      stopModeBridge();
      stopWatching();
      stopAutosave();
    };
  }, []);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {ready ? <Root startupNotice={notice} /> : <Splash />}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Splash() {
  const th = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: th.p.bg }} accessibilityLabel="Loading">
      <ActivityIndicator size="large" color={th.p.primary} />
    </View>
  );
}

function Root({ startupNotice }: { startupNotice: string | null }) {
  const th = useTheme();
  const profile = useSession(session, (s) => s.profile);
  const [tab, setTab] = useState<Tab>('home');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const close = useCallback(() => setOverlay(null), []);
  const nav = useMemo<Nav>(() => ({ tab, setTab, overlay, open: setOverlay, close }), [tab, overlay, close]);

  // Android back: close an overlay first, then return to Home, then let the OS handle it.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlay) return close(), true;
      if (tab !== 'home') return setTab('home'), true;
      return false;
    });
    return () => sub.remove();
  }, [overlay, tab, close]);

  // Reset navigation when the profile is cleared.
  useEffect(() => {
    if (!profile) {
      setTab('home');
      setOverlay(null);
    }
  }, [profile]);

  if (!profile) {
    return (
      <>
        <StatusBar style={th.hc ? 'light' : 'dark'} />
        <Onboarding />
      </>
    );
  }

  const lang = profile.lang;
  return (
    <NavContext.Provider value={nav}>
      <StatusBar style="light" />
      <SafeAreaView edges={['top']} style={{ backgroundColor: th.p.navy }} />
      <View style={{ flex: 1, backgroundColor: th.p.bg, direction: isRtl(lang) ? 'rtl' : 'ltr' }} accessibilityLanguage={languageInfo(lang).bcp47}>
        <Header lang={lang} seat={profile.seat} />
        {startupNotice && <T v="caption" muted style={{ padding: 8 }}>{startupNotice}</T>}
        <CaptionToast lang={lang} />
        <View style={{ flex: 1 }}>
          {tab === 'home' && <Home lang={lang} />}
          {tab === 'requests' && <RequestsTab lang={lang} />}
          {tab === 'card' && <CardTab lang={lang} />}
          {tab === 'flight' && <FlightTab lang={lang} />}
          {tab === 'settings' && <SettingsTab lang={lang} />}
        </View>
        <TabBar lang={lang} />
      </View>
      <Overlays lang={lang} seat={profile.seat} />
    </NavContext.Provider>
  );
}

function Header({ lang, seat }: { lang: LangCode; seat: string }) {
  const th = useTheme();
  const link = useSession(session, (s) => s.link);
  const crewMode = useCrewMode(cabinLink);
  const tr = translator(lang);
  const nav = useNav();
  return (
    <View style={{ backgroundColor: th.p.navy, paddingHorizontal: th.space.lg, paddingVertical: th.space.sm, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: th.space.sm, borderBottomWidth: th.hc ? 2 : 0, borderColor: th.p.border }}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={{ color: th.p.onNavy, fontSize: th.fs(16) }}>
        {tr('common.seat')} <Text style={{ fontWeight: '800', fontSize: th.fs(20) }}>{seat}</Text>
      </Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <ConnectionPill status={link} lang={lang} demo={crewMode === 'simulated'} />
      </View>
      <Pressable
        onPress={() => nav.setTab('settings')}
        accessibilityRole="button"
        accessibilityLabel={`${tr('settings.language')}: ${languageInfo(lang).nativeName}`}
        style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text maxFontSizeMultiplier={1.3} style={{ color: th.p.onNavy, fontWeight: '700', fontSize: th.fs(14) }}>
          {languageInfo(lang).nativeName}
        </Text>
      </Pressable>
      <View style={{ flexBasis: '100%', alignItems: 'flex-end' }}><ModeToggle /></View>
    </View>
  );
}

function CaptionToast({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const nav = useNav();
  const a = useSession(session, (s) => s.announcements.find((x) => x.id === s.unseenAnnouncement));
  const voice = useSession(session, (s) => s.prefs.replyChannels.includes('voice'));
  const cap = a ? captionOf(a, lang) : undefined;
  // Read every announcement aloud in the passenger's language, when they asked for voice.
  useEffect(() => {
    if (!cap || !voice) return;
    replyVoice.speak(cap.text, findLanguage(cap.lang)?.bcp47 ?? cap.lang);
    return () => replyVoice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id, voice, cap?.text, cap?.lang]);
  if (!a || !cap) return null;
  const tr = translator(lang);
  const bg = cap.safety ? th.p.primary : th.p.navy;
  const fg = cap.safety ? th.p.onPrimary : th.p.onNavy;
  return (
    <View
      accessibilityLiveRegion={cap.safety ? 'assertive' : 'polite'}
      style={{ margin: th.space.md, marginBottom: 0, backgroundColor: bg, borderRadius: th.radius.md, flexDirection: 'row', alignItems: 'center', paddingLeft: th.space.md, borderWidth: th.hc ? 2 : 0, borderColor: th.p.border }}
    >
      <Megaphone color={fg} size={22} />
      <Pressable
        onPress={() => {
          nav.setTab('flight');
          session.markAnnouncementsSeen();
        }}
        accessibilityRole="button"
        style={{ flex: 1, padding: th.space.md, minHeight: th.minTouch }}
      >
        <Text style={{ color: fg, fontSize: th.fs(12), opacity: 0.9 }}>{cap.sender ? tr(cap.sender === 'captain' ? 'announce.captain' : 'announce.crew') : tr('captions.title')}</Text>
        <Text style={{ color: fg, fontSize: th.fs(th.t.body), fontWeight: '700' }}>{cap.text}</Text>
      </Pressable>
      <Pressable onPress={() => session.markAnnouncementsSeen()} accessibilityRole="button" accessibilityLabel={tr('common.close')} style={{ width: th.minTouch, height: th.minTouch, alignItems: 'center', justifyContent: 'center' }}>
        <X color={fg} size={22} />
      </Pressable>
    </View>
  );
}

function TabBar({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  const open = useSession(session, (s) => s.requests.filter((r) => r.status === 'pending' || r.status === 'sent' || r.status === 'acknowledged' || r.status === 'failed').length);
  const unseen = useSession(session, (s) => !!s.unseenAnnouncement);
  const tabs: { id: Tab; label: string; Icon: typeof House; badge?: number | boolean }[] = [
    { id: 'home', label: tr('nav.home'), Icon: House },
    { id: 'requests', label: tr('nav.requests'), Icon: ListChecks, badge: open || undefined },
    { id: 'card', label: tr('nav.card'), Icon: Hand },
    { id: 'flight', label: tr('nav.flight'), Icon: Plane, badge: unseen },
    { id: 'settings', label: tr('nav.settings'), Icon: Settings },
  ];
  return (
    <SafeAreaView edges={['bottom']} style={{ backgroundColor: th.p.surface, borderTopWidth: th.hc ? 2 : 1, borderColor: th.p.border }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row' }}>
        {tabs.map(({ id, label, Icon, badge }) => {
          const on = nav.tab === id;
          const color = on ? th.p.primary : th.p.textMuted;
          return (
            <Pressable
              key={id}
              onPress={() => nav.setTab(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={typeof badge === 'number' ? `${label}, ${badge}` : label}
              style={{ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 6 }}
            >
              <View>
                <Icon color={color} size={26} strokeWidth={on ? 2.5 : 2} />
                {badge ? (
                  <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: th.p.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                    {typeof badge === 'number' && <Text style={{ color: th.p.onPrimary, fontSize: 11, fontWeight: '800' }}>{badge}</Text>}
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ color, fontSize: th.fs(12), fontWeight: on ? '800' : '600' }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
