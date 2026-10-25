import { JalBrand } from '../common/JalBrand';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  COMMON_NEEDS,
  CREW_LANG,
  describeStatus,
  captionOf,
  findLanguage,
  getNeed,
  getPurpose,
  isActive,
  type LangCode,
  languageInfo,
  LANGUAGES,
  localized,
  type NeedCategory,
  needLabel,
  type NeedPurpose,
  needsInCategory,
  type PassengerRequest,
  type PassengerSession,
  purposeLabelOf,
  replyText,
  requestTitle,
  SAFETY_STEPS,
  translator,
} from '@hearme/shared';
import { useSession } from '@hearme/shared/react';
import { Check, ChevronLeft, ChevronRight, CircleAlert, Clock, HeartPulse, Lock, Plus, RotateCcw, Volume2, Wifi, WifiOff, X } from 'lucide-react';
import { browserSpeaker } from '../common/webAdapters';
import { useEffect, useState, type ReactNode } from 'react';
import { NeedIcon } from '../common/Icon';
import type { IfeScreen } from './IfeApp';

type Go = (s: IfeScreen) => void;

/** Label shown for a request on the shared screen: private needs stay neutral. */
export function publicTitle(r: PassengerRequest, lang: LangCode): string {
  return getNeed(r.needId)?.private ? translator(lang)('review.privateSent') : requestTitle(r, lang);
}

// ── Top-bar connection status ─────────────────────────────────────────────
export function ConnectionPill({ session, lang, demo }: { session: PassengerSession; lang: LangCode; demo?: boolean }) {
  const link = useSession(session, (s) => s.link);
  const tr = translator(lang);
  const shown = link === 'online' && demo ? 'demo' : link;
  const label = tr(`link.${shown}`);
  return (
    <div className={`ife-pill ife-pill--${shown}`} role="status" aria-live="polite">
      {link === 'offline' ? <WifiOff aria-hidden /> : <Wifi aria-hidden />}
      <span>{label}</span>
    </div>
  );
}

function OfflineBanner({ session, lang }: { session: PassengerSession; lang: LangCode }) {
  const link = useSession(session, (s) => s.link);
  if (link === 'online') return null;
  const tr = translator(lang);
  return (
    <div className="ife-banner" role="note">
      <WifiOff aria-hidden />
      <div>
        <strong>{tr(`link.${link}`)}</strong>
        <p>{tr('link.offlineHint')}</p>
      </div>
    </div>
  );
}

// ── Attract & language ────────────────────────────────────────────────────
export function AttractScreen({ seat, onStart }: { seat: string; onStart: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % LANGUAGES.length), 2500);
    return () => clearInterval(t);
  }, []);
  const l = LANGUAGES[i]!;
  return (
    <button className="ife-attract" onClick={onStart}>
      <img className="ife-attract__img" src="/img/cabin-bright.jpg" alt="" />
      <div className="ife-attract__brand">
        <JalBrand />
      </div>
      <div className="ife-attract__tag">{translator('en')('app.tagline')}</div>
      <div className="ife-attract__cta" lang={l.bcp47}>
        {translator(l.code)('ife.touchToStart')}
      </div>
      <div className="ife-attract__langs" aria-hidden>
        {LANGUAGES.map((x) => x.nativeName).join('  ·  ')}
      </div>
      <div className="ife-attract__seat">Seat {seat}</div>
    </button>
  );
}

