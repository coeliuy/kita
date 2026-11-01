/**
 * Currencies and foreign-currency invoices.
 *
 * Every account has a home currency: the one its income, expenses, tax and
 * goals are counted in. An invoice can be in another currency. Its amounts
 * are converted to the home currency like this:
 * - Paid, with the amount actually received recorded: that amount (the true
 *   figure after bank fees and rate changes).
 * - Otherwise: the exchange rate saved on the invoice, as an estimate.
 */
import { roundPence } from './money';
import type { Invoice } from './types';

export interface CurrencyInfo {
  code: string;
  name: string;
  /** The locale whose formatting people in that currency expect (₱1,000.00, $1,000.00). */
  locale: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'GBP', name: 'British pound', locale: 'en-GB' },
  { code: 'PHP', name: 'Philippine peso', locale: 'en-PH' },
  { code: 'USD', name: 'US dollar', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', locale: 'en-IE' },
  { code: 'AUD', name: 'Australian dollar', locale: 'en-AU' },
  { code: 'CAD', name: 'Canadian dollar', locale: 'en-CA' },
  { code: 'NZD', name: 'New Zealand dollar', locale: 'en-NZ' },
  { code: 'SGD', name: 'Singapore dollar', locale: 'en-SG' },
];

export const currencyInfo = (code: string): CurrencyInfo =>
  CURRENCIES.find(c => c.code === code) ?? { code, name: code, locale: 'en-GB' };

const formatters = new Map<string, Intl.NumberFormat>();

/** £1,234.56 / ₱1,234.56 / $1,234.56; `whole` rounds to whole units. */
export function formatMoney(amount: number, code: string, whole = false): string {
  const key = `${code}|${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(currencyInfo(code).locale, {
      style: 'currency', currency: code, ...(whole ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}),
    });
    formatters.set(key, f);
  }
  return f.format(whole ? Math.round(amount || 0) : amount || 0);
}

/** The currency's symbol on its own, e.g. '£', '₱', '$'. */
export const currencySymbol = (code: string): string =>
  new Intl.NumberFormat(currencyInfo(code).locale, { style: 'currency', currency: code })
    .formatToParts(0).find(p => p.type === 'currency')?.value ?? code;

/** Whether an invoice is in a currency other than the home one. */
export const isForeign = (inv: Pick<Invoice, 'fxRate'>) => inv.fxRate != null && inv.fxRate > 0;

/**
 * An invoice amount (its subtotal or total) in the home currency.
 * Amounts already in the home currency are returned as they are.
 */
export function inHome(inv: Pick<Invoice, 'fxRate' | 'receivedHome' | 'status' | 'subtotal' | 'total'>, field: 'subtotal' | 'total'): number {
  const amount = inv[field];
  if (!isForeign(inv)) return amount;
  if (inv.status === 'paid' && inv.receivedHome != null && inv.total > 0) {
    // What arrived is the total; the subtotal's share of it excludes the VAT/sales tax.
    return roundPence(inv.receivedHome * (amount / inv.total));
  }
  return roundPence(amount * inv.fxRate!);
}
