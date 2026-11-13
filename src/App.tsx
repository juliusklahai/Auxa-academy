import { useEffect, useRef, useState } from 'react';
import { AuxaWord } from './ui/Brand';
import type { Lesson } from './core/types';
import { LESSONS } from './curriculum/lessons';
import { setExpected } from './input/expect';
import { mic, micHelp } from './input/mic';
import { midiIn } from './input/midi';
import { Icon } from './ui/Icon';
import { LessonView } from './ui/LessonView';
import { bumpProgress, progress, useProgressVersion } from './ui/settings';
import { Dashboard, LearnList, PianoStudio, SettingsView } from './ui/Views';
import { MyMusic } from './ui/MyMusic';
import { VoiceStudio } from './ui/VoiceStudio';
import { AccountSheet, AdminView, ResetPasswordSheet, UpgradeSheet, UserMenu } from './ui/Account';
import { isGuest, Landing, Splash } from './ui/Landing';
import { LegalPage, useLegalRoute } from './ui/Legal';
import { appGoal, AppUpgrade, AuthScreen, markPaywallSeen, onboarded, Onboarding, Paywall, paywallSeen } from './ui/AppFlow';
import { goHome, onGoHome } from './ui/nav';
import { isNativeApp, onBack } from './native/bridge';
import { InstallBanner } from './ui/InstallBanner';
import { NotchBar } from './ui/NotchBar';
import { PeopleView } from './ui/People';
import { CertificateSheet } from './ui/Certificate';
import { PlacementTest } from './ui/Placement';
import { checkCerts } from './progress/certs';
import { LESSONS as ALL_LESSONS, lessonById } from './curriculum/lessons';
import { readRoute, writeRoute } from './ui/route';
import { stopSpeaking } from './ui/voice';
import { audio } from './audio/engine';
import { ACCOUNTS_ENABLED } from './account/config';
import { getAccount, initAccount, openUpgrade, useAccount, useUpgrade } from './account/store';
import { allowLesson, lessonTier, TIER_NAME } from './account/gate';

type Tab = 'home' | 'learn' | 'music' | 'voice' | 'studio' | 'people' | 'settings' | 'admin';
const TABS: { id: Tab; label: string; short?: string; icon: string; title: string }[] = [
  { id: 'home', label: 'Overview', short: 'Home', icon: 'home', title: 'Piano Academy' },
  { id: 'learn', label: 'Lessons', icon: 'path', title: 'Lessons' },
  { id: 'music', label: 'My Music', short: 'Music', icon: 'doc', title: 'My Music' },
  { id: 'voice', label: 'Voice', icon: 'mic', title: 'Voice Studio' },
  { id: 'studio', label: 'Piano Studio', short: 'Piano', icon: 'piano', title: 'Piano Studio' },
  { id: 'people', label: 'People', icon: 'people', title: 'People' },
];
const MENU_TITLES: Partial<Record<Tab, string>> = { settings: 'Setup', admin: 'Admin' };

function InputPills({ openSetup }: { openSetup: () => void }) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const micOn = mic.active;
  const midiOn = midiIn.devices.length > 0;
  const toggleMic = async () => {
    try { if (mic.active) mic.stop(); else await mic.start(); } catch (e) { mic.lastError = micHelp(e); openSetup(); }
    force((x) => x + 1);
  };
  return (
    <>
      <button className={`nav-io ${micOn ? 'live' : ''}`} aria-label={micOn ? 'Microphone on: tap to stop' : 'Start microphone'} onClick={toggleMic} title={micOn ? 'Listening: tap to stop' : 'Start the microphone'}>
        <Icon name="mic" size={17} />
      </button>
      <button className={`nav-io ${midiOn ? 'live' : ''}`} aria-label={midiOn ? 'MIDI keyboard connected' : 'Connect MIDI keyboard'} onClick={async () => { try { await midiIn.connect(); } catch { /* unsupported */ } if (!midiIn.devices.length) openSetup(); force((x) => x + 1); }} title={midiOn ? 'MIDI keyboard connected' : 'Connect a MIDI keyboard'}>
        <Icon name="midi" size={17} />
      </button>
    </>
  );
}

