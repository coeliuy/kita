/**
 * Reading what people type into the "Time spent" box.
 *
 * Accepted:  1:30   1.5   1.5h   1.5 hours   90m   90 mins   1h30   1h 30m
 * Rejected:  a bare number over 24 (like "90"), which people usually mean as
 *            minutes; we ask them to type "90m" instead of guessing.
 *            Anything over 24 hours, since one entry can't be longer than a day.
 */

export const MAX_ENTRY_MINUTES = 24 * 60;

export type DurationResult = { ok: true; minutes: number } | { ok: false; error: string };

const GENERIC_ERROR = 'Enter the time as 1:30, 1.5 or 90m.';

export function parseDuration(input: string): DurationResult {
  const s = String(input ?? '').trim().toLowerCase();
  if (!s) return { ok: false, error: GENERIC_ERROR };
  let m: RegExpMatchArray | null;
  let minutes: number | null = null;

  if ((m = s.match(/^(\d+):(\d{1,2})$/))) {
    // 1:30 (hours:minutes)
    if (+m[2]! >= 60) return { ok: false, error: 'Minutes after the colon must be under 60.' };
    minutes = +m[1]! * 60 + +m[2]!;
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)\s*m(?:ins?|inutes?)?$/))) {
    // 90m, 90 mins
    minutes = Math.round(+m[1]!);
  } else if ((m = s.match(/^(\d+)\s*h(?:rs?|ours?)?\s*(\d{1,2})\s*m?(?:ins?|inutes?)?$/))) {
    // 1h30, 1h 30m
    if (+m[2]! >= 60) return { ok: false, error: 'Minutes must be under 60.' };
    minutes = +m[1]! * 60 + +m[2]!;
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?$/))) {
    // 1.5h, 2 hours
    minutes = Math.round(+m[1]! * 60);
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) {
    // A bare number means hours, but only up to 24
    const n = +m[1]!;
    if (n > 24) return { ok: false, error: `Did you mean ${m[1]} minutes? Type ${m[1]}m.` };
    minutes = Math.round(n * 60);
  }

  if (minutes === null) return { ok: false, error: GENERIC_ERROR };
  if (minutes <= 0) return { ok: false, error: 'Enter a time longer than zero.' };
  if (minutes > MAX_ENTRY_MINUTES) return { ok: false, error: 'One entry can’t be longer than 24 hours.' };
  return { ok: true, minutes };
}

/** 90 -> '1:30' */
export function formatHM(minutes: number): string {
  const m = Math.round(minutes || 0);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
