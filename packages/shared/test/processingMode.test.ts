import { afterEach, expect, it, vi } from 'vitest';
import { autoSubmitSpeech, DemoCabinLink, PassengerSession, getProcessingMode, setProcessingMode, processingHeaders, hasCloudConsent, SpeechPauseDetector, usesOnline } from '../src';

afterEach(() => setProcessingMode('offline'));
it('defaults offline, requires an explicit online selection and keeps unsupported languages local', () => {
  expect(getProcessingMode()).toBe('offline'); expect(processingHeaders('hi')).toEqual({});
  setProcessingMode('online'); expect(hasCloudConsent()).toBe(true); expect(usesOnline('hi')).toBe(true);
  expect(processingHeaders('en', 'hi')).toMatchObject({ 'X-HearMe-Mode': 'online', 'X-HearMe-Cloud-Consent': 'yes' });
  for (const lang of ['ja', 'th', 'id', 'vi']) expect(processingHeaders(lang)).toEqual({});
  setProcessingMode('offline'); expect(hasCloudConsent()).toBe(false); expect(processingHeaders('hi')).toEqual({});
});
it('submits confident spoken keywords once and excludes refused and uncertain needs', () => {
  const link = new DemoCabinLink('simulated'); const session = new PassengerSession({ link, device: 'phone' });
  session.setProfile({ seat: '23C', lang: 'en', tags: [], shareTagsWithCrew: false });
  const submit = vi.spyOn(session, 'submit');
  const match = { candidates: [{ needId: 'water', score: .99 }], confidence: .99, evidence: 'meaning' as const };
  const many = { requests: [{ needId: 'water', confidence: .99 }, { needId: 'tea', confidence: .99 }, { needId: 'blanket', confidence: .1 }], refused: ['tea'] };
  expect(autoSubmitSpeech(session, match, many)).toBe(1);
  expect(submit).toHaveBeenCalledTimes(1); expect(session.getState().requests[0]?.needId).toBe('water');
  expect(autoSubmitSpeech(session, { ...match, confidence: .1 })).toBe(0);
  session.dispose(); link.dispose();
});
it('finishes only after voiced frames followed by a pause, with a fifteen-second cap', () => {
  const detector = new SpeechPauseDetector(100);
  expect(detector.update(30, 1000)).toBe(false); expect(detector.hasSpeech).toBe(false);
  detector.update(75, 1100); detector.update(76, 1200);
  expect(detector.update(30, 2300)).toBe(false); expect(detector.update(30, 2400)).toBe(true);
  expect(detector.update(30, 2500)).toBe(false);
  expect(new SpeechPauseDetector(0).update(30, 15000)).toBe(true);
});
