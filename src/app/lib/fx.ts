/**
 * Exchange rates from a free public service (open.er-api.com, updated daily).
 * Only the home currency code is sent. Rates are stored as "home currency
 * per 1 unit of the other currency", the way invoices use them. If the
 * service can't be reached, people type the rate in themselves.
 */
import { CURRENCIES } from '../../lib/money';
import type { FxRate } from '../store/types';

export const FX_SOURCE = 'https://open.er-api.com/v6/latest/';

/** Turn the service's reply (units of each currency per 1 home unit) into home per unit. */
export function parseRates(body: unknown, home: string, date: string, codes: readonly string[]): Record<string, FxRate> {
  const b = body as { result?: string; base_code?: string; rates?: Record<string, unknown> } | null;
  if (!b || b.result !== 'success' || b.base_code !== home || !b.rates) return {};
  const out: Record<string, FxRate> = {};
  for (const code of codes) {
    const perHome = Number(b.rates[code]);
    if (code !== home && Number.isFinite(perHome) && perHome > 0) out[code] = { rate: Math.round((1 / perHome) * 1e8) / 1e8, date };
  }
  return out;
}

/** Latest rates for every currency Kita offers, or {} if the service can't be reached. */
export async function fetchRates(home: string, date: string, extra: readonly string[] = []): Promise<Record<string, FxRate>> {
  try {
    const res = await fetch(FX_SOURCE + encodeURIComponent(home));
    if (!res.ok) return {};
    const codes = [...new Set([...CURRENCIES.map(c => c.code), ...extra])];
    return parseRates(await res.json(), home, date, codes);
  } catch {
    return {};
  }
}

/** True when a currency in use has no rate, or one older than today. */
export const ratesStale = (rates: Record<string, FxRate>, inUse: readonly string[], date: string) =>
  inUse.some(code => (rates[code]?.date ?? '') < date);
