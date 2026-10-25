import { describeStatus, translator, type LangCode, type PassengerRequest } from '@hearme/shared';
import Check from 'lucide-react-native/icons/check';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import Clock from 'lucide-react-native/icons/clock';
import Wifi from 'lucide-react-native/icons/wifi';
import WifiOff from 'lucide-react-native/icons/wifi-off';
import X from 'lucide-react-native/icons/x';
import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type AccessibilityRole,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

// ── Text ──────────────────────────────────────────────────────────────────
type TVariant = 'caption' | 'body' | 'bodyLarge' | 'title' | 'heading' | 'display';

export function T({
  children,
  v = 'body',
  bold,
  muted,
  color,
  style,
  role,
  lang,
  center,
  live,
}: {
  children: ReactNode;
  v?: TVariant;
  bold?: boolean;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  role?: AccessibilityRole;
  lang?: string;
  center?: boolean;
  live?: 'polite' | 'assertive';
}) {
  const th = useTheme();
  const size = th.fs(th.t[v]);
  return (
    <Text
      accessibilityRole={role}
      accessibilityLanguage={lang}
      accessibilityLiveRegion={live}
      maxFontSizeMultiplier={1.6}
      style={[
        {
          color: color ?? (muted ? th.p.textMuted : th.p.text),
          fontSize: size,
          lineHeight: Math.round(size * 1.4),
          fontWeight: bold || v === 'title' || v === 'heading' || v === 'display' ? '700' : '400',
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'navy';

export function Btn({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  hint,
  big,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  icon?: (color: string, size: number) => ReactNode;
  disabled?: boolean;
  hint?: string;
  big?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const th = useTheme();
  const { p } = th;
  const colors: Record<BtnVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: p.primary, fg: p.onPrimary, border: p.primary },
    secondary: { bg: p.surface, fg: p.primary, border: p.primary },
    ghost: { bg: 'transparent', fg: p.text, border: p.border },
    success: { bg: p.success, fg: th.hc ? '#000' : '#fff', border: p.success },
    danger: { bg: p.danger, fg: th.hc ? '#000' : '#fff', border: p.danger },
    navy: { bg: p.navy, fg: p.onNavy, border: th.hc ? p.border : p.navy },
  };
  const c = colors[variant];
  const size = th.fs(big ? th.t.bodyLarge : th.t.body);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        {
          minHeight: big ? 64 : th.minTouch,
          backgroundColor: c.bg,
          borderColor: c.border,
          borderWidth: 2,
          borderRadius: th.radius.md,
          paddingHorizontal: th.space.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: th.space.sm,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {icon?.(c.fg, Math.round(size * 1.2))}
      <Text maxFontSizeMultiplier={1.5} style={{ color: c.fg, fontSize: size, fontWeight: '700', textAlign: 'center', flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: string }) {
  const th = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: th.p.surface,
          borderRadius: th.radius.lg,
          borderWidth: 2,
          borderColor: accent ?? th.p.border,
          padding: th.space.lg,
          gap: th.space.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ── Status ────────────────────────────────────────────────────────────────
export function StatusChip({ r, lang }: { r: PassengerRequest; lang: LangCode }) {
  const th = useTheme();
  const v = describeStatus(r, lang);
  const map = {
    progress: { bg: th.p.warningSoft, fg: th.p.warning },
    success: { bg: th.p.successSoft, fg: th.p.success },
    danger: { bg: th.p.dangerSoft, fg: th.p.danger },
    neutral: { bg: th.p.surfaceAlt, fg: th.p.textMuted },
  }[v.tone];
  const Icon = v.tone === 'danger' ? CircleAlert : v.tone === 'success' ? Check : v.tone === 'progress' ? Clock : null;
  return (
    <View
      accessible
      accessibilityLabel={v.label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        backgroundColor: map.bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: th.hc ? 1 : 0,
        borderColor: map.fg,
      }}
    >
      {Icon && <Icon size={th.fs(16)} color={map.fg} />}
      <Text maxFontSizeMultiplier={1.5} style={{ color: map.fg, fontWeight: '700', fontSize: th.fs(th.t.caption) }}>
        {v.label}
      </Text>
    </View>
  );
}

export function ConnectionPill({ status, lang, demo }: { status: 'online' | 'no_crew' | 'offline'; lang: LangCode; demo?: boolean }) {
  const th = useTheme();
  const tr = translator(lang);
  // Answered by the in-app simulated crew, not a person: say so.
  const shown = status === 'online' && demo ? 'demo' : status;
  const c =
    shown === 'demo'
      ? { bg: th.p.infoSoft, fg: th.p.info }
      : status === 'online'
      ? { bg: th.p.successSoft, fg: th.p.success }
      : status === 'no_crew'
        ? { bg: th.p.warningSoft, fg: th.p.warning }
        : { bg: th.p.dangerSoft, fg: th.p.danger };
  const Icon = status === 'offline' ? WifiOff : Wifi;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={tr(`link.${shown}`)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: c.bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: th.hc ? 1 : 0,
        borderColor: c.fg,
        flexShrink: 1,
      }}
    >
      <Icon size={th.fs(16)} color={c.fg} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color: c.fg, fontWeight: '700', fontSize: th.fs(13), flexShrink: 1 }}>
        {tr(`link.${shown}`)}
      </Text>
    </View>
  );
}

// ── Form controls ─────────────────────────────────────────────────────────
export function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const th = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={{ minHeight: th.minTouch, flexDirection: 'row', alignItems: 'center', gap: th.space.md, paddingVertical: th.space.xs }}
    >
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? (
          <T v="caption" muted>
            {hint}
          </T>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: th.p.primary, false: th.p.border }}
        thumbColor={th.hc && value ? '#000' : '#fff'}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: V; label: string; a11y?: string }[];
  value: V;
  onChange: (v: V) => void;
  label: string;
}) {
  const th = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.sm }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.a11y ?? o.label}
            style={{
              minHeight: th.minTouch,
              minWidth: th.minTouch,
              paddingHorizontal: th.space.lg,
              borderRadius: 999,
              borderWidth: 2,
              borderColor: on ? th.p.primary : th.p.border,
              backgroundColor: on ? th.p.primarySoft : th.p.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text maxFontSizeMultiplier={1.4} style={{ color: on ? th.p.primary : th.p.text, fontWeight: '700', fontSize: th.fs(th.t.body) }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Sheet (full-screen modal with a header) ───────────────────────────────
export function Sheet({
  visible,
  title,
  onClose,
  closeLabel,
  children,
  footer,
  scroll = true,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const th = useTheme();
  return (
    <Modal visible={visible} animationType={th.reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: th.p.bg }}>
        <View style={[styles.sheetHead, { borderColor: th.p.border, paddingHorizontal: th.space.lg }]}>
          <T v="title" role="header" style={{ flex: 1 }}>
            {title}
          </T>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            style={{ width: th.minTouch, height: th.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 2, borderColor: th.p.border }}
          >
            <X size={26} color={th.p.text} />
          </Pressable>
        </View>
        {scroll ? (
          <ScrollView contentContainerStyle={{ padding: th.space.lg, gap: th.space.lg }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, padding: th.space.lg, gap: th.space.lg }}>{children}</View>
        )}
        {footer ? <View style={{ padding: th.space.lg, gap: th.space.sm, borderTopWidth: 1, borderColor: th.p.border }}>{footer}</View> : null}
      </SafeAreaView>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
});
