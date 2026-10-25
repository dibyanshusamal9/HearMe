import type { IconName } from '@hearme/shared';
import type { LucideIcon } from 'lucide-react-native';
import Accessibility from 'lucide-react-native/icons/accessibility';
import Armchair from 'lucide-react-native/icons/armchair';
import Baby from 'lucide-react-native/icons/baby';
import Bed from 'lucide-react-native/icons/bed';
import BellRing from 'lucide-react-native/icons/bell-ring';
import CircleQuestionMark from 'lucide-react-native/icons/circle-question-mark';
import Coffee from 'lucide-react-native/icons/coffee';
import Cookie from 'lucide-react-native/icons/cookie';
import CupSoda from 'lucide-react-native/icons/cup-soda';
import GlassWater from 'lucide-react-native/icons/glass-water';
import HandHelping from 'lucide-react-native/icons/hand-helping';
import Headphones from 'lucide-react-native/icons/headphones';
import HeartPulse from 'lucide-react-native/icons/heart-pulse';
import Leaf from 'lucide-react-native/icons/leaf';
import Lock from 'lucide-react-native/icons/lock';
import Luggage from 'lucide-react-native/icons/luggage';
import Pill from 'lucide-react-native/icons/pill';
import Shield from 'lucide-react-native/icons/shield';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import Snowflake from 'lucide-react-native/icons/snowflake';
import Sun from 'lucide-react-native/icons/sun';
import Thermometer from 'lucide-react-native/icons/thermometer';
import Toilet from 'lucide-react-native/icons/toilet';
import Utensils from 'lucide-react-native/icons/utensils';
import BatteryCharging from 'lucide-react-native/icons/battery-charging';
import Clock from 'lucide-react-native/icons/clock';
import Droplets from 'lucide-react-native/icons/droplets';
import EyeOff from 'lucide-react-native/icons/eye-off';
import FileText from 'lucide-react-native/icons/file-text';
import Heart from 'lucide-react-native/icons/heart';
import Milk from 'lucide-react-native/icons/milk';
import MonitorPlay from 'lucide-react-native/icons/monitor-play';
import PlaneTakeoff from 'lucide-react-native/icons/plane-takeoff';
import Salad from 'lucide-react-native/icons/salad';
import Search from 'lucide-react-native/icons/search';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import Stethoscope from 'lucide-react-native/icons/stethoscope';
import UserX from 'lucide-react-native/icons/user-x';

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

/** Pictogram for a shared IconName (decorative: labels carry meaning for screen readers). */
export function NeedIcon({ name, size = 28, color, strokeWidth = 2 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const Cmp = ICONS[name] ?? CircleQuestionMark;
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} accessible={false} importantForAccessibility="no" />;
}
