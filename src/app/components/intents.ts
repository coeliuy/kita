/**
 * Requests to open something on another screen, such as "add a new task"
 * from the quick-start box. The screen picks the request up when it appears.
 */
import { useEffect, useRef } from 'react';

export type Intent = 'newTask' | 'manualEntry';

let pending: Intent | null = null;
const listeners = new Set<() => void>();

export function requestIntent(intent: Intent) {
  pending = intent;
  for (const l of listeners) l();
}

/** Run `handler` when `intent` is requested, including just before this screen appeared. */
export function useIntent(intent: Intent, handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const check = () => {
      if (pending !== intent) return;
      pending = null;
      ref.current();
    };
    check();
    listeners.add(check);
    return () => void listeners.delete(check);
  }, [intent]);
}