export function LanguageScreen({ current, onChoose, onBack }: { current?: LangCode; onChoose: (l: LangCode) => void; onBack?: () => void }) {
  return (
    <section className="ife-lang">
      <h1 tabIndex={-1} className="ife-h1">
        {LANGUAGES.map((l) => (
          <span key={l.code} lang={l.bcp47} className="ife-lang__title">
            {translator(l.code)('onboard.chooseLanguage')}
          </span>
        ))}
      </h1>
      <div className="ife-lang__grid">
        {LANGUAGES.map((l) => {
          // A language whose screens are not finished says so on the button itself.
          const english = l.englishName;
          return (
            <button key={l.code} className={`ife-lang__btn${current === l.code ? ' selected' : ''}`} lang={l.bcp47} aria-pressed={current === l.code} onClick={() => onChoose(l.code)}>
              <span className="ife-lang__native">{l.nativeName}</span>
              <span className="ife-lang__english" lang="en">
                {english}
              </span>
            </button>
          );
        })}
      </div>
      {onBack && (
        <button className="ife-btn ife-btn--ghost" onClick={onBack}>
          <ChevronLeft aria-hidden /> Back
        </button>
      )}
    </section>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────
export function HomeScreen({ session, lang, go, phoneJoin }: { session: PassengerSession; lang: LangCode; go: Go; phoneJoin?: ReactNode }) {
  const tr = translator(lang);
  return (
    <div className="ife-home">
      <section className="ife-home__main">
        <h1 tabIndex={-1} className="ife-h1">
          <span className="ife-greet">{tr('home.greeting')}</span> {tr('home.question')}
        </h1>
        <OfflineBanner session={session} lang={lang} />
        <div className="ife-grid ife-grid--home">
          {COMMON_NEEDS.slice(0, 7).map((n) => (
            <NeedTile key={n.id} needId={n.id} lang={lang} onPress={() => go({ name: 'review', needId: n.id })} />
          ))}
          <button className="ife-tile ife-tile--more" onClick={() => go({ name: 'request', category: 'drinks' })}>
            <Plus aria-hidden className="ife-tile__icon" />
            <span className="ife-tile__label">{tr('home.more')}</span>
          </button>
        </div>
        {/* Feeling unwell goes straight to Care Mode, as on the phone. */}
        <button className="ife-btn ife-btn--secondary ife-btn--wide" onClick={() => go({ name: 'care', from: 'home' })}>
          <HeartPulse aria-hidden /> {tr('care.open')}
        </button>
        <button className="ife-btn ife-btn--secondary ife-btn--wide" onClick={() => go({ name: 'request', category: 'private' })}>
          <Lock aria-hidden /> {tr('home.private')}
        </button>
      </section>
      <div className="ife-home__aside">
        <RequestsPanel session={session} lang={lang} go={go} compact />
        {phoneJoin}
      </div>
    </div>
  );
}

function NeedTile({ needId, lang, onPress }: { needId: string; lang: LangCode; onPress: () => void }) {
  const need = getNeed(needId)!;
  return (
    <button className="ife-tile" onClick={onPress}>
      <span className="ife-tile__icon">
        <NeedIcon name={need.icon} size="100%" />
      </span>
      <span className="ife-tile__label">{needLabel(need, lang)}</span>
    </button>
  );
}

// ── Requests panel / list ─────────────────────────────────────────────────
export function RequestsPanel({ session, lang, go, compact }: { session: PassengerSession; lang: LangCode; go: Go; compact?: boolean }) {
  const requests = useSession(session, (s) => s.requests);
  const tr = translator(lang);
  const shown = compact ? requests.filter((r) => isActive(r) || r.status === 'failed').slice(0, 3) : requests;
  return (
    <aside className="ife-panel" aria-labelledby="ife-req-title">
      <h2 id="ife-req-title" className="ife-h2">
        {tr('requests.title')}
      </h2>
      {shown.length === 0 ? (
        <p className="ife-empty">{tr('requests.empty')}</p>
      ) : (
        <ul className="ife-reqlist">
          {shown.map((r) => (
            <RequestItem key={r.id} r={r} session={session} lang={lang} go={go} />
          ))}
        </ul>
      )}
      {compact && requests.length > shown.length && (
        <button className="ife-btn ife-btn--ghost" onClick={() => go({ name: 'requests' })}>
          {tr('requests.title')} ({requests.length}) <ChevronRight aria-hidden />
        </button>
      )}
    </aside>
  );
}

function StatusChip({ r, lang }: { r: PassengerRequest; lang: LangCode }) {
  const v = describeStatus(r, lang);
  const icon = v.tone === 'danger' ? <CircleAlert aria-hidden /> : v.tone === 'success' ? <Check aria-hidden /> : v.tone === 'progress' ? <Clock aria-hidden /> : null;
  return (
    <span className={`ife-chip ife-chip--${v.tone}`} data-status={v.key}>
      {icon}
      {v.label}
    </span>
  );
}

function RequestItem({ r, session, lang, go }: { r: PassengerRequest; session: PassengerSession; lang: LangCode; go: Go }) {
  const tr = translator(lang);
  const need = getNeed(r.needId);
  return (
    <li className="ife-req">
      <button className="ife-req__main" onClick={() => go({ name: 'status', requestId: r.id })}>
        <span className="ife-req__icon">{need && <NeedIcon name={need.private ? 'lock' : need.icon} size="100%" />}</span>
        <span className="ife-req__text">
          <span className="ife-req__title">{publicTitle(r, lang)}</span>
          <StatusChip r={r} lang={lang} />
        </span>
      </button>
      {r.status === 'acknowledged' && <p className="ife-req__reply">“{replyText(r, lang)}”</p>}
      <div className="ife-req__actions">
        {r.status === 'failed' && (
          <button className="ife-btn ife-btn--small ife-btn--primary" onClick={() => session.retry(r.id)}>
            <RotateCcw aria-hidden /> {tr('common.retry')}
          </button>
        )}
        {r.status === 'acknowledged' && (
          <button className="ife-btn ife-btn--small ife-btn--success" onClick={() => session.thank(r.id)}>
            {tr('requests.thanks')}
          </button>
        )}
      </div>
    </li>
  );
}

export function RequestsScreen({ session, lang, go }: { session: PassengerSession; lang: LangCode; go: Go }) {
  const tr = translator(lang);
  return (
    <section className="ife-section">
      <h1 tabIndex={-1} className="ife-h1">
        {tr('requests.title')}
      </h1>
      <RequestsPanel session={session} lang={lang} go={go} />
    </section>
  );
}

// ── Choose a need ─────────────────────────────────────────────────────────
export function RequestScreen({ lang, category, go }: { lang: LangCode; category: NeedCategory; go: Go }) {
  const tr = translator(lang);
  return (
    <section className="ife-section">
      <h1 tabIndex={-1} className="ife-h1">
        {tr('home.question')}
      </h1>
      <div className="ife-tabs" role="tablist" aria-label={tr('home.question')}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === category}
            className={`ife-tab${c === category ? ' active' : ''}`}
            onClick={() => go({ name: 'request', category: c })}
          >
            {c === 'private' && <Lock aria-hidden />}
            {localized(CATEGORY_LABELS[c], lang)}
          </button>
        ))}
      </div>
      {category === 'private' && <p className="ife-hint">{tr('review.privateTitle')}</p>}
      <div className="ife-grid ife-grid--category" role="tabpanel">
        {needsInCategory(category).map((n) => (
          <NeedTile key={n.id} needId={n.id} lang={lang} onPress={() => go({ name: 'review', needId: n.id })} />
        ))}
      </div>
      <p className="ife-hint">{tr('speech.unavailable')}</p>
    </section>
  );
}

