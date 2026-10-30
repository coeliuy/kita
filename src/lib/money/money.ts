/**
 * Rounding helpers. Computers store numbers like 0.1 slightly inaccurately,
 * so anything that ends up on an invoice is worked out in whole pence first.
 */

/** Round a pound amount to the nearest penny. */
export function roundPence(pounds: number): number {
  return Math.round((pounds + Number.EPSILON) * 100) / 100;
}

/** Convert pounds to a whole number of pence. */
export function toPence(pounds: number): number {
  return Math.round((pounds + Number.EPSILON) * 100);
}

/** Add up pound amounts exactly, by summing whole pence. */
export function sumPounds(amounts: number[]): number {
  return amounts.reduce((total, a) => total + toPence(a || 0), 0) / 100;
}
