import {
  CATEGORIES,
  CONFIDENCE_THRESHOLD,
  CATEGORY_LABELS,
  CREW_LANG,
  getNeed,
  getPurpose,
  getReply,
  languageInfo,
  needsInCategory,
  requestTitle,
  translator,
  type LangCode,
  type NeedPurpose,
} from '@hearme/shared';
import { useSession } from '@hearme/shared/react';
import Check from 'lucide-react-native/icons/check';
import Heart from 'lucide-react-native/icons/heart';
import HeartPulse from 'lucide-react-native/icons/heart-pulse';
import Lock from 'lucide-react-native/icons/lock';
import Search from 'lucide-react-native/icons/search';
import Type from 'lucide-react-native/icons/type';
import Vibrate from 'lucide-react-native/icons/vibrate';
import Volume2 from 'lucide-react-native/icons/volume-2';
import X from 'lucide-react-native/icons/x';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NeedIcon } from '../components/Icon';
import { Btn, Card, Sheet, T } from '../components/ui';
import { useRouteTranscript } from '../components/Voice';
import { useNav, type Overlay } from '../nav';
import { buzzer, currentSpeech, replyVoice, session } from '../runtime';
import { CareSheet } from './Care';
import { useTheme } from '../theme';

export function Overlays({ lang, seat }: { lang: LangCode; seat: string }) {
  const nav = useNav();
  const o = nav.overlay;
  return (
    <>
      {o?.kind === 'review' && <ReviewSheet lang={lang} o={o} />}
      {o?.kind === 'reviewMany' && <ReviewManySheet lang={lang} o={o} />}
      {o?.kind === 'picker' && <PickerSheet lang={lang} category={o.category} />}
      {o?.kind === 'ask' && <AskSheet lang={lang} o={o} />}
      {o?.kind === 'typed' && <TypedSheet lang={lang} />}
      {o?.kind === 'showCard' && <ShowCard lang={lang} seat={seat} needId={o.needId} />}
      {o?.kind === 'care' && <CareSheet lang={lang} />}
      <ReplyModal lang={lang} />
    </>
  );
}