// ── Review & send ─────────────────────────────────────────────────────────
export function ReviewScreen({
  lang,
  needId,
  initialPurpose,
  onBack,
  onSend,
  onCare,
}: {
  lang: LangCode;
  needId: string;
  initialPurpose?: NeedPurpose['id'];
  onBack: () => void;
  onSend: (purposeId?: NeedPurpose['id']) => void;
  /** "I feel unwell": open Care Mode to show where it hurts. */
  onCare?: () => void;
}) {
  const tr = translator(lang);
  const need = getNeed(needId);
  const [purpose, setPurpose] = useState<NeedPurpose['id'] | undefined>(initialPurpose);
  if (!need) return <p role="alert">Unknown request.</p>;
  return (
    <section className="ife-review">
      <h1 tabIndex={-1} className="ife-h1">
        {tr('review.title')}
      </h1>
      <div className="ife-review__card">
        <span className="ife-review__icon">
          <NeedIcon name={need.icon} size="100%" />
        </span>
        <div>
          <div className="ife-review__label">{needLabel(need, lang)}</div>
          {purpose && <div className="ife-review__purpose">{purposeLabelOf(purpose, lang)}</div>}
          {lang !== CREW_LANG && (
            <div className="ife-review__crew" lang="ja">
              {tr('reply.from')}: {requestTitle({ needId, purposeId: purpose }, CREW_LANG)}
            </div>
          )}
        </div>
      </div>
      {need.private && (
        <p className="ife-hint">
          <Lock aria-hidden /> {tr('review.privateNote')}
        </p>
      )}
      {need.purposes && (
        <fieldset className="ife-purposes">
          <legend>{tr('review.purpose')}</legend>
          {need.purposes.map((p) => (
            <button key={p} className={`ife-toggle${purpose === p ? ' on' : ''}`} aria-pressed={purpose === p} onClick={() => setPurpose(purpose === p ? undefined : p)}>
              {purpose === p && <Check aria-hidden />}
              {purposeLabelOf(p, lang)}
            </button>
          ))}
        </fieldset>
      )}
      {onCare && (
        <div className="ife-care-cta">
          <button className="ife-btn ife-btn--secondary ife-btn--wide" onClick={onCare}>
            <HeartPulse aria-hidden /> {tr('care.open')}
          </button>
          <p className="ife-hint">{tr('care.optional')}</p>
        </div>
      )}
      <div className="ife-review__actions">
        <button className="ife-btn ife-btn--ghost" onClick={onBack}>
          <ChevronLeft aria-hidden /> {tr('common.back')}
        </button>
        <button className="ife-btn ife-btn--primary ife-btn--hero" onClick={() => onSend(purpose)}>
          {tr('review.send')}
        </button>
      </div>
    </section>
  );
}

