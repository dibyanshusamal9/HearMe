import { JalBrand } from '../components/JalBrand';
import { COMMON_NEEDS, getNeed, isActive, replyText, requestTitle, translator, type LangCode, type PassengerRequest } from '@hearme/shared';
import { useSession } from '@hearme/shared/react';
import HeartPulse from 'lucide-react-native/icons/heart-pulse';
import Keyboard from 'lucide-react-native/icons/keyboard';
import Lock from 'lucide-react-native/icons/lock';
import Plus from 'lucide-react-native/icons/plus';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { NeedIcon } from '../components/Icon';
import { Btn, Card, StatusChip, T } from '../components/ui';
import { HoldToSpeak } from '../components/Voice';
import { VoiceCheck } from '../components/VoiceCheck';
import { useNav } from '../nav';
import { inStage, session } from '../runtime';
import { useTheme } from '../theme';

export function Home({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const nav = useNav();
  const profile = useSession(session, (s) => s.profile);
  const requests = useSession(session, (s) => s.requests);
  const link = useSession(session, (s) => s.link);
  const prefs = useSession(session, (s) => s.prefs);
  const tr = translator(lang);
  const current = requests.find((r) => isActive(r) || r.status === 'failed');
  // Ask once whether replies can be heard (and unlock speech with that tap); never nag again after an answer.
  // (Not inside the demo stage: there the stage's own speakers read replies aloud.)
  const askVoice = prefs.replyChannels.includes('voice') && !prefs.voiceCheck && !inStage;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: th.space.lg, gap: th.space.lg, paddingBottom: th.space.xl }}>
        {/* Brand and greeting stay short so the request pictures are visible without scrolling. */}
        <View style={{ gap: th.space.sm }}>
          <JalBrand compact />
          <T v="title" role="header">
            <Text style={{ color: th.p.primary }}>{profile?.name ? tr('home.greetingName', { name: profile.name }) : tr('home.greeting')}</Text> {tr('home.question')}
          </T>
        </View>

        {link !== 'online' && (
          <Card accent={th.p.warning} style={{ backgroundColor: th.p.warningSoft }}>
            <T bold color={th.p.warning}>
              {tr(`link.${link}`)}
            </T>
            <T color={th.p.warning}>{tr('link.offlineHint')}</T>
          </Card>
        )}

        {current && <CurrentRequest r={current} lang={lang} />}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.md }}>
          {COMMON_NEEDS.slice(0, 7).map((n) => (
            <Tile key={n.id} label={n.label[lang]} onPress={() => nav.open({ kind: 'review', needId: n.id, source: 'tap' })} icon={(c, s) => <NeedIcon name={n.icon} color={c} size={s} />} />
          ))}
          <Tile dashed label={tr('home.more')} onPress={() => nav.open({ kind: 'picker', category: 'drinks' })} icon={(c, s) => <Plus color={c} size={s} />} />
        </View>

        {/* Feeling unwell goes straight to Care Mode: no hunting through categories when it matters most. */}
        <Btn variant="secondary" label={tr('care.open')} onPress={() => nav.open({ kind: 'care' })} icon={(c, s) => <HeartPulse color={c} size={s} />} />
        {/* Asked once, after the pictures: replies can wait a moment, a request should not. */}
        {askVoice && !current && <VoiceCheck lang={lang} />}
        <Btn variant="ghost" label={tr('home.private')} onPress={() => nav.open({ kind: 'picker', category: 'private' })} icon={(c, s) => <Lock color={c} size={s} />} />
      </ScrollView>

      <View style={{ paddingHorizontal: th.space.lg, paddingTop: th.space.sm, paddingBottom: th.space.sm, gap: th.space.xs, backgroundColor: th.p.bg, borderTopWidth: 1, borderColor: th.p.border }}>
        <HoldToSpeak lang={lang} />
        <Pressable
          onPress={() => nav.open({ kind: 'typed' })}
          accessibilityRole="button"
          style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
        >
          <Keyboard color={th.p.primary} size={20} />
          <T bold color={th.p.primary}>
            {tr('home.typeInstead')}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

function Tile({ label, onPress, icon, dashed }: { label: string; onPress: () => void; icon: (c: string, s: number) => ReactNode; dashed?: boolean }) {
  const th = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexBasis: '47%',
        flexGrow: 1,
        minHeight: 92,
        borderRadius: th.radius.md,
        borderWidth: 2,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: pressed ? th.p.primary : th.p.border,
        backgroundColor: pressed ? th.p.primarySoft : th.p.surface,
        padding: th.space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: th.space.md,
      })}
    >
      {icon(th.p.primary, th.fs(30))}
      <Text maxFontSizeMultiplier={1.5} style={{ flex: 1, color: th.p.text, fontSize: th.fs(th.t.bodyLarge), fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function CurrentRequest({ r, lang }: { r: PassengerRequest; lang: LangCode }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  const need = getNeed(r.needId);
  return (
    <Card accent={r.status === 'failed' ? th.p.danger : th.p.primary}>
      <T v="caption" muted bold>
        {tr('home.activeRequest')}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space.md }}>
        {need && <NeedIcon name={need.icon} color={th.p.primary} size={th.fs(32)} />}
        <View style={{ flex: 1, gap: 4 }}>
          <T v="bodyLarge" bold>
            {requestTitle(r, lang)}
          </T>
          <StatusChip r={r} lang={lang} />
        </View>
      </View>
      {r.status === 'acknowledged' && <T bold>“{replyText(r, lang)}”</T>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.sm }}>
        {r.status === 'failed' && <Btn label={tr('common.retry')} onPress={() => session.retry(r.id)} icon={(c, s) => <RotateCcw color={c} size={s} />} />}
        {(r.status === 'failed' || r.waitingForConnection) && <Btn variant="secondary" label={tr('requests.showCard')} onPress={() => nav.open({ kind: 'showCard', needId: r.needId })} />}
        {r.status === 'acknowledged' && <Btn variant="success" label={tr('requests.thanks')} onPress={() => session.thank(r.id)} />}
        {(r.status === 'pending' || r.status === 'sent') && <Btn variant="ghost" label={tr('requests.cancel')} onPress={() => session.cancel(r.id)} />}
      </View>
    </Card>
  );
}
