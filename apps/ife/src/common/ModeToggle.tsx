import { CLOUD_CONSENT_TEXT, setProcessingMode, type LangCode, usesOnline } from '@hearme/shared';
import { useProcessingMode } from '@hearme/shared/react';
import { useState } from 'react';
import './mode.css';

export function ModeToggle({ lang }: { lang?: LangCode }) {
  const mode = useProcessingMode(); const [consent, setConsent] = useState(false);
  return <div className="processing-mode">
    <button className="processing-mode__switch" role="switch" aria-label="Online mode" aria-checked={mode === 'online'} onClick={() => {
      if (mode === 'online') setProcessingMode('offline'); else setConsent(true);
    }}><span aria-hidden className={`processing-mode__track${mode === 'online' ? ' on' : ''}`} />{mode === 'online' ? 'Online mode' : 'Offline mode'}</button>
    {mode === 'online' && lang && !usesOnline(lang) && <small>Local processing for this language</small>}
    {consent && <section className="processing-mode__consent" aria-label="Online mode consent">
      <h2>Enable Online mode</h2><p>{CLOUD_CONSENT_TEXT}</p>
      <button onClick={() => { setProcessingMode('online'); setConsent(false); }}>I agree — enable Online mode</button>
      <button onClick={() => setConsent(false)}>Keep Offline mode</button>
    </section>}
  </div>;
}
