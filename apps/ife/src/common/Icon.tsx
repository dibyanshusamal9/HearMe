import type { IconName } from '@hearme/shared';
import {
  Accessibility, Armchair, Cookie, Baby, Bed, BellRing, CircleQuestionMark, Coffee, CupSoda, GlassWater, HandHelping, Headphones,
  HeartPulse, Leaf, Lock, Luggage, Pill, Shield, ShoppingBag, Snowflake, Sun, Thermometer, Toilet, Utensils,
  BatteryCharging, Clock, Droplets, EyeOff, FileText, Heart, Milk, MonitorPlay, PlaneTakeoff, Salad, Search, ShieldAlert, Stethoscope, UserX,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<IconName, LucideIcon> = {
  'glass-water': GlassWater,
  coffee: Coffee,
  'cup-soda': CupSoda,
  bed: Bed,
  snowflake: Snowflake,
  sun: Sun,
  utensils: Utensils,
  leaf: Leaf,
  cookie: Cookie,
  toilet: Toilet,
  pill: Pill,
  thermometer: Thermometer,
  'hand-helping': HandHelping,
  luggage: Luggage,
  accessibility: Accessibility,
  'bell-ring': BellRing,
  lock: Lock,
  headphones: Headphones,
  'heart-pulse': HeartPulse,
  baby: Baby,
  shield: Shield,
  'help-circle': CircleQuestionMark,
  'shopping-bag': ShoppingBag,
  armchair: Armchair,
  milk: Milk,
  'eye-off': EyeOff,
  'monitor-play': MonitorPlay,
  'battery-charging': BatteryCharging,
  'file-text': FileText,
  'plane-takeoff': PlaneTakeoff,
  clock: Clock,
  search: Search,
  'shield-alert': ShieldAlert,
  heart: Heart,
  salad: Salad,
  'user-x': UserX,
  droplets: Droplets,
  stethoscope: Stethoscope,
};

/** Pictogram for a shared IconName. Decorative by default: the visible label carries the meaning. */
export function NeedIcon({ name, size = 32, strokeWidth = 2 }: { name: IconName; size?: number | string; strokeWidth?: number }) {
  const Cmp = ICONS[name] ?? CircleQuestionMark;
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" />;
}