/** Several requests understood from one sentence: each can be unticked; refused ones are shown crossed out. */
function ReviewManySheet({ lang, o }: { lang: LangCode; o: Extract<Overlay, { kind: 'reviewMany' }> }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  const [on, setOn] = useState(() => new Set(o.items.filter((i) => i.confidence >= CONFIDENCE_THRESHOLD).map((i) => i.needId)));
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setOn((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const send = () => {
    if (!on.size) return;
    let failed = false;
    for (const i of o.items) {
      if (!on.has(i.needId)) continue;
      const res = session.submit({ needId: i.needId, purposeId: i.purposeId, source: o.source, understanding: { confidence: i.confidence, viaPictures: false } });
      if (!res.ok) failed = true;
    }
    if (!failed) {
      nav.close();
      nav.setTab('home');
    } else setError(tr('requests.limit'));
  };
  return (
    <Sheet
      visible
      title={tr('review.many', { n: o.items.length })}
      onClose={nav.close}
      closeLabel={tr('common.close')}
      footer={<Btn big label={tr('review.sendAll', { n: on.size })} onPress={send} />}
    >
      {o.items.map((i) => {
        const need = getNeed(i.needId);
        if (!need) return null;
        const checked = on.has(i.needId);
        return (
          <Pressable
            key={i.needId}
            onPress={() => toggle(i.needId)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={need.label[lang]}
            style={{ flexDirection: 'row', alignItems: 'center', gap: th.space.md, padding: th.space.md, borderRadius: th.radius.md, borderWidth: 2, borderColor: checked ? th.p.primary : th.p.border, backgroundColor: checked ? th.p.primarySoft : th.p.surface }}
          >
            <NeedIcon name={need.icon} color={th.p.primary} size={th.fs(36)} />
            <View style={{ flex: 1 }}>
              <T v="title">{need.label[lang]}</T>
              {i.purposeId && <T muted>{getPurpose(i.purposeId)?.label[lang]}</T>}
            </View>
            <View style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: th.p.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: checked ? th.p.primary : 'transparent' }}>
              {checked && <Check size={20} color="#fff" />}
            </View>
          </Pressable>
        );
      })}
      {o.refused.length > 0 && (
        <View style={{ gap: 4 }}>
          <T bold>{tr('review.notWanted')}</T>
          {o.refused.map((id) => (
            <Text key={id} style={{ color: th.p.textMuted, textDecorationLine: 'line-through', fontSize: th.fs(16) }}>
              {getNeed(id)?.label[lang] ?? id}
            </Text>
          ))}
        </View>
      )}
      {error && (
        <T color={th.p.danger} role="alert">
          {error}
        </T>
      )}
    </Sheet>
  );
}

function ReviewSheet({ lang, o }: { lang: LangCode; o: Extract<Overlay, { kind: 'review' }> }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  const need = getNeed(o.needId);
  const [purpose, setPurpose] = useState<NeedPurpose['id'] | undefined>(o.purposeId);
  const [error, setError] = useState<string | null>(null);
  if (!need) return null;
  const send = () => {
    const res = session.submit({ needId: need.id, purposeId: purpose, source: o.source, understanding: o.understanding });
    if (res.ok) {
      nav.close();
      nav.setTab('home');
    } else if (res.reason === 'duplicate') setError(tr('requests.limit'));
    else setError(tr('status.failed'));
  };
  return (
    <Sheet
      visible
      title={tr('review.title')}
      onClose={nav.close}
      closeLabel={tr('common.close')}
      footer={<Btn big label={tr('review.send')} onPress={send} />}
    >
      <Card accent={th.p.primary} style={{ flexDirection: 'row', alignItems: 'center', gap: th.space.lg }}>
        <View style={{ backgroundColor: th.p.primarySoft, borderRadius: th.radius.md, padding: th.space.md }}>
          <NeedIcon name={need.icon} color={th.p.primary} size={th.fs(48)} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="heading">{need.label[lang]}</T>
          {purpose && <T muted>{getPurpose(purpose)?.label[lang]}</T>}
          {lang !== CREW_LANG && (
            <T v="caption" muted lang="ja-JP">
              {tr('reply.from')}: {requestTitle({ needId: need.id, purposeId: purpose }, CREW_LANG)}
            </T>
          )}
        </View>
      </Card>
      {need.id === 'unwell' && (
        <View style={{ gap: 4 }}>
          <Btn variant="secondary" label={tr('care.open')} onPress={() => nav.open({ kind: 'care' })} icon={(c, z) => <HeartPulse color={c} size={z} />} />
          <T v="caption" muted>
            {tr('care.optional')}
          </T>
        </View>
      )}
      {need.private && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Lock size={20} color={th.p.textMuted} />
          <T muted style={{ flex: 1 }}>
            {tr('review.privateNote')}
          </T>
        </View>
      )}
      {need.purposes && (
        <View style={{ gap: th.space.sm }}>
          <T bold>{tr('review.purpose')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.sm }}>
            {need.purposes.map((p) => {
              const on = purpose === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPurpose(on ? undefined : p)}
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
                    {getPurpose(p)?.label[lang]}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      {error && (
        <T color={th.p.danger} role="alert" live="assertive">
          {error}
        </T>
      )}
    </Sheet>
  );
}

function PickerSheet({ lang, category: initial }: { lang: LangCode; category: (typeof CATEGORIES)[number] }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  const [category, setCategory] = useState(initial);
  return (
    <Sheet visible title={category === 'private' ? tr('home.private') : tr('home.question')} onClose={nav.close} closeLabel={tr('common.close')}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: th.space.sm }} accessibilityRole="tablist">
        {CATEGORIES.map((c) => {
          const on = c === category;
          return (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{
                minHeight: th.minTouch,
                paddingHorizontal: th.space.lg,
                borderRadius: 999,
                borderWidth: 2,
                borderColor: on ? th.p.navy : th.p.border,
                backgroundColor: on ? (th.hc ? th.p.primary : th.p.navy) : th.p.surface,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
              }}
            >
              {c === 'private' && <Lock size={18} color={on ? (th.hc ? '#000' : th.p.onNavy) : th.p.text} />}
              <Text style={{ color: on ? (th.hc ? '#000' : th.p.onNavy) : th.p.text, fontWeight: '700', fontSize: th.fs(th.t.body) }}>{CATEGORY_LABELS[c][lang]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {category === 'private' && <T muted>{tr('review.privateTitle')}</T>}
      <View style={{ gap: th.space.sm }}>
        {needsInCategory(category).map((n) => (
          <Pressable
            key={n.id}
            onPress={() => nav.open({ kind: 'review', needId: n.id, source: 'tap' })}
            accessibilityRole="button"
            accessibilityLabel={n.label[lang]}
            style={({ pressed }) => ({
              minHeight: 72,
              borderRadius: th.radius.md,
              borderWidth: 2,
              borderColor: pressed ? th.p.primary : th.p.border,
              backgroundColor: pressed ? th.p.primarySoft : th.p.surface,
              flexDirection: 'row',
              alignItems: 'center',
              gap: th.space.md,
              paddingHorizontal: th.space.lg,
            })}
          >
            <NeedIcon name={n.icon} color={th.p.primary} size={th.fs(30)} />
            <T v="bodyLarge" bold style={{ flex: 1 }}>
              {n.label[lang]}
            </T>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

/** "Did you mean this?" — the PDF's low-confidence path: ask with pictures. */
function AskSheet({ lang, o }: { lang: LangCode; o: Extract<Overlay, { kind: 'ask' }> }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  useEffect(() => AccessibilityInfo.announceForAccessibility(tr('speech.didYouMean')), [tr]);
  return (
    <Sheet visible title={tr('speech.didYouMean')} onClose={nav.close} closeLabel={tr('common.close')}>
      <View style={{ backgroundColor: th.p.surfaceAlt, borderRadius: th.radius.md, padding: th.space.md }}>
        <T muted style={{ fontStyle: 'italic' }}>
          “{o.transcript}”
        </T>
      </View>
      <View style={{ gap: th.space.sm }}>
        {o.options.map((id, i) => {
          const n = getNeed(id);
          if (!n) return null;
          return (
            <Pressable
              key={id}
              onPress={() =>
                nav.open({
                  kind: 'review',
                  needId: id,
                  purposeId: n.purposes?.includes(o.purposeId!) ? o.purposeId : undefined,
                  source: o.source,
                  understanding: { confidence: o.confidence, viaPictures: true },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={n.label[lang]}
              style={({ pressed }) => ({
                minHeight: 76,
                borderRadius: th.radius.md,
                borderWidth: 2,
                borderColor: i === 0 || pressed ? th.p.primary : th.p.border,
                backgroundColor: i === 0 || pressed ? th.p.primarySoft : th.p.surface,
                flexDirection: 'row',
                alignItems: 'center',
                gap: th.space.md,
                paddingHorizontal: th.space.lg,
              })}
            >
              <View style={{ backgroundColor: th.p.surface, borderRadius: th.radius.sm, padding: 8 }}>
                <NeedIcon name={n.icon} color={th.p.primary} size={th.fs(30)} />
              </View>
              <T v="bodyLarge" bold style={{ flex: 1 }}>
                {n.label[lang]}
              </T>
            </Pressable>
          );
        })}
      </View>
      <Btn
        variant="ghost"
        label={tr('speech.noneCallCrew')}
        onPress={() => nav.open({ kind: 'review', needId: 'call_crew', source: o.source, understanding: { confidence: o.confidence, viaPictures: true } })}
      />
      {o.source === 'speech' && currentSpeech().simulated && (
        <T v="caption" muted>
          {tr('speech.simulated')}
        </T>
      )}
    </Sheet>
  );
}

function TypedSheet({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const nav = useNav();
  const route = useRouteTranscript();
  const tr = translator(lang);
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const find = () => {
    if (!text.trim()) {
      setError(true);
      return;
    }
    void route(text, 'typed', lang);
  };
  return (
    <Sheet visible title={tr('home.typeInstead')} onClose={nav.close} closeLabel={tr('common.close')} footer={<Btn big label={tr('speech.findMatch')} onPress={find} icon={(c, s) => <Search color={c} size={s} />} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Type size={20} color={th.p.textMuted} />
        <T muted style={{ flex: 1 }}>
          {tr('home.question')}
        </T>
      </View>
      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          setError(false);
        }}
        onSubmitEditing={find}
        autoFocus
        multiline
        maxLength={200}
        placeholder={tr('speech.typePlaceholder')}
        placeholderTextColor={th.p.textMuted}
        accessibilityLabel={tr('home.typeInstead')}
        style={{
          minHeight: 120,
          borderWidth: 2,
          borderColor: error ? th.p.danger : th.p.border,
          borderRadius: th.radius.md,
          padding: th.space.lg,
          fontSize: th.fs(th.t.bodyLarge),
          color: th.p.text,
          backgroundColor: th.p.surface,
          textAlignVertical: 'top',
        }}
      />
      {error && (
        <T color={th.p.danger} role="alert" live="assertive">
          {tr('speech.typeEmpty')}
        </T>
      )}
    </Sheet>
  );
}

/** Full-screen card to show a crew member: the digital twin of the printed seat-pocket card. Works offline. */
export function ShowCard({ lang, seat, needId }: { lang: LangCode; seat: string; needId: string }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  const need = getNeed(needId);
  if (!need) return null;
  return (
    <Modal visible animationType="fade" onRequestClose={nav.close} supportedOrientations={['portrait', 'landscape']}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: th.space.xl, gap: th.space.md }}>
          <Text style={{ fontSize: 22, color: '#4A5465' }} accessibilityLanguage="ja-JP">
            座席 Seat <Text style={{ fontWeight: '800', color: '#16202E', fontSize: 30 }}>{seat}</Text>
          </Text>
          <NeedIcon name={need.icon} color="#B93C14" size={140} strokeWidth={1.75} />
          <Text accessibilityRole="header" accessibilityLanguage="ja-JP" style={{ fontSize: 56, fontWeight: '800', color: '#16202E', textAlign: 'center' }} adjustsFontSizeToFit numberOfLines={2}>
            {need.label.ja}
          </Text>
          <Text style={{ fontSize: 30, fontWeight: '700', color: '#16202E', textAlign: 'center' }}>{need.label.en}</Text>
          {lang !== 'en' && lang !== 'ja' && <Text style={{ fontSize: 26, color: '#4A5465', textAlign: 'center' }}>{need.label[lang]}</Text>}
        </View>
        <View style={{ padding: th.space.lg }}>
          <Btn big variant="navy" label={tr('common.close')} onPress={nav.close} icon={(c, s) => <X color={c} size={s} />} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** Crew reply in the passenger's language: on screen, as a picture, read aloud and/or a buzz (per settings). */
function ReplyModal({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const tr = translator(lang);
  const id = useSession(session, (s) => s.replyToShow);
  const r = useSession(session, (s) => s.requests.find((x) => x.id === s.replyToShow));
  const prefs = useSession(session, (s) => s.prefs);
  const text = r?.reply ? getReply(r.reply.replyId).text[lang] : '';
  const voice = prefs.replyChannels.includes('voice');
  const buzz = prefs.replyChannels.includes('buzz');
  const info = languageInfo(lang);
  // What really happened to the spoken reply, so the passenger is never told it played when it did not.
  const [play, setPlay] = useState<'idle' | 'speaking' | 'played' | 'blocked' | 'no-voice'>('idle');
  const say = () => {
    setPlay('speaking');
    replyVoice.speak(text, info.bcp47).done.then((o) => setPlay(o === 'stopped' ? 'idle' : o));
  };
  useEffect(() => {
    if (!id || !text) return;
    AccessibilityInfo.announceForAccessibility(text);
    if (buzz) buzzer.buzz();
    if (voice) say();
    return () => replyVoice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, text, voice, buzz, lang]);
  if (!r?.reply) return null;
  const need = getNeed(r.needId);
  const channels = [
    { key: 'text', on: true, icon: Type, label: tr('channel.text') },
    { key: 'voice', on: voice, icon: Volume2, label: tr('channel.voice') },
    { key: 'buzz', on: buzz, icon: Vibrate, label: tr('channel.buzz') },
  ];
  return (
    <Modal visible transparent animationType={th.reduceMotion ? 'none' : 'fade'} onRequestClose={() => session.dismissReply()}>
      <View style={{ flex: 1, backgroundColor: 'rgba(13,20,36,0.6)', justifyContent: 'center', padding: th.space.lg }}>
        <View accessibilityViewIsModal style={{ backgroundColor: th.p.bg, borderRadius: th.radius.lg, padding: th.space.xl, gap: th.space.lg, borderWidth: 2, borderColor: th.p.border }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: th.p.navy, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: th.p.onNavy, fontWeight: '700' }}>{(r.reply.crewName ?? 'C').slice(0, 1)}</Text>
              </View>
              <T v="caption" muted>
                {r.reply.crewName ? `${r.reply.crewName} · ` : ''}
                {tr('reply.from')}
              </T>
            </View>
            <T v="heading" live="assertive">
              {text}
            </T>
            {voice && play !== 'idle' && (
              <T v="caption" color={play === 'blocked' || play === 'no-voice' ? th.p.warning : th.p.textMuted}>
                {play === 'speaking'
                  ? `🔊 ${tr('voice.speakingIn', { language: info.nativeName })}`
                  : play === 'played'
                    ? `✓ ${tr('voice.spoke', { language: info.nativeName })}`
                    : play === 'blocked'
                      ? tr('voice.blocked')
                      : tr('voice.noVoice', { language: info.nativeName })}
              </T>
            )}
          </Card>
          {need && (
            <View style={{ alignSelf: 'center', backgroundColor: th.p.successSoft, borderRadius: th.radius.lg, padding: th.space.lg }}>
              <NeedIcon name={need.private ? 'hand-helping' : need.icon} color={th.p.success} size={th.fs(56)} />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: th.space.sm }}>
            {channels.map((c) => (
              <Pressable
                key={c.key}
                disabled={c.key !== 'voice' || !voice}
                onPress={say}
                accessibilityRole={c.key === 'voice' ? 'button' : 'text'}
                accessibilityLabel={c.key === 'voice' ? tr('reply.playAgain') : c.label}
                accessibilityState={{ disabled: !c.on }}
                style={{ flex: 1, minHeight: th.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: th.radius.sm, borderWidth: 2, borderColor: th.p.border, opacity: c.on ? 1 : 0.4, backgroundColor: th.p.surface }}
              >
                <c.icon color={th.p.success} size={22} />
                <T v="caption">{c.key === 'voice' && voice ? tr('reply.playAgain') : c.label}</T>
              </Pressable>
            ))}
          </View>
          <Btn big variant="success" label={tr('requests.thanks')} onPress={() => session.thank(r.id)} icon={(c, s) => <Heart color={c} size={s} />} />
          <Btn variant="ghost" label={tr('common.close')} onPress={() => session.dismissReply()} />
        </View>
      </View>
    </Modal>
  );
}
