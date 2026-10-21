import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-devanagari/600.css';
import '@fontsource/noto-sans-devanagari/700.css';
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/700.css';
import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/700.css';
import { DemoCabinLink, PassengerSession } from '@hearme/shared';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { detectHub, hubBaseUrl } from './common/hub';
import { ifeSeatFromUrl } from './common/webAdapters';
import { CrewConsole } from './crew/CrewConsole';
import { IfeApp } from './ife/IfeApp';
import { Launcher, MobilePreview } from './launcher/Launcher';
import { Stage } from './stage/Stage';
import { VoiceLab } from './voicelab/VoiceLab';
import './styles.css';
import './styles-v2.css';

type Route = 'launcher' | 'ife' | 'crew' | 'mobile' | 'stage' | 'voicelab';

function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h === 'ife' || h === 'crew' || h === 'mobile' || h === 'stage' || h === 'voicelab' ? h : 'launcher';
}

// One IFE session per page load. The seatback keeps nothing between sessions.
let ife: { link: DemoCabinLink; session: PassengerSession; seat: string } | null = null;
function ifeRuntime() {
  if (!ife) {
    const link = new DemoCabinLink('simulated');
    ife = { link, session: new PassengerSession({ link, device: 'ife' }), seat: ifeSeatFromUrl() };
    // Use the real cabin hub when this page was served by one.
    void detectHub().then((hub) => hub && link.setHubUrl(hubBaseUrl()));
  }
  return ife;
}

function Root() {
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.title = { launcher: 'HearMe', ife: 'HearMe · Seatback', crew: 'HearMe Crew', mobile: 'HearMe · Phone', stage: 'HearMe · Live demo', voicelab: 'HearMe · Voice lab' }[route];
  }, [route]);
  const idle = Number(new URLSearchParams(window.location.search).get('idle'));
  switch (route) {
    case 'ife': {
      const rt = ifeRuntime();
      return <IfeApp {...rt} idleMs={idle > 0 ? idle * 1000 : undefined} />;
    }
    case 'crew':
      return <CrewConsole />;
    case 'mobile':
      return <MobilePreview />;
    case 'stage':
      return <Stage />;
    case 'voicelab':
      return <VoiceLab />;
    default:
      return <Launcher />;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
