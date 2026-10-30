/**
 * Turning a calendar export (.ics file from Google Calendar, Outlook or Apple
 * Calendar) into time entries for meetings. The file is read in the browser;
 * it's never uploaded anywhere.
 */
import type { Category, Client } from '../store/types';
import { ymd } from './format';

export interface CalendarEvent {
  uid?: string;
  summary?: string;
  description?: string;
  start?: { value: string; allDay: boolean };
  end?: { value: string; allDay: boolean };
  attendees: string[];
  status?: string;
  repeats: boolean;
}

/** Undo the escaping .ics files use for commas, semicolons and line breaks. */
const unescape = (v: string) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

export function parseICS(text: string): CalendarEvent[] {
  // Long lines are folded onto the next line starting with a space; join them back up.
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events: CalendarEvent[] = [];
  let cur: CalendarEvent | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { attendees: [], repeats: false }; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i), value = line.slice(i + 1), name = key.split(';')[0]!.toUpperCase();
    if (name === 'DTSTART' || name === 'DTEND') {
      const t = { value, allDay: /VALUE=DATE(?!-)/i.test(key) || /^\d{8}$/.test(value) };
      if (name === 'DTSTART') cur.start = t; else cur.end = t;
    } else if (name === 'SUMMARY') cur.summary = unescape(value);
    else if (name === 'DESCRIPTION') cur.description = unescape(value);
    else if (name === 'UID') cur.uid = value;
    else if (name === 'ATTENDEE' || name === 'ORGANIZER') cur.attendees.push(value.toLowerCase());
    else if (name === 'STATUS') cur.status = value.toUpperCase();
    else if (name === 'RRULE') cur.repeats = true;
  }
  return events;
}

/** 20261020T100000Z (UTC) or 20261020T100000 (local time) as a Date. */
export function icsDate(v: string): Date | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m;
  return z ? new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s)) : new Date(+y!, +mo! - 1, +d!, +h, +mi, +s);
}

/** Words in client names too common to match a meeting on their own. */
const GENERIC = ['studio', 'digital', 'limited', 'group', 'agency', 'design', 'media', 'marketing', 'creative', 'legal', 'services', 'company', 'consulting', 'solutions'];

export interface Meeting {
  /** Identifies the meeting so it isn't imported twice. */
  key: string;
  summary: string;
  date: string;
  time: string;
  minutes: number;
  clientId: string;
  categoryId: string;
  selected: boolean;
  start: number;
}

/**
 * Meetings from the last `days` days worth importing, newest first.
 * Skips all-day, repeating, cancelled, very short (under 5 minutes) and very
 * long (over 10 hours) events, and meetings already imported. Matches a client
 * by name, by an attendee's email domain, or by a distinctive word in the name,
 * and ticks those meetings.
 */
export function meetingsToImport(
  events: CalendarEvent[],
  opts: { clients: Client[]; categories: Category[]; importedKeys: Set<string>; now: Date; days?: number },
): Meeting[] {
  const from = new Date(opts.now.getTime() - (opts.days ?? 60) * 86_400_000);
  const meetCat = opts.categories.find(c => /call|meet/i.test(c.name));
  const pad = (n: number) => String(n).padStart(2, '0');
  const out: Meeting[] = [];
  for (const ev of events) {
    if (!ev.start || !ev.end || ev.start.allDay || ev.repeats || ev.status === 'CANCELLED') continue;
    const st = icsDate(ev.start.value), en = icsDate(ev.end.value);
    if (!st || !en || st < from || st > opts.now) continue;
    const minutes = Math.round((en.getTime() - st.getTime()) / 60000);
    if (minutes < 5 || minutes > 600) continue;
    const key = `${ev.uid || ev.summary || ''}@${st.getTime()}`;
    if (opts.importedKeys.has(key)) continue;
    const hay = [ev.summary, ev.description, ...ev.attendees].join(' ').toLowerCase();
    const client = opts.clients.find(c => {
      const name = c.name.toLowerCase();
      if (hay.includes(name)) return true;
      const domain = c.email.split('@')[1];
      if (domain && hay.includes(`@${domain.toLowerCase()}`)) return true;
      return name.split(/[^a-z0-9]+/).some(w => w.length >= 4 && !GENERIC.includes(w) && new RegExp(`\\b${w}\\b`).test(hay));
    });
    out.push({
      key, summary: ev.summary || 'Meeting', date: ymd(st), time: `${pad(st.getHours())}:${pad(st.getMinutes())}`, minutes,
      clientId: client?.id ?? '', categoryId: meetCat?.id ?? '', selected: !!client, start: st.getTime(),
    });
  }
  return out.sort((a, b) => b.start - a.start).slice(0, 150);
}
