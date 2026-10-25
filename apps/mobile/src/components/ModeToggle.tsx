import { CLOUD_CONSENT_TEXT, setProcessingMode } from '@hearme/shared';
import { useProcessingMode } from '@hearme/shared/react';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Btn, Sheet, T } from './ui';
import { useTheme } from '../theme';

export function ModeToggle() {
  const mode = useProcessingMode(); const th = useTheme(); const [consent, setConsent] = useState(false);
  return <>
    <View style={{ marginLeft: 'auto', minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      <Text style={{ color: th.p.onNavy, fontSize: th.fs(12), fontWeight: '700' }}>{mode === 'online' ? 'Online mode' : 'Offline mode'}</Text>
      <Switch accessibilityLabel="Online mode" value={mode === 'online'} onValueChange={(value) => value ? setConsent(true) : setProcessingMode('offline')}
        trackColor={{ false: th.p.textMuted, true: th.p.primary }} thumbColor={th.p.surface} />
    </View>
    <Sheet visible={consent} title="Online mode" closeLabel="Keep Offline mode" onClose={() => setConsent(false)}>
      <T>{CLOUD_CONSENT_TEXT}</T>
      <Btn label="I agree — enable Online mode" onPress={() => { setProcessingMode('online'); setConsent(false); }} />
      <Btn label="Keep Offline mode" variant="secondary" onPress={() => setConsent(false)} />
    </Sheet>
  </>;
}