// ── Live status of one request ────────────────────────────────────────────
export function StatusScreen({ session, lang, requestId, go }: { session: PassengerSession; lang: LangCode; requestId: string; go: Go }) {
  const r = useSession(session, (s) => s.requests.find((x) => x.id === requestId));
  const tr = translator(lang);
  if (!r) {
    return (
      <section className="ife-section">
        <h1 tabIndex={-1} className="ife-h1">
          {tr('requests.title')}
        </h1>
        <p className="ife-empty">{tr('requests.empty')}</p>
      </section>
    );
  }
  const need = getNeed(r.needId)!;
  const v = describeStatus(r, lang);
  const step = r.status === 'pending' ? 0 : r.status === 'sent' ? 1 : r.status === 'acknowledged' || r.status === 'closed' ? 2 : -1;
  const steps = [tr('status.stepRequest'), tr('status.sent'), tr('status.acknowledged')];
  return (
    <section className="ife-status">
      <h1 tabIndex={-1} className="ife-h1">
        {tr('home.activeRequest')}
      </h1>
      <div className="ife-status__card">
        <span className="ife-review__icon">
          <NeedIcon name={need.private ? 'lock' : need.icon} size="100%" />
        </span>
        <div className="ife-status__body">
          <div className="ife-review__label">{need.private ? tr('ife.privateSent') : requestTitle(r, lang)}</div>
          <div aria-live="polite" role="status" className="ife-status__live">
            <StatusChip r={r} lang={lang} />
            {v.hint && <p className="ife-status__hint">{v.hint}</p>}
            {r.status === 'acknowledged' && <p className="ife-status__reply">“{replyText(r, lang)}”</p>}
          </div>
        </div>
      </div>
      {step >= 0 && (
        <ol className="ife-steps" aria-label={tr('home.activeRequest')}>
          {steps.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="ife-steps__dot">{i < step || (i === step && i === 2) ? <Check aria-hidden /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      )}
      <div className="ife-status__actions">
        {r.status === 'failed' && (
          <button className="ife-btn ife-btn--primary" onClick={() => session.retry(r.id)}>
            <RotateCcw aria-hidden /> {tr('common.retry')}
          </button>
        )}
        {(r.status === 'failed' || r.waitingForConnection) && (
          <button className="ife-btn ife-btn--secondary" onClick={() => go({ name: 'card', needId: r.needId })}>
            {tr('requests.showCard')}
          </button>
        )}
        {r.status === 'acknowledged' && (
          <button className="ife-btn ife-btn--success" onClick={() => session.thank(r.id)}>
            {tr('requests.thanks')}
          </button>
        )}
        {(r.status === 'pending' || r.status === 'sent') && (
          <button className="ife-btn ife-btn--ghost" onClick={() => session.cancel(r.id)}>
            <X aria-hidden /> {tr('requests.cancel')}
          </button>
        )}
        <button className="ife-btn ife-btn--ghost" onClick={() => go({ name: 'home' })}>
          {tr('nav.home')}
        </button>
      </div>
    </section>
  );
}

// ── Show to crew (offline picture card) ───────────────────────────────────
export function CardScreen({ lang, seat, needId, go }: { lang: LangCode; seat: string; needId?: string; go: Go }) {
  const tr = translator(lang);
  const need = needId ? getNeed(needId) : undefined;
  if (need) {
    return (
      <section className="ife-showcard" aria-labelledby="showcard-title">
        <div className="ife-showcard__seat" lang="ja">
          {tr('common.seat')} / 座席 <strong>{seat}</strong>
        </div>
        <span className="ife-showcard__icon">
          <NeedIcon name={need.icon} size="100%" strokeWidth={1.75} />
        </span>
        <h1 id="showcard-title" tabIndex={-1} className="ife-showcard__crew" lang="ja">
          {need.label[CREW_LANG]}
        </h1>
        <div className="ife-showcard__en" lang="en">
          {need.label.en}
        </div>
        {lang !== 'en' && lang !== CREW_LANG && <div className="ife-showcard__mine">{needLabel(need, lang)}</div>}
        <button className="ife-btn ife-btn--primary" onClick={() => go({ name: 'card' })}>
          <X aria-hidden /> {tr('common.close')}
        </button>
      </section>
    );
  }
  return (
    <section className="ife-section">
      <h1 tabIndex={-1} className="ife-h1">
        {tr('card.title')}
      </h1>
      <p className="ife-hint">{tr('card.hint')}</p>
      {CATEGORIES.map((c) => (
        <div key={c} className="ife-cardgroup">
          <h2 className="ife-h2">{localized(CATEGORY_LABELS[c], lang)}</h2>
          <div className="ife-grid ife-grid--card">
            {needsInCategory(c).map((n) => (
              <NeedTile key={n.id} needId={n.id} lang={lang} onPress={() => go({ name: 'card', needId: n.id })} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Safety briefing ───────────────────────────────────────────────────────
export function SafetyScreen({ lang }: { lang: LangCode }) {
  const tr = translator(lang);
  const [i, setI] = useState(0);
  const step = SAFETY_STEPS[i]!;
  return (
    <section className="ife-safety">
      <h1 tabIndex={-1} className="ife-h1">
        {tr('safety.title')}
      </h1>
      <p className="ife-sample">{tr('safety.sample')}</p>
      <div className="ife-safety__card" aria-live="polite">
        <span className="ife-safety__icon">
          <NeedIcon name={step.icon} size="100%" strokeWidth={1.75} />
        </span>
        <div>
          <div className="ife-safety__count">{tr('safety.step', { n: i + 1, total: SAFETY_STEPS.length })}</div>
          <h2 className="ife-safety__title">{localized(step.title, lang)}</h2>
          <p className="ife-safety__body">{localized(step.body, lang)}</p>
        </div>
      </div>
      <div className="ife-safety__nav">
        <button className="ife-btn ife-btn--ghost" disabled={i === 0} onClick={() => setI(i - 1)}>
          <ChevronLeft aria-hidden /> {tr('safety.prev')}
        </button>
        <div className="ife-dots" aria-hidden>
          {SAFETY_STEPS.map((s, k) => (
            <span key={s.id} className={k === i ? 'on' : ''} />
          ))}
        </div>
        <button className="ife-btn ife-btn--primary" disabled={i === SAFETY_STEPS.length - 1} onClick={() => setI(i + 1)}>
          {tr('safety.next')} <ChevronRight aria-hidden />
        </button>
      </div>
    </section>
  );
}

// ── Announcement captions ─────────────────────────────────────────────────
export function CaptionsScreen({ session, lang }: { session: PassengerSession; lang: LangCode }) {
  const tr = translator(lang);
  const announcements = useSession(session, (s) => s.announcements);
  useEffect(() => session.markAnnouncementsSeen(), [session, announcements]);
  return (
    <section className="ife-section">
      <h1 tabIndex={-1} className="ife-h1">
        {tr('captions.title')}
      </h1>
      <OfflineBanner session={session} lang={lang} />
      {announcements.length === 0 ? (
        <p className="ife-empty">{tr('captions.empty')}</p>
      ) : (
        <ul className="ife-captions">
          {announcements.map((a) => {
            const cap = captionOf(a, lang);
            if (!cap) return null;
            return (
              <li key={a.id} className={`ife-caption${cap.safety ? ' safety' : ''}`}>
                <span className="ife-caption__icon">
                  <NeedIcon name={cap.icon} size="100%" />
                </span>
                <div>
                  <time className="ife-caption__time">
                    {new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {cap.sender ? ` · ${tr(cap.sender === 'captain' ? 'announce.captain' : 'announce.crew')}` : ''}
                  </time>
                  <p>{cap.text}</p>
                  <button className="ife-btn ife-btn--secondary" onClick={() => browserSpeaker.speak(cap.text, findLanguage(cap.lang)?.bcp47 ?? cap.lang)}><Volume2 aria-hidden /> {tr('reply.playAgain')}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="ife-hint">{tr('captions.needsConnection')}</p>
    </section>
  );
}

// ── Display & sound ───────────────────────────────────────────────────────
export function SettingsScreen({ session, lang, onLanguage }: { session: PassengerSession; lang: LangCode; onLanguage: (l: LangCode) => void }) {
  const tr = translator(lang);
  const prefs = useSession(session, (s) => s.prefs);
  const voice = prefs.replyChannels.includes('voice');
  return (
    <section className="ife-section ife-settings">
      <h1 tabIndex={-1} className="ife-h1">
        {tr('ife.accessibility')}
      </h1>
      <div className="ife-settings__grid">
        <fieldset>
          <legend className="ife-h2">{tr('settings.language')}</legend>
          <div className="ife-seg ife-seg--wrap">
            {LANGUAGES.map((l) => (
              <button key={l.code} lang={l.bcp47} className={`ife-toggle${l.code === lang ? ' on' : ''}`} aria-pressed={l.code === lang} onClick={() => onLanguage(l.code)}>
                {l.nativeName}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="ife-h2">{tr('settings.textSize')}</legend>
          <div className="ife-seg">
            {([1, 1.25, 1.5] as const).map((s, i) => (
              <button key={s} className={`ife-toggle${prefs.textScale === s ? ' on' : ''}`} aria-pressed={prefs.textScale === s} onClick={() => session.setPrefs({ textScale: s })} aria-label={`${tr('settings.textSize')} ${i + 1}`}>
                <span style={{ fontSize: `${0.9 + i * 0.3}em` }}>A</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="ife-h2">{tr('settings.highContrast')}</legend>
          <Switch on={prefs.highContrast} label={tr('settings.highContrast')} onChange={(v) => session.setPrefs({ highContrast: v })} />
        </fieldset>
        <fieldset>
          <legend className="ife-h2">{tr('channel.voice')}</legend>
          <Switch
            on={voice}
            label={tr('ife.readAloud')}
            onChange={(v) => session.setPrefs({ replyChannels: v ? ['text', 'voice'] : ['text'] })}
          />
        </fieldset>
        <fieldset>
          <legend className="ife-h2">{tr('settings.reduceMotion')}</legend>
          <Switch on={prefs.reduceMotion} label={tr('settings.reduceMotion')} onChange={(v) => session.setPrefs({ reduceMotion: v })} />
        </fieldset>
      </div>
      <p className="ife-hint">
        <Lock aria-hidden /> {tr('ife.noPersonal')} {tr('common.offlineOk')}.
      </p>
      <details className="ife-about">
        <summary>About this prototype (English)</summary>
        <ul lang="en">
          <li>Browser prototype only. It is not integrated with, or certified for, any aircraft IFE system.</li>
          <li>Crew tablet connection, seat identity, announcements and crew replies are simulated.</li>
          <li>Voice input is not offered on the seatback screen; replies are read aloud with the browser's text-to-speech.</li>
          <li>Nothing is stored: ending the session (or 3 minutes without use) clears this screen.</li>
          <li>Translations are prototype drafts and need native-speaker and airline review.</li>
        </ul>
      </details>
    </section>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} className={`ife-switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span className="ife-switch__track" aria-hidden>
        <span className="ife-switch__thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}

