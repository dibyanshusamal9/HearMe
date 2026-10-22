import {
  BODY_AREAS,
  BODY_MAP_VIEWBOX,
  BODY_SHAPES,
  CONDITIONS,
  SYMPTOMS,
  emptyMedicalReport,
  isUrgentMedical,
  painWord,
  translator,
  type BodyArea,
  type LangCode,
  type MedicalReport,
} from '@hearme/shared';
import Check from 'lucide-react-native/icons/check';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { Btn, Sheet, T } from '../components/ui';
import { useNav } from '../nav';
import { session } from '../runtime';
import { useTheme } from '../theme';

const PAIN_COLORS = ['#1E9E6A', '#4FAF5A', '#8CBF4A', '#C2C43C', '#E3B52E', '#EF9A2B', '#EF7B2B', '#EA5A2E', '#D9402F', '#C2302F', '#A31F2B'];

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Care Mode: where it hurts, how much, anything else → a structured summary for the crew (Japanese + English). */
export function CareSheet({ lang }: { lang: LangCode }) {
  const th = useTheme();
  const nav = useNav();
  const tr = translator(lang);
  const [r, setR] = useState<MedicalReport>(emptyMedicalReport);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<MedicalReport>) => setR((x) => ({ ...x, ...patch }));
  const areaLabel = (a: BodyArea) => BODY_AREAS.find((x) => x.id === a)!.label[lang];
  const urgent = isUrgentMedical(r);

  const send = () => {
    const res = session.submit({ needId: 'unwell', source: 'tap', medical: r });
    if (res.ok) {
      nav.close();
      nav.setTab('home');
    } else setError(res.reason === 'duplicate' ? tr('requests.limit') : tr('status.failed'));
  };

  const chip = (on: boolean, label: string, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={{
        minHeight: th.minTouch,
        paddingHorizontal: th.space.md,
        borderRadius: 999,
        borderWidth: 2,
        borderColor: on ? th.p.primary : th.p.border,
        backgroundColor: on ? th.p.primarySoft : th.p.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {on && <Check size={18} color={th.p.primary} />}
      <T bold color={on ? th.p.primary : th.p.text}>
        {label}
      </T>
    </Pressable>
  );

  return (
    <Sheet visible title={tr('care.title')} onClose={nav.close} closeLabel={tr('common.close')} footer={<Btn big label={tr('care.send')} onPress={send} />}>
      <T bold>{tr('care.where')}</T>
      <View style={{ flexDirection: 'row', gap: th.space.md, alignItems: 'center' }}>
        <Svg width={150} height={270} viewBox={`0 0 ${BODY_MAP_VIEWBOX.width} ${BODY_MAP_VIEWBOX.height}`}>
          {BODY_SHAPES.map((s, i) => {
            const on = r.areas.includes(s.area);
            const fill = on ? th.p.primary : th.p.border;
            const press = () => set({ areas: toggle(r.areas, s.area) });
            return s.kind === 'circle' ? (
              <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={fill} stroke={on ? th.p.primary : th.p.textMuted} strokeWidth={2} onPress={press} />
            ) : (
              <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} fill={fill} stroke={on ? th.p.primary : th.p.textMuted} strokeWidth={2} onPress={press} />
            );
          })}
        </Svg>
        <View style={{ flex: 1, gap: 6 }}>
          {/* Accessible list of the same areas (and "back", which the front view cannot show). */}
          {BODY_AREAS.map((a) => chip(r.areas.includes(a.id), a.label[lang], () => set({ areas: toggle(r.areas, a.id) }), a.id))}
        </View>
      </View>

      <T bold>{tr('care.pain')}</T>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {PAIN_COLORS.map((c, n) => {
          const on = r.pain === n;
          return (
            <Pressable
              key={n}
              onPress={() => set({ pain: r.pain === n ? null : n })}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${n}`}
              style={{ width: 40, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c : th.p.surface, borderWidth: 2, borderColor: on ? th.p.text : c }}
            >
              <Text style={{ fontWeight: '800', fontSize: th.fs(16), color: on ? '#fff' : th.p.text }}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <T muted>{r.pain === null ? tr('care.notRated') : `${r.pain}/10 · ${painWord(r.pain, lang)}`}</T>

      <T bold>{tr('care.symptoms')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.sm }}>
        {SYMPTOMS.map((x) => chip(r.symptoms.includes(x.id), x.label[lang], () => set({ symptoms: toggle(r.symptoms, x.id) }), x.id))}
      </View>

      <T bold>{tr('care.conditions')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.sm }}>
        {CONDITIONS.map((x) => chip(r.conditions.includes(x.id), x.label[lang], () => set({ conditions: toggle(r.conditions, x.id) }), x.id))}
      </View>

      {r.areas.length > 0 && <T muted>{r.areas.map(areaLabel).join(' · ')}</T>}
      {urgent && (
        <View style={{ backgroundColor: th.p.dangerSoft, borderRadius: th.radius.md, padding: th.space.md }}>
          <T bold color={th.p.danger} live="assertive">
            {tr('care.urgent')}
          </T>
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
