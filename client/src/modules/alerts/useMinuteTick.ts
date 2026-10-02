import { useEffect, useState } from 'react';

/** "now" that refreshes once a minute while `active` and the tab is visible (and immediately when the tab comes back) */
export function useMinuteTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => { if (!document.hidden) setNow(Date.now()); };
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    tick();
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [active]);
  return now;
}
