import { JalBrand } from '../common/JalBrand';
import {
  languageInfo,
  translator,
  type DemoCabinLink,
  type LangCode,
  type NeedCategory,
  type NeedPurpose,
  type PassengerSession,
} from '@hearme/shared';
import { useCrewMode, useSession } from '@hearme/shared/react';
import { Captions, Hand, House, LogOut, Monitor, Settings2, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { DemoControls } from '../common/DemoControls';
import { CareScreen } from './CareScreen';
import { themeVars } from '../common/theme';
import { browserSpeaker } from '../common/webAdapters';
import { CaptionToast, EndSessionDialog, IdleDialog, ReplyDialog } from './overlays';
import {
  AttractScreen,
  CaptionsScreen,
  CardScreen,
  ConnectionPill,
  HomeScreen,
  LanguageScreen,
  RequestScreen,
  RequestsScreen,
  ReviewScreen,
  SafetyScreen,
  SettingsScreen,
  StatusScreen,
} from './screens';

export type IfeScreen =
  | { name: 'home' }
  | { name: 'request'; category: NeedCategory }
  | { name: 'review'; needId: string; purposeId?: NeedPurpose['id'] }
  | { name: 'status'; requestId: string }
  | { name: 'requests' }
  | { name: 'card'; needId?: string }
  | { name: 'safety' }
  | { name: 'captions' }
  | { name: 'settings' }
  | { name: 'care'; from?: 'home' };

export interface IfeAppProps {
  session: PassengerSession;
  link: DemoCabinLink;
  seat: string;
  /** Inactivity before the "Are you still there?" prompt. */
  idleMs?: number;
  /** Countdown shown in the prompt before the session clears itself. */
  idleGraceSeconds?: number;
}

type Stage = 'attract' | 'language' | 'main';

export function IfeApp({ session, link, seat, idleMs = 180_000, idleGraceSeconds = 30 }: IfeAppProps) {
  const profile = useSession(session, (s) => s.profile);
  const prefs = useSession(session, (s) => s.prefs);
  const replyToShow = useSession(session, (s) => s.replyToShow);
  const unseen = useSession(session, (s) => s.unseenAnnouncement);
  const crewMode = useCrewMode(link);
  const [stage, setStage] = useState<Stage>(profile ? 'main' : 'attract');
  const [screen, setScreen] = useState<IfeScreen>({ name: 'home' });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [idleLeft, setIdleLeft] = useState<number | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const lang: LangCode = profile?.lang ?? 'en';
  const tr = translator(lang);

  const go = useCallback((s: IfeScreen) => {
    setScreen(s);
    setNotice(null);
  }, []);

  // Move focus to the new screen's heading so screen readers announce it.
  useEffect(() => {
    const h = mainRef.current?.querySelector<HTMLElement>('h1');
    h?.focus();
  }, [screen, stage]);

  const endSession = useCallback(() => {
    browserSpeaker.stop();
    session.clear();
    setConfirmEnd(false);
    setIdleLeft(null);
    setScreen({ name: 'home' });
    setStage('attract');
    setNotice(null);
  }, [session]);

  const chooseLanguage = (code: LangCode) => {
    if (profile) session.updateProfile({ lang: code });
    else session.setProfile({ lang: code, seat, tags: [], shareTagsWithCrew: false });
    setStage('main');
    setScreen({ name: 'home' });
  };

  // ── Inactivity: shared screen clears itself ────────────────────────────
  useEffect(() => {
    if (stage === 'attract') return;
    let idleTimer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setIdleLeft(idleGraceSeconds), idleMs);
    };
    arm();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, [stage, idleMs, idleGraceSeconds]);

  useEffect(() => {
    if (idleLeft === null) return;
    if (idleLeft <= 0) {
      endSession();
      return;
    }
    const t = setTimeout(() => setIdleLeft((v) => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [idleLeft, endSession]);

  const rootStyle = themeVars(prefs.highContrast, prefs.textScale);
  const rootClass = `ife${prefs.reduceMotion ? ' reduce-motion' : ''}${prefs.highContrast ? ' hc' : ''}`;

  if (stage === 'attract') {
    return (
      <div className={rootClass} style={rootStyle} lang="en">
        <AttractScreen seat={seat} onStart={() => setStage('language')} />
        <DemoToggle open={showDemo} setOpen={setShowDemo} link={link} />
      </div>
    );
  }

  if (stage === 'language') {
    return (
      <div className={rootClass} style={rootStyle} lang="en">
        <main className="ife-language-stage" ref={mainRef}>
          <LanguageScreen current={profile?.lang} onChoose={chooseLanguage} onBack={endSession} />
        </main>
        <DemoToggle open={showDemo} setOpen={setShowDemo} link={link} />
      </div>
    );
  }

  const nav: { id: IfeScreen['name']; label: string; icon: ReactNode; target: IfeScreen; badge?: boolean }[] = [
    { id: 'home', label: tr('nav.home'), icon: <House aria-hidden />, target: { name: 'home' } },
    { id: 'request', label: tr('nav.request'), icon: <Hand aria-hidden />, target: { name: 'request', category: 'drinks' } },
    { id: 'card', label: tr('card.title'), icon: <Monitor aria-hidden />, target: { name: 'card' } },
    { id: 'safety', label: tr('safety.title'), icon: <ShieldCheck aria-hidden />, target: { name: 'safety' } },
    { id: 'captions', label: tr('captions.title'), icon: <Captions aria-hidden />, target: { name: 'captions' }, badge: !!unseen },
    { id: 'settings', label: tr('ife.accessibility'), icon: <SlidersHorizontal aria-hidden />, target: { name: 'settings' } },
  ];
  const activeNav = screen.name === 'review' || screen.name === 'status' || screen.name === 'care' ? 'request' : screen.name === 'requests' ? 'home' : screen.name;

  return (
    <div className={rootClass} style={rootStyle} lang={languageInfo(lang).bcp47}>
      <header className="ife-top">
        <div className="ife-brand" aria-label="HearMe">
          <JalBrand />
        </div>
        <div className="ife-seat">
          {tr('common.seat')} <strong>{seat}</strong>
        </div>
        <ConnectionPill session={session} lang={lang} demo={crewMode === 'simulated'} />
        <button className="ife-top-btn" onClick={() => go({ name: 'settings' })} aria-label={`${tr('settings.language')}: ${languageInfo(lang).nativeName}`}>
          {languageInfo(lang).nativeName}
        </button>
        <button className="ife-top-btn ife-end" onClick={() => setConfirmEnd(true)}>
          <LogOut aria-hidden /> {tr('ife.endSession')}
        </button>
      </header>

      <nav className="ife-rail" aria-label="HearMe">
        {nav.map((n) => (
          <button
            key={n.id}
            className={`ife-rail-btn${activeNav === n.id ? ' active' : ''}`}
            aria-current={activeNav === n.id ? 'page' : undefined}
            onClick={() => go(n.target)}
          >
            {n.icon}
            <span>{n.label}</span>
            {n.badge && <span className="ife-badge" aria-label="new" />}
          </button>
        ))}
      </nav>

      <main className="ife-main" ref={mainRef}>
        <CaptionToast session={session} lang={lang} onOpen={() => go({ name: 'captions' })} />
        {notice && (
          <p className="ife-notice" role="status">
            {notice}
          </p>
        )}
        {screen.name === 'home' && <HomeScreen session={session} lang={lang} go={go} />}
        {screen.name === 'request' && <RequestScreen lang={lang} category={screen.category} go={go} />}
        {screen.name === 'review' && (
          <ReviewScreen
            key={screen.needId}
            lang={lang}
            needId={screen.needId}
            initialPurpose={screen.purposeId}
            onBack={() => go({ name: 'home' })}
            onCare={screen.needId === 'unwell' ? () => go({ name: 'care' }) : undefined}
            onSend={(purposeId) => {
              const res = session.submit({ needId: screen.needId, purposeId, source: 'tap' });
              if (res.ok) go({ name: 'status', requestId: res.request.id });
              else if (res.reason === 'duplicate') {
                const open = session.getState().requests.find((r) => r.needId === screen.needId && (r.status === 'pending' || r.status === 'sent'));
                if (open) go({ name: 'status', requestId: open.id });
                setNotice(tr('requests.limit'));
              }
            }}
          />
        )}
        {screen.name === 'care' && (
          <CareScreen
            lang={lang}
            onBack={() => go(screen.from === 'home' ? { name: 'home' } : { name: 'review', needId: 'unwell' })}
            onSend={(medical) => {
              const res = session.submit({ needId: 'unwell', source: 'tap', medical });
              if (res.ok) go({ name: 'status', requestId: res.request.id });
              else if (res.reason === 'duplicate') {
                const open = session.getState().requests.find((r) => r.needId === 'unwell' && (r.status === 'pending' || r.status === 'sent'));
                if (open) go({ name: 'status', requestId: open.id });
                setNotice(tr('requests.limit'));
              }
            }}
          />
        )}
        {screen.name === 'status' && <StatusScreen session={session} lang={lang} requestId={screen.requestId} go={go} />}
        {screen.name === 'requests' && <RequestsScreen session={session} lang={lang} go={go} />}
        {screen.name === 'card' && <CardScreen lang={lang} seat={seat} needId={screen.needId} go={go} />}
        {screen.name === 'safety' && <SafetyScreen lang={lang} />}
        {screen.name === 'captions' && <CaptionsScreen session={session} lang={lang} />}
        {screen.name === 'settings' && <SettingsScreen session={session} lang={lang} onLanguage={chooseLanguage} />}
      </main>

      {replyToShow && <ReplyDialog session={session} lang={lang} requestId={replyToShow} speaker={browserSpeaker} />}
      {confirmEnd && <EndSessionDialog lang={lang} onCancel={() => setConfirmEnd(false)} onConfirm={endSession} />}
      {idleLeft !== null && <IdleDialog lang={lang} seconds={idleLeft} onStay={() => setIdleLeft(null)} onEnd={endSession} />}
      <DemoToggle open={showDemo} setOpen={setShowDemo} link={link} />
    </div>
  );
}

function DemoToggle({ open, setOpen, link }: { open: boolean; setOpen: (v: boolean) => void; link: DemoCabinLink }) {
  return (
    <>
      <button className="demo-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Prototype controls" title="Prototype controls">
        <Settings2 aria-hidden />
      </button>
      {open && <DemoControls link={link} onClose={() => setOpen(false)} />}
    </>
  );
}
