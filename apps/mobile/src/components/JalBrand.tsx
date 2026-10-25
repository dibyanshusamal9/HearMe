import { Image, View } from 'react-native';
import { T } from './ui';

/** Bundled airline lockup; available offline on native and web. `compact` is one short row, for screens where the content must come first. */
export function JalBrand({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
          <Image source={require('../../assets/jal-logo.png')} accessibilityLabel="Japan Airlines" resizeMode="contain" style={{ width: 112, height: 24 }} />
        </View>
        <T bold>HearMe</T>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'flex-start', gap: 12, marginVertical: 16 }}>
      <View style={{ backgroundColor: '#FFFFFF', padding: 12, borderRadius: 8 }}>
        <Image source={require('../../assets/jal-logo.png')} accessibilityLabel="Japan Airlines" resizeMode="contain" style={{ width: 180, height: 48 }} />
      </View>
      <T v="title">HearMe</T>
    </View>
  );
}
