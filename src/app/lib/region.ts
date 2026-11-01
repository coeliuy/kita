/**
 * Countries Kita knows about: their currency, tax year and how tax is
 * estimated. Only the UK has a full tax calculation; elsewhere people choose
 * the share of profit to set aside.
 */
import type { YearSystem } from '../../lib/money';
import type { Country, KitaData } from '../store/types';

export interface CountryInfo {
  code: Exclude<Country, ''>;
  name: string;
  /** Suggested home currency. */
  currency: string;
  years: YearSystem;
  /** 'uk' = UK Income Tax and NI; 'setAside' = a chosen % of profit. */
  tax: 'uk' | 'setAside';
  /** What tax added to invoices is called. */
  salesTax: string;
}

export const COUNTRIES: CountryInfo[] = [
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', years: 'uk', tax: 'uk', salesTax: 'VAT' },
  { code: 'PH', name: 'Philippines', currency: 'PHP', years: 'calendar', tax: 'setAside', salesTax: 'VAT' },
  { code: 'US', name: 'United States', currency: 'USD', years: 'calendar', tax: 'setAside', salesTax: 'Sales tax' },
  { code: 'OTHER', name: 'Somewhere else', currency: 'GBP', years: 'calendar', tax: 'setAside', salesTax: 'VAT' },
];

export const countryInfo = (code: Country): CountryInfo => COUNTRIES.find(c => c.code === code) ?? COUNTRIES[0]!;

/** The account's country (accounts from before this setting count as the UK). */
export const region = (d: KitaData) => countryInfo(d.settings.country || 'GB');
export const yearSystem = (d: KitaData): YearSystem => region(d).years;
export const homeCurrency = (d: KitaData) => d.settings.currency || 'GBP';

/**
 * A best guess at where someone is, from their device's time zone and language.
 * Only ever a suggestion: people confirm or change it.
 */
export function detectCountry(
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
  languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language],
): Exclude<Country, ''> {
  if (timeZone === 'Asia/Manila') return 'PH';
  if (timeZone === 'Europe/London' || timeZone === 'Europe/Belfast') return 'GB';
  const regions = languages.map(l => l.split('-')[1]?.toUpperCase());
  if (regions.includes('PH') || languages.some(l => l.toLowerCase().startsWith('fil'))) return 'PH';
  if (timeZone.startsWith('America/') && regions.includes('US')) return 'US';
  if (regions[0] === 'GB') return 'GB';
  if (regions[0] === 'US' && (timeZone.startsWith('America/') || timeZone.startsWith('Pacific/Honolulu'))) return 'US';
  return timeZone.startsWith('Europe/') ? 'OTHER' : 'GB';
}
