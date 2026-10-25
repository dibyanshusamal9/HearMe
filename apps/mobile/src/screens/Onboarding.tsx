import { JalBrand } from '../components/JalBrand';
import {
  LANGUAGES,
  languageName,
  PROFILE_TAGS,
  isValidSeat,
  languageInfo,
  lookupBookingOnHub,
  mockBooking,
  normalizeSeat,
  sanitizeName,
  translator,
  type LangCode,
  type PassengerProfile,
  type ProfileTag,
} from '@hearme/shared';
import Check from 'lucide-react-native/icons/check';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ScanQrCode from 'lucide-react-native/icons/scan-qr-code';
import Ticket from 'lucide-react-native/icons/ticket';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, T, ToggleRow } from '../components/ui';
import { getHubUrl, session } from '../runtime';
import { useTheme } from '../theme';

type Step = 'booking' | 'language' | 'seat' | 'needs';

/** Seat from the QR code on the seat (`?seat=23C` in the URL the phone camera opens). */
export function seatFromUrl(): string | null {
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
  const raw = new URLSearchParams(search).get('seat');
  return raw && isValidSeat(raw) ? normalizeSeat(raw) : null;
}

/**
 * Three short steps: language → seat → optional needs. When the seat QR code
 * opened the app, the seat is already known and the booking (language and
 * needs saved at check-in) is offered first.
 */
