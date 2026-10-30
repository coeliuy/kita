/** Formatting for the screens and PDFs: money, dates and hours. */
import type { ISODate } from '../../lib/money';

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const GBP0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

/** £1,234.56 */
export const gbp = (n: number) => GBP.format(n || 0);
/** £1,235 */
export const gbp0 = (n: number) => GBP0.format(Math.round(n || 0));

const pad = (n: number) => String(n).padStart(2, '0');

/** A Date as 'YYYY-MM-DD' in the user's own time zone. */
export const ymd = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const thisMonth = () => today().slice(0, 7);

/** 'YYYY-MM-DD' as a local Date at midnight. */
export const parseYmd = (s: ISODate) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/** 30 Oct 2026 */
export const fmtDate = (s?: ISODate | null) =>
  s ? parseYmd(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** 7.5 h */
export const hrsTxt = (minutes: number) => `${(minutes / 60).toFixed(1)} h`;

/** 0:01:05 for a running timer. */
export const clockText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
};

export const padInvoiceNumber = (n: number) => String(n).padStart(3, '0');

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
