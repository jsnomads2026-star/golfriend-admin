// ============================================================================
// Browser connectivity, as an authority input.
//
// Offline is not merely a UX state here. While offline the app cannot revalidate who the
// caller is or whether their role still holds, so previously authorized content on screen
// has to be treated as no longer authorized. `navigator.onLine` is a weak signal — it
// reports link state, not reachability — but it is a one-directional one: when it says
// offline, we certainly cannot reach the server, which is exactly the case we act on.
// ============================================================================
import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    try {
      return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
