import { afterEach, expect, it } from 'vitest';
import { cloudHeaders, hasCloudConsent, setCloudConsent } from '../src';
afterEach(() => setCloudConsent(false));
it('never adds a cloud consent header until explicitly enabled and removes it on revocation', () => {
  expect(hasCloudConsent()).toBe(false); expect(cloudHeaders()).toEqual({});
  setCloudConsent(true); expect(cloudHeaders()).toEqual({ 'X-HearMe-Cloud-Consent': 'yes' });
  setCloudConsent(false); expect(cloudHeaders()).toEqual({});
});
