/** In-memory, per application session. Never silently restored from a previous passenger. */
let consent = false;
export const CLOUD_CONSENT_TEXT = 'Online mode sends microphone recordings to Sarvam Saaras, request text to Groq for keyword matching, and supported-language text to Sarvam for translation and Bulbul speech. This can include sensitive or medical details in requests, crew replies and announcements. Other Asian languages keep local processing. Choose Online mode only if you agree. Switching to Offline mode stops further cloud use. This choice lasts for this page session.';
export function setCloudConsent(value: boolean): void { consent = value; }
export function hasCloudConsent(): boolean { return consent; }
export function cloudHeaders(): Record<string, string> { return consent ? { 'X-HearMe-Cloud-Consent': 'yes' } : {}; }
