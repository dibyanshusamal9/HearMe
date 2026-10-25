import { getReply, type LangCode, languageInfo, translator, replyTextOf } from '@hearme/shared';
import { useSession } from '@hearme/shared/react';
import Check from 'lucide-react-native/icons/check';
import Volume2 from 'lucide-react-native/icons/volume-2';
import VolumeX from 'lucide-react-native/icons/volume-x';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { replyVoice, session } from '../runtime';
import { useTheme } from '../theme';
import { Btn, Card, T } from './ui';

type Step = 'idle' | 'playing' | 'ask' | 'ok' | 'tips' | 'blocked' | 'no_voice';

/**
 * "Can you hear the crew's replies?" One tap plays a real verified reply in
 * the passenger's language; they confirm they heard it. If the phone has no
 * voice for the language, or the sound is blocked, they are told plainly that
 * replies will come as big text and vibration instead. The tap also unlocks
 * speech, so later replies can be read aloud when they arrive.
 */
export function VoiceCheck({ lang, inSettings }: { lang: LangCode; inSettings?: boolean }) {
  const th = useTheme();
  const tr = translator(lang);
  const prefs = useSession(session, (s) => s.prefs);
  const info = languageInfo(lang);
  const sample = replyTextOf(getReply('bringing_now'), lang);
  const [step, setStep] = useState<Step>(prefs.voiceCheck === 'ok' && !inSettings ? 'ok' : prefs.voiceCheck === 'no_voice' ? 'no_voice' : 'idle');
  /**
   * Phones often ship no voice for a pack language, and browsers cannot always
   * tell us in advance (`hasVoice` returns null). Rather than let the passenger
   * assume replies will be spoken, say up front that they may not be — without
   * claiming they will not, which we do not know.
   */
  const [mayBeSilent, setMayBeSilent] = useState(false);

  // If the device clearly has no voice for this language, say so before they try.
  useEffect(() => {
    let alive = true;
    void replyVoice.hasVoice(info.bcp47).then((has) => {
      if (!alive) return;
      if (has === false) {
        setStep('no_voice');
        if (session.getState().prefs.voiceCheck !== 'no_voice') session.setPrefs({ voiceCheck: 'no_voice' });
      } else if (has === null && info.coverage.tts === 'rare') {
        setMayBeSilent(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [info.bcp47]);

  const play = () => {
    replyVoice.unlock();
    setStep('playing');
    replyVoice.speak(sample, info.bcp47).done.then((outcome) => {
      if (outcome === 'played') setStep('ask');
      else if (outcome === 'no-voice') {
        setStep('no_voice');
        session.setPrefs({ voiceCheck: 'no_voice' });
      } else if (outcome === 'blocked') setStep('blocked');
      else setStep('idle');
    });
  };
  const heard = () => {
    session.setPrefs({ voiceCheck: 'ok' });
    setStep('ok');
  };
  const notHeard = () => {
    session.setPrefs({ voiceCheck: 'not_heard' });
    setStep('tips');
  };
  const textOnly = () => session.setPrefs({ replyChannels: prefs.replyChannels.filter((c) => c !== 'voice'), voiceCheck: 'not_heard' });

  if (step === 'ok' && !inSettings) return null;
  const voiceOff = !prefs.replyChannels.includes('voice');

  return (
    <Card accent={step === 'no_voice' || step === 'tips' || step === 'blocked' ? th.p.warning : th.p.primary}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space.sm }}>
        {step === 'no_voice' ? <VolumeX color={th.p.warning} size={22} /> : step === 'ok' ? <Check color={th.p.success} size={22} /> : <Volume2 color={th.p.primary} size={22} />}
        <T bold style={{ flex: 1 }}>
          {step === 'ok' ? tr('voice.ok') : tr('voice.checkTitle')}
        </T>
      </View>
      {step === 'idle' && <T muted>{tr('voice.checkHint')}</T>}
      {step === 'idle' && mayBeSilent && <T color={th.p.warning}>{tr('voice.mayHaveNoVoice', { language: info.nativeName })}</T>}
      {(step === 'playing' || step === 'ask') && (
        <T lang={info.bcp47} style={{ fontStyle: 'italic' }}>
          “{sample}”
        </T>
      )}
      {step === 'no_voice' && <T color={th.p.warning}>{tr('voice.noVoice', { language: info.nativeName })}</T>}
      {step === 'blocked' && <T color={th.p.warning}>{tr('voice.blocked')}</T>}
      {step === 'tips' && <T color={th.p.warning}>{tr('voice.fixTips')}</T>}
      {step === 'ask' ? (
        <View style={{ gap: th.space.sm }}>
          <T bold>{tr('voice.heard')}</T>
          <View style={{ flexDirection: 'row', gap: th.space.sm }}>
            <Btn style={{ flex: 1 }} variant="success" label={tr('voice.yes')} onPress={heard} />
            <Btn style={{ flex: 1 }} variant="ghost" label={tr('voice.no')} onPress={notHeard} />
          </View>
        </View>
      ) : step !== 'no_voice' ? (
        <Btn
          variant={step === 'ok' ? 'ghost' : 'primary'}
          label={step === 'playing' ? tr('voice.playing') : step === 'idle' ? tr('voice.play') : tr('reply.playAgain')}
          disabled={step === 'playing' || voiceOff}
          onPress={play}
          icon={(c, s) => <Volume2 color={c} size={s} />}
        />
      ) : null}
      {(step === 'tips' || step === 'blocked') && !voiceOff && <Btn variant="ghost" label={tr('voice.textOnly')} onPress={textOnly} />}
    </Card>
  );
}
