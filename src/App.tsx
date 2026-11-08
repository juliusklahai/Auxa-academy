import { useEffect, useRef, useState } from 'react';
import type { Lesson } from './core/types';
import { LESSONS } from './curriculum/lessons';
import { setExpected } from './input/expect';
import { mic, micHelp } from './input/mic';
import { midiIn } from './input/midi';
import { Icon } from './ui/Icon';
import { LessonView } from './ui/LessonView';
import { progress } from './ui/settings';
import { Dashboard, LearnList, PianoStudio, SettingsView } from './ui/Views';
import { MyMusic } from './ui/MyMusic';
import { VoiceStudio } from './ui/VoiceStudio';
import { AccountButton, AdminView, ResetPasswordSheet, UpgradeSheet } from './ui/Account';
import { isGuest, Landing, Splash } from './ui/Landing';
import { goHome, onGoHome } from './ui/nav';
import { isNativeApp, onBack } from './native/bridge';
import { InstallBanner } from './ui/InstallBanner';
import { ACCOUNTS_ENABLED } from './account/config';
import { getAccount, initAccount, openUpgrade, useAccount } from './account/store';
import { allowLesson, lessonTier, TIER_NAME } from './account/gate';

type Tab = 'home' | 'learn' | 'music' | 'voice' | 'studio' | 'settings' | 'admin';
const TABS: { id: Tab; label: string; short?: string; icon: string; title: string }[] = [
  { id: 'home', label: 'Overview', short: 'Home', icon: 'home', title: 'Piano Academy' },
  { id: 'learn', label: 'Lessons', icon: 'path', title: 'Lessons' },
  { id: 'music', label: 'My Music', short: 'Music', icon: 'doc', title: 'My Music' },
  { id: 'voice', label: 'Voice', icon: 'mic', title: 'Voice Studio' },
  { id: 'studio', label: 'Piano Studio', short: 'Piano', icon: 'piano', title: 'Piano Studio' },
  { id: 'settings', label: 'Setup', icon: 'settings', title: 'Setup' },
];

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
      <button className={`pill io ${micOn ? 'live' : ''}`} aria-label={micOn ? 'Microphone on: tap to stop' : 'Start microphone'} onClick={toggleMic} title="Listen to an acoustic piano through the microphone">
        <Icon name="mic" size={16} /> <span className="pill-label">{micOn ? 'Listening' : 'Microphone'}</span>
      </button>
      <button className={`pill io ${midiOn ? 'live' : ''}`} aria-label={midiOn ? 'MIDI keyboard connected' : 'Connect MIDI keyboard'} onClick={async () => { try { await midiIn.connect(); } catch { /* unsupported */ } openSetup(); }} title="Connect a MIDI keyboard">
        <Icon name="midi" size={16} /> <span className="pill-label">{midiOn ? 'MIDI on' : 'MIDI'}</span>
      </button>
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [exStart, setExStart] = useState<number | undefined>(undefined);
  const [singPart, setSingPart] = useState<'S' | 'A' | 'T' | 'B' | null>(null);
  const [songId, setSongId] = useState<string | null>(null);
  const account = useAccount();
  const [, bump] = useState(0);
  // Android back button (inside the Maestro app): close the lesson, then go back to Home, then leave
  const navRef = useRef({ lesson, tab });
  navRef.current = { lesson, tab };
  useEffect(() => onBack(() => {
    if (navRef.current.lesson) { setLesson(null); return true; }
    if (navRef.current.tab !== 'home') { setTab('home'); return true; }
    return false;
  }), []);
  useEffect(() => onGoHome(() => { setLesson(null); setSongId(null); setTab('home'); window.scrollTo({ top: 0 }); }), []);
  useEffect(() => { void initAccount(); if (isNativeApp) midiIn.connect().catch(() => {}); /* the app: MIDI keyboards just work */ }, []);
  const open = (l: Lesson, ex?: number) => {
    if (!allowLesson(getAccount().ent, l)) { openUpgrade(`Level ${l.level} is part of ${TIER_NAME[lessonTier(l)]}`); return; }
    setExStart(ex); setLesson(l); setTab(l.track === 'voice' ? 'voice' : 'learn');
  };
  const nextLesson = lesson ? LESSONS.find((l) => l !== lesson && (l.track ?? 'piano') === (lesson.track ?? 'piano') && !progress.lessonComplete(l) && progress.lessonUnlocked(l, LESSONS)) : undefined;
  useEffect(() => { if (!lesson) setExpected(null); }, [lesson, tab]);
  const tabs = account.ent.admin ? [...TABS, { id: 'admin' as Tab, label: 'Admin', icon: 'lock', title: 'Admin' }] : TABS;
  const title = lesson ? lesson.title : tabs.find((t) => t.id === tab)?.title ?? '';

  if (ACCOUNTS_ENABLED && !account.user && !isGuest()) {
    if (!account.ready) return <Splash />;
    return <Landing onStart={() => bump((x) => x + 1)} />;
  }

  return (
    <div className="backdrop">
      <div className="device">
        <header className="topbar">
          <div className="title-tab">
            <button className="circle brand" onClick={goHome} aria-label="Home" title="Home"><i /><i /><i /></button>
            {lesson && <button className="circle" onClick={() => setLesson(null)} aria-label="Close lesson" title="Back to the lesson list"><Icon name="close" size={16} /></button>}
            <div className="title-text">
              {lesson && <small>Level {lesson.level} · {lesson.id}</small>}
              <h1>{title}</h1>
            </div>
          </div>
          <svg className="tab-swoop" viewBox="0 0 90 64" preserveAspectRatio="none" aria-hidden><path d="M0 0 C 46 0, 40 64, 90 64 L 0 64 Z" /></svg>
          <nav className="pills" aria-label="Main">
            {tabs.map((t) => (
              <button key={t.id} className={`pill tabpill ${tab === t.id ? 'on' : ''}`} aria-current={tab === t.id}
                onClick={() => { setTab(t.id); setLesson(null); }}>
                <Icon name={t.icon} size={16} /> <span className="pill-label">{t.label}</span>
              </button>
            ))}
            <span className="pill-gap" />
            <InputPills openSetup={() => { setTab('settings'); setLesson(null); }} />
            <AccountButton onOpen={() => { setTab('settings'); setLesson(null); }} />
          </nav>
        </header>
        <main className="panel">
          {lesson
            ? <LessonView key={`${lesson.id}-${exStart ?? ''}`} lesson={lesson} initialExercise={exStart} onNextLesson={nextLesson ? () => open(nextLesson) : undefined} />
            : <>
                {tab === 'home' && <><InstallBanner /><Dashboard openLesson={open} /></>}
                {tab === 'learn' && <LearnList openLesson={open} openSong={(id) => { setSongId(id); setTab('music'); }} />}
                {tab === 'music' && <MyMusic singPart={singPart} onSingHandled={() => setSingPart(null)} songId={songId} onSongHandled={() => setSongId(null)} />}
                {tab === 'voice' && <VoiceStudio openLesson={open} singChoir={(p) => { setSingPart(p); setTab('music'); }} />}
                {tab === 'studio' && <PianoStudio />}
                {tab === 'settings' && <SettingsView />}
                {tab === 'admin' && <AdminView />}
              </>}
        </main>
        {/* phones: the main sections live in a thumb-sized bar at the bottom */}
        <nav className="tabbar" aria-label="Sections">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id && !lesson ? 'on' : ''} aria-current={tab === t.id && !lesson}
              onClick={() => { setTab(t.id); setLesson(null); window.scrollTo({ top: 0 }); }}>
              <span className="tb-ic"><Icon name={t.icon} size={20} /></span>
              <span className="tb-label">{t.short ?? t.label}</span>
            </button>
          ))}
        </nav>
        <UpgradeSheet /><ResetPasswordSheet />
      </div>
    </div>
  );
}
