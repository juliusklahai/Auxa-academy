// App-wide navigation requests (e.g. the logo, from any screen, goes home).
const HOME = 'maestro:home';
export const goHome = () => window.dispatchEvent(new Event(HOME));
export const onGoHome = (f: () => void) => { window.addEventListener(HOME, f); return () => window.removeEventListener(HOME, f); };