export function Onboarding() {
  const th = useTheme();
  const [qrSeat] = useState(seatFromUrl);
  const [found, setFound] = useState<PassengerProfile | null>(null);
  const [step, setStep] = useState<Step>('language');
  const [scanHint, setScanHint] = useState(false);
  const [lang, setLang] = useState<LangCode>('en');
  const [speechLang, setSpeechLang] = useState<string | undefined>();
  /**
   * Extra keyword-only drafts the hub has (data/languages/*.json). Every
   * language HearMe really offers is in LANGUAGES, bundled with the app, so
   * the picker is complete with no hub and no network — these only add
   * languages someone is trying out on this particular hub.
   */
  const [drafts, setDrafts] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    const hub = getHubUrl();
    if (!hub) return;
    fetch(`${hub}/api/languages`)
      .then((r) => r.json() as Promise<{ extraPacks?: { code: string; name: string; speech: boolean }[] }>)
      .then((d) => setDrafts((d.extraPacks ?? []).filter((p) => p.speech)))
      .catch(() => undefined);
  }, []);
  const [seat, setSeat] = useState(qrSeat ?? '');
  const [seatError, setSeatError] = useState(false);
  const [booking, setBooking] = useState<'idle' | 'loading' | 'error'>('idle');
  const [name, setName] = useState('');
  const [tags, setTags] = useState<ProfileTag[]>([]);
  const [share, setShare] = useState(true);
  const tr = translator(lang);

  // The seat QR opened the app: look up this seat's booking on the cabin hub.
  useEffect(() => {
    const hub = getHubUrl();
    if (!qrSeat || !hub) return;
    lookupBookingOnHub(hub, qrSeat).then((p) => {
      if (p) {
        setFound(p);
        setLang(p.lang);
        setStep('booking');
      }
    });
  }, [qrSeat]);

  const useBooking = async () => {
    setBooking('loading');
    try {
      const hub = getHubUrl();
      const s = isValidSeat(seat) ? normalizeSeat(seat) : qrSeat;
      // Real lookup on the hub when we know the seat; otherwise the labelled example passenger.
      const p = hub && s ? await lookupBookingOnHub(hub, s) : await mockBooking.lookup();
      if (p) session.setProfile(p);
      else setBooking('error');
    } catch {
      setBooking('error');
    }
  };

  const confirmSeat = () => {
    if (!isValidSeat(seat)) {
      setSeatError(true);
      return;
    }
    setSeat(normalizeSeat(seat));
    setStep('needs');
  };



  const finish = () => {
    const clean = sanitizeName(name);
    session.setProfile({ lang, seat: normalizeSeat(seat), name: clean || undefined, tags, shareTagsWithCrew: share, ...(speechLang ? { speechLang } : {}) });
  };

  const back = (to: Step) => (
    <Pressable
      onPress={() => setStep(to)}
      accessibilityRole="button"
      accessibilityLabel={tr('common.back')}
      style={{ minHeight: th.minTouch, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
    >
      <ChevronLeft color={th.p.text} size={24} />
      <T bold>{tr('common.back')}</T>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: th.p.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: th.space.xl, gap: th.space.lg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {step === 'booking' && found && (
            <>
              <View style={{ gap: th.space.xs, marginTop: th.space.lg }}>
                <JalBrand />
              </View>
              <View style={{ backgroundColor: th.p.surface, borderRadius: th.radius.lg, borderWidth: 2, borderColor: th.p.primary, padding: th.space.lg, gap: th.space.sm }}>
                <T v="heading" role="header">
                  {translator(found.lang)('onboard.bookingFound')}
                </T>
                <T v="title">
                  {found.name ? `${found.name} · ` : ''}
                  {translator(found.lang)('common.seat')} {found.seat}
                </T>
                <T v="bodyLarge">{found.speechLang ? `${languageName(found.speechLang)} · screens in ${languageInfo(found.lang).englishName}` : languageInfo(found.lang).nativeName}</T>
                {found.tags.length > 0 && <T muted>{found.tags.map((x) => translator(found.lang)(`tag.${x}`)).join(' · ')}</T>}
              </View>
              <View style={{ flex: 1 }} />
              <Btn big label={translator(found.lang)('onboard.useThis')} onPress={() => session.setProfile(found)} />
              <Btn variant="ghost" label={translator(found.lang)('onboard.chooseLanguage')} onPress={() => setStep('language')} />
            </>
          )}

          {step === 'language' && (
            <>
              <View style={{ gap: th.space.xs, marginTop: th.space.lg }}>
                <JalBrand />
                <T muted>{translator('en')('app.tagline')}</T>
              </View>
              <CyclingHeading />
              <View accessibilityRole="radiogroup" style={{ gap: th.space.sm }}>
                {LANGUAGES.map((l) => {
                  const hint = l.englishName;
                  return (
                    <Pressable
                      key={l.code}
                      onPress={() => {
                        setLang(l.code);
                        setSpeechLang(undefined);
                        setStep(qrSeat ? 'needs' : 'seat');
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: lang === l.code }}
                      accessibilityLabel={`${l.nativeName}, ${hint}`}
                      accessibilityLanguage={l.bcp47}
                      style={({ pressed }) => ({
                        minHeight: 64,
                        borderRadius: th.radius.md,
                        borderWidth: 2,
                        borderColor: pressed ? th.p.primary : th.p.border,
                        backgroundColor: pressed ? th.p.primarySoft : th.p.surface,
                        paddingHorizontal: th.space.lg,
                        paddingVertical: th.space.sm,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: th.space.sm,
                      })}
                    >
                      <T v="title" lang={l.bcp47} style={{ flexShrink: 1 }}>
                        {l.nativeName}
                      </T>
                      <T muted style={{ flexShrink: 1, textAlign: 'right' }}>
                        {hint}
                      </T>
                    </Pressable>
                  );
                })}
                {drafts.map((p) => (
                  <Pressable
                    key={p.code}
                    onPress={() => {
                      setLang('en');
                      setSpeechLang(p.code);
                      setStep(qrSeat ? 'needs' : 'seat');
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: speechLang === p.code }}
                    accessibilityLabel={`${p.name}, understood; screens in English`}
                    style={{ minHeight: 64, borderRadius: th.radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: th.p.border, padding: th.space.md, justifyContent: 'center' }}
                  >
                    <T bold>{p.name}</T>
                    <T muted>Being tried on this hub · speak or type only, screens in English</T>
                  </Pressable>
                ))}
              </View>
              <View style={{ gap: th.space.sm, marginTop: th.space.md }}>
                <Btn
                  variant="ghost"
                  label={booking === 'loading' ? '…' : translator('en')('onboard.useBooking')}
                  disabled={booking === 'loading'}
                  onPress={useBooking}
                  icon={(c, s) => (booking === 'loading' ? <ActivityIndicator color={c} /> : <Ticket color={c} size={s} />)}
                  hint={getHubUrl() && (qrSeat || isValidSeat(seat)) ? 'Looks up the language and needs saved with this seat’s booking.' : 'No cabin hub: loads the example passenger (Hindi, seat 23C, senior, hard of hearing).'}
                />
                {booking === 'error' && (
                  <T color={th.p.danger} role="alert">
                    Booking details could not be loaded. Please choose your language above.
                  </T>
                )}
              </View>
            </>
          )}

          {step === 'seat' && (
            <>
              {back('language')}
              <T v="heading" role="header">
                {tr('onboard.seatTitle')}
              </T>
              <T muted>{tr('onboard.seatHint')}</T>
              <Btn variant="secondary" big label={tr('onboard.scanQr')} onPress={() => setScanHint(true)} icon={(c, s) => <ScanQrCode color={c} size={s} />} />
              {scanHint && (
                <T muted live="polite">
                  {tr('onboard.scanHint')}
                </T>
              )}
              <View style={{ gap: th.space.xs }}>
                <Text nativeID="seatLabel" style={{ color: th.p.text, fontSize: th.fs(th.t.body), fontWeight: '700' }}>
                  {tr('common.seat')}
                </Text>
                <TextInput
                  value={seat}
                  onChangeText={(v) => {
                    setSeat(v.toUpperCase());
                    setSeatError(false);
                  }}
                  onSubmitEditing={confirmSeat}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={4}
                  placeholder="23C"
                  placeholderTextColor={th.p.textMuted}
                  accessibilityLabel={tr('common.seat')}
                  accessibilityLabelledBy="seatLabel"
                  accessibilityHint={tr('onboard.seatInvalid')}
                  style={{
                    minHeight: 64,
                    borderWidth: 2,
                    borderColor: seatError ? th.p.danger : th.p.border,
                    borderRadius: th.radius.md,
                    paddingHorizontal: th.space.lg,
                    fontSize: th.fs(28),
                    fontWeight: '700',
                    color: th.p.text,
                    backgroundColor: th.p.surface,
                  }}
                />
                {seatError && (
                  <T color={th.p.danger} role="alert" live="assertive">
                    {tr('onboard.seatInvalid')}
                  </T>
                )}
              </View>
              <View style={{ flex: 1 }} />
              <Btn big label={tr('common.continue')} onPress={confirmSeat} disabled={!seat.trim()} />
            </>
          )}

          {step === 'needs' && (
            <>
              {back(qrSeat ? 'language' : 'seat')}
              {qrSeat && <T muted>{tr('onboard.seatFromQr', { seat: qrSeat })}</T>}
              <T v="heading" role="header">
                {tr('settings.needs')}
              </T>
              <T muted>{tr('onboard.needsHint')}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.sm }}>
                {PROFILE_TAGS.map((tag) => {
                  const on = tags.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => setTags(on ? tags.filter((x) => x !== tag) : [...tags, tag])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={{
                        minHeight: th.minTouch,
                        paddingHorizontal: th.space.lg,
                        borderRadius: 999,
                        borderWidth: 2,
                        borderColor: on ? th.p.primary : th.p.border,
                        backgroundColor: on ? th.p.primarySoft : th.p.surface,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {on && <Check size={20} color={th.p.primary} />}
                      <T bold color={on ? th.p.primary : th.p.text}>
                        {tr(`tag.${tag}`)}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
              <ToggleRow label={tr('settings.share')} value={share} onChange={setShare} />
              <View style={{ gap: th.space.xs }}>
                <T bold>{tr('onboard.name')}</T>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  maxLength={40}
                  accessibilityLabel={tr('onboard.name')}
                  accessibilityHint={tr('onboard.nameHint')}
                  style={{
                    minHeight: th.minTouch,
                    borderWidth: 2,
                    borderColor: th.p.border,
                    borderRadius: th.radius.md,
                    paddingHorizontal: th.space.lg,
                    fontSize: th.fs(th.t.bodyLarge),
                    color: th.p.text,
                    backgroundColor: th.p.surface,
                  }}
                />
                <T v="caption" muted>
                  {tr('onboard.nameHint')}
                </T>
              </View>
              <View style={{ flex: 1 }} />
              <Btn big label={tr('onboard.start')} onPress={finish} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "Choose your language" cycling through every language, one at a time (less clutter than six headings). */
function CyclingHeading() {
  const th = useTheme();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (th.reduceMotion) return;
    const t = setInterval(() => setI((x) => (x + 1) % LANGUAGES.length), 2200);
    return () => clearInterval(t);
  }, [th.reduceMotion]);
  const l = LANGUAGES[i]!;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={LANGUAGES.map((x) => translator(x.code)('onboard.chooseLanguage')).join('. ')} style={{ minHeight: 44, justifyContent: 'center' }}>
      <T v="title" bold lang={l.bcp47}>
        {translator(l.code)('onboard.chooseLanguage')}
      </T>
    </View>
  );
}
