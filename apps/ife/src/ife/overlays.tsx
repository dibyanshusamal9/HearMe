import { captionOf, crewReplyText, findLanguage, getNeed, type LangCode, languageInfo, localized, type PassengerSession, translator, type Speaker } from '@hearme/shared';
import { useSession } from '@hearme/shared/react';
import { Heart, Megaphone, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NeedIcon } from '../common/Icon';

/** Modal dialog with initial focus and Escape handling. */
function Dialog({ labelledBy, children, onEscape, tone }: { labelledBy: string; children: ReactNode; onEscape?: () => void; tone?: 'alert' }) {
  const ref = useRef<HTMLDivElement>(null);
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escape.current?.();
      if (e.key === 'Tab' && ref.current) {
        // Keep focus inside the dialog.
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input')].filter((el) => !el.hasAttribute('disabled'));
        if (f.length === 0) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="ife-scrim">
      <div ref={ref} className="ife-dialog" role={tone === 'alert' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

export function ReplyDialog({ session, lang, requestId, speaker }: { session: PassengerSession; lang: LangCode; requestId: string; speaker: Speaker }) {
  const r = useSession(session, (s) => s.requests.find((x) => x.id === requestId));
  const prefs = useSession(session, (s) => s.prefs);
  const tr = translator(lang);
  const text = crewReplyText(r?.reply, lang);
  const voice = prefs.replyChannels.includes('voice') && speaker.available();
  useEffect(() => {
    if (voice && text) speaker.speak(text, languageInfo(lang).bcp47);
    return () => speaker.stop();
  }, [voice, text, lang, speaker]);
  if (!r?.reply) return null;
  const need = getNeed(r.needId);
  return (
    <Dialog labelledBy="reply-text" onEscape={() => session.dismissReply()}>
      <div className="ife-reply__from">
        <span className="ife-avatar" aria-hidden>
          {(r.reply.crewName ?? 'C').slice(0, 1)}
        </span>
        {r.reply.crewName ? `${r.reply.crewName} · ` : ''}
        {tr('reply.from')}
      </div>
      <p id="reply-text" className="ife-reply__text">
        {text}
      </p>
      {need && (
        <span className="ife-reply__icon">
          <NeedIcon name={need.private ? 'hand-helping' : need.icon} size="100%" />
        </span>
      )}
      <div className="ife-dialog__actions">
        {voice && (
          <button className="ife-btn ife-btn--secondary" onClick={() => speaker.speak(text, languageInfo(lang).bcp47)}>
            <Volume2 aria-hidden /> {tr('reply.playAgain')}
          </button>
        )}
        <button className="ife-btn ife-btn--ghost" onClick={() => session.dismissReply()}>
          {tr('common.close')}
        </button>
        <button data-autofocus className="ife-btn ife-btn--success ife-btn--hero" onClick={() => session.thank(r.id)}>
          <Heart aria-hidden /> {tr('requests.thanks')}
        </button>
      </div>
    </Dialog>
  );
}

export function EndSessionDialog({ lang, onCancel, onConfirm }: { lang: LangCode; onCancel: () => void; onConfirm: () => void }) {
  const tr = translator(lang);
  return (
    <Dialog labelledBy="end-title" onEscape={onCancel} tone="alert">
      <h2 id="end-title" className="ife-dialog__title">
        {tr('ife.endConfirm')}
      </h2>
      <p className="ife-dialog__body">{tr('ife.endDetail')}</p>
      <div className="ife-dialog__actions">
        <button data-autofocus className="ife-btn ife-btn--ghost" onClick={onCancel}>
          {tr('common.cancel')}
        </button>
        <button className="ife-btn ife-btn--danger ife-btn--hero" onClick={onConfirm}>
          {tr('ife.endYes')}
        </button>
      </div>
    </Dialog>
  );
}

export function IdleDialog({ lang, seconds, onStay, onEnd }: { lang: LangCode; seconds: number; onStay: () => void; onEnd: () => void }) {
  const tr = translator(lang);
  return (
    <Dialog labelledBy="idle-title" onEscape={onStay} tone="alert">
      <h2 id="idle-title" className="ife-dialog__title">
        {tr('ife.stillThere')}
      </h2>
      <p className="ife-dialog__body" aria-live="polite">
        {tr('ife.stillThereHint', { seconds })}
      </p>
      <div className="ife-dialog__actions">
        <button className="ife-btn ife-btn--ghost" onClick={onEnd}>
          {tr('ife.endYes')}
        </button>
        <button data-autofocus className="ife-btn ife-btn--primary ife-btn--hero" onClick={onStay}>
          {tr('ife.keepGoing')}
        </button>
      </div>
    </Dialog>
  );
}

/** Newest announcement as a caption banner at the top of the content area. */
export function CaptionToast({ session, lang, onOpen, speaker }: { session: PassengerSession; lang: LangCode; onOpen: () => void; speaker?: Speaker }) {
  const unseen = useSession(session, (s) => s.unseenAnnouncement);
  const a = useSession(session, (s) => s.announcements.find((x) => x.id === s.unseenAnnouncement));
  const voice = useSession(session, (s) => s.prefs.replyChannels.includes('voice'));
  const tr = translator(lang);
  const cap = unseen && a ? captionOf(a, lang) : undefined;
  const [playbackError, setPlaybackError] = useState('');
  useEffect(() => {
    const status = (event: Event) => {
      const outcome = (event as CustomEvent<string>).detail;
      setPlaybackError(outcome === 'no-voice' ? 'No installed offline voice for this language. Select Online mode or install a device voice.' : outcome === 'blocked' ? 'Audio could not play. Tap Play announcement to try again.' : '');
    };
    window.addEventListener('hearme-playback', status);
    return () => window.removeEventListener('hearme-playback', status);
  }, []);
  // Read every announcement aloud in the passenger's language, when they asked for voice.
  useEffect(() => {
    if (cap && voice && speaker?.available()) speaker.speak(cap.text, findLanguage(cap.lang)?.bcp47 ?? cap.lang);
    return () => speaker?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [a?.id, voice, lang]);
  if (!cap) return null;
  return (
    <div className={`ife-toast${cap.safety ? ' safety' : ''}`} role={cap.safety ? 'alert' : 'status'}>
      <Megaphone aria-hidden />
      <button className="ife-toast__text" onClick={onOpen}>
        <span className="ife-toast__label">{cap.sender ? tr(cap.sender === 'captain' ? 'announce.captain' : 'announce.crew') : tr('captions.title')}</span>
        {cap.text}
        {playbackError && <small>{playbackError}</small>}
      </button>
      {voice && speaker && <button className="ife-toast__close" aria-label="Play announcement" onClick={() => speaker.speak(cap.text, findLanguage(cap.lang)?.bcp47 ?? cap.lang)}><Volume2 aria-hidden /></button>}
      <button className="ife-toast__close" onClick={() => session.markAnnouncementsSeen()} aria-label={tr('common.close')}>
        <X aria-hidden />
      </button>
    </div>
  );
}
