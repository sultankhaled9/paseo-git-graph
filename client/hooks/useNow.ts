import { useEffect, useState } from "react";

const NOW_TICK_MS = 60_000;

/** The current time, refreshed every minute so relative dates ("5m ago") stay accurate. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