export default function App() {
  // the phone app opens on the lessons (or the voice studio for singers); the website on the overview
  // a refresh brings you back where you were (this browser tab only)
  const [saved] = useState(readRoute);
  const [tab, setTab] = useState<Tab>(() => (saved?.tab as Tab) ?? (isNativeApp ? (appGoal() === 'voice' ? 'voice' : 'learn') : 'home'));
  const [lesson, setLesson] = useState<Lesson | null>(() => (saved?.lesson ? lessonById(saved.lesson) ?? null : null));
  useEffect(() => writeRoute({ tab, lesson: lesson?.id ?? null }), [tab, lesson]);
  // moving to another page or lesson silences the coach and any notes still sounding
  const firstNav = useRef(true);
  useEffect(() => { if (firstNav.current) { firstNav.current = false; return; } stopSpeaking(); audio.stopAll(); }, [tab, lesson?.id]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { stopSpeaking(); audio.stopAll(); } };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const [exStart, setExStart] = useState<number | undefined>(undefined);
  const [singPart, setSingPart] = useState<'S' | 'A' | 'T' | 'B' | null>(null);
  const [songId, setSongId] = useState<string | null>(null);
  const [xmlToOpen, setXmlToOpen] = useState<string | null>(null);
  const account = useAccount();
  const [, bump] = useState(0);
  // Android back button (inside the Auxa app): close the lesson, then go back to Home, then leave
  const navRef = useRef({ lesson, tab });
  navRef.current = { lesson, tab };
  useEffect(() => onBack(() => {
    if (navRef.current.lesson) { setLesson(null); return true; }
    if (navRef.current.tab !== 'home') { setTab('home'); return true; }
    return false;
  }), []);
  // The logo, from any screen: the Auxa home page (landing). Without accounts: the Overview.
  const [landing, setLanding] = useState(false);
  const [pastLanding, setPastLanding] = useState(!!saved);
  const [acctOpen, setAcctOpen] = useState(false);
  const [cert, setCert] = useState<{ level: number; date: string; fresh?: boolean } | null>(null);
  const [placing, setPlacing] = useState(false);
  const pv = useProgressVersion();
  // a level just finished: record the certificate and show it
  useEffect(() => { const n = checkCerts(progress, ALL_LESSONS); if (n.length) { const lv = n[n.length - 1]; setCert({ level: lv, date: progress.data.certs![lv], fresh: true }); bumpProgress(); } }, [pv]);
  useEffect(() => {
    const c = (e: Event) => setCert((e as CustomEvent).detail);
    const p = () => { setPlacing(true); window.scrollTo({ top: 0 }); };
    window.addEventListener('maestro:cert', c); window.addEventListener('maestro:placement', p);
    return () => { window.removeEventListener('maestro:cert', c); window.removeEventListener('maestro:placement', p); };
  }, []);
  useEffect(() => { const f = () => setAcctOpen(true); window.addEventListener('maestro:account', f); return () => window.removeEventListener('maestro:account', f); }, []);
  useEffect(() => { const f = (e: Event) => { setTab((e as CustomEvent).detail as Tab); setLesson(null); window.scrollTo({ top: 0 }); }; window.addEventListener('maestro:tab', f); return () => window.removeEventListener('maestro:tab', f); }, []);
  useEffect(() => onGoHome(() => {
    setLesson(null); setSongId(null); setTab('home');
    if (ACCOUNTS_ENABLED && !isNativeApp) setLanding(true); // the app has no web home page
    window.scrollTo({ top: 0 });
  }), []);
  useEffect(() => (landing ? onBack(() => { setLanding(false); return true; }, 20) : undefined), [landing]);
  useEffect(() => { void initAccount(); if (isNativeApp) midiIn.connect().catch(() => {}); /* the app: MIDI keyboards just work */ }, []);
  const open = (l: Lesson, ex?: number) => {
    if (!allowLesson(getAccount().ent, l)) { openUpgrade(`Level ${l.level} is part of ${TIER_NAME[lessonTier(l)]}`); return; }
    setExStart(ex); setLesson(l); setTab(l.track === 'voice' ? 'voice' : 'learn');
  };
  const nextLesson = lesson ? LESSONS.find((l) => l !== lesson && (l.track ?? 'piano') === (lesson.track ?? 'piano') && !progress.lessonComplete(l) && progress.lessonUnlocked(l, LESSONS)) : undefined;
  useEffect(() => { if (!lesson) setExpected(null); }, [lesson, tab]);
  const tabs = TABS;
  const title = lesson ? lesson.title : MENU_TITLES[tab] ?? tabs.find((t) => t.id === tab)?.title ?? '';
  const go = (t: Tab) => { setTab(t); setLesson(null); window.scrollTo({ top: 0 }); };

  const upgradeReason = useUpgrade();
  const legal = useLegalRoute();
  // Legal pages open on top of everything, signed in or not (app stores link to them).
  if (legal) return <LegalPage id={legal} />;
  // The website starts with its home page; "Start free" / "Open app" continues into the same start as
  // the phone app. The phone app starts there directly.
  if (ACCOUNTS_ENABLED && !isNativeApp && (landing || (!account.user && !isGuest() && !pastLanding))) {
    if (!account.ready && !landing) return <Splash />;
    return <Landing returning={!!account.user || isGuest()} onStart={() => { setLanding(false); setPastLanding(true); bump((x) => x + 1); window.scrollTo({ top: 0 }); }} />;
  }
  // First run: onboarding, then sign up / sign in (or try it first), then the plans page once, then the lessons.
  if (!onboarded() && !account.user && (isNativeApp || ACCOUNTS_ENABLED)) return <Onboarding onDone={() => { if (!isNativeApp) setTab(appGoal() === 'voice' ? 'voice' : 'learn'); bump((x) => x + 1); }} />;
  if (ACCOUNTS_ENABLED && !account.user && !isGuest()) {
    if (!account.ready) return <Splash />;
    return <AuthScreen onGuest={() => bump((x) => x + 1)} />;
  }
  if (ACCOUNTS_ENABLED && account.user && !paywallSeen() && !account.ent.pro) {
    return <Paywall reason="Welcome! Pick a plan or start free" onClose={() => { markPaywallSeen(); bump((x) => x + 1); }} />;
  }

  return (
    <div className="backdrop">
      <div className="device">
        <header className="appbar">
          <button className="app-logo" onClick={goHome} aria-label="Auxa home page" title="Home page">
            <span className="app-logo-word"><AuxaWord height={24} /></span>
          </button>
          {lesson && (
            <div className="app-crumb">
              <button className="nav-io" onClick={() => setLesson(null)} aria-label="Back to lessons" title="Back to the lesson list"><Icon name="back" size={17} /></button>
              <div className="title-text"><small>Level {lesson.level} · {lesson.id}</small><h1>{title}</h1></div>
            </div>
          )}
          {!lesson && MENU_TITLES[tab] && <div className="app-crumb"><div className="title-text"><h1>{title}</h1></div></div>}
          <nav className="app-tabs" aria-label="Main">
            {tabs.map((t) => (
              <button key={t.id} className={tab === t.id && !lesson ? 'on' : ''} aria-current={tab === t.id && !lesson} onClick={() => go(t.id)}>
                <Icon name={t.icon} size={15} /><span>{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="app-end">
            <InputPills openSetup={() => go('settings')} />
            <UserMenu onAccount={() => setAcctOpen(true)} onSetup={() => go('settings')} onAdmin={() => go('admin')} onHome={goHome} current={tab} />
          </div>
        </header>
        <main className="panel">
          {lesson
            ? <LessonView key={`${lesson.id}-${exStart ?? ''}`} lesson={lesson} initialExercise={exStart} onNextLesson={nextLesson ? () => open(nextLesson) : undefined} nextLocked={!!nextLesson && !allowLesson(getAccount().ent, nextLesson)} />
            : <>
                {tab === 'home' && <><InstallBanner /><Dashboard openLesson={open} /></>}
                {tab === 'learn' && <LearnList openLesson={open} openSong={(id) => { setSongId(id); setTab('music'); }} openScore={(x) => { setXmlToOpen(x); setTab('music'); window.scrollTo({ top: 0 }); }} />}
                {tab === 'music' && <MyMusic singPart={singPart} onSingHandled={() => setSingPart(null)} songId={songId} onSongHandled={() => setSongId(null)} xml={xmlToOpen} onXmlHandled={() => setXmlToOpen(null)} />}
                {tab === 'voice' && <VoiceStudio openLesson={open} singChoir={(p) => { setSingPart(p); setTab('music'); }} openScore={(x) => { setXmlToOpen(x); setTab('music'); window.scrollTo({ top: 0 }); }} />}
                {tab === 'studio' && <PianoStudio />}
                {tab === 'people' && <PeopleView openLesson={open} />}
                {tab === 'settings' && <SettingsView />}
                {tab === 'admin' && <AdminView />}
              </>}
        </main>
        {/* phones: the main sections live in a thumb-sized bar at the bottom, with a liquid notch under the active one */}
        <NotchBar items={tabs.map((t) => ({ id: t.id, icon: t.icon, label: t.short ?? t.label }))} active={tab}
          onPick={(id) => { setTab(id as Tab); setLesson(null); window.scrollTo({ top: 0 }); }} />
        {isNativeApp ? <AppUpgrade reason={upgradeReason} /> : <UpgradeSheet />}<ResetPasswordSheet />{acctOpen && <AccountSheet onClose={() => setAcctOpen(false)} />}
        {placing && <div className="place-overlay"><PlacementTest onDone={() => setPlacing(false)} /></div>}
        {cert && <CertificateSheet level={cert.level} date={cert.date} fresh={cert.fresh} onClose={() => setCert(null)} />}
      </div>
    </div>
  );
}
