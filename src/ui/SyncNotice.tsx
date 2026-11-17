// Practice only counts toward a certificate when the server can witness it (signed in and online).
// Say so up front, so nobody finishes a level offline and then finds it cannot be sealed.
import { useEffect, useState } from 'react';
import { ACCOUNTS_ENABLED } from '../account/config';
import { useAccount } from '../account/store';
import { Icon } from './Icon';

export function useOnline() {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

export function SyncNotice() {
  const online = useOnline();
  const a = useAccount();
  if (!ACCOUNTS_ENABLED) return null;
  if (!online) return (
    <div className="sync-notice" role="status"><Icon name="info" size={16} />
      <span><b>You are offline.</b> Keep practising: your passes are saved on this phone and sent to your account when you are back online. To seal a certificate, you will then pass one exercise of each of those lessons online. Staying online is quickest.</span>
    </div>
  );
  if (!a.user) return (
    <div className="sync-notice" role="status"><Icon name="info" size={16} />
      <span><b>Not signed in.</b> Practice only counts toward a certificate on an account. <button className="link-btn" onClick={() => window.dispatchEvent(new Event('maestro:account'))}>Sign in</button> to have your passes verified.</span>
    </div>
  );
  return null;
}
