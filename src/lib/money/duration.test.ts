import { formatHM, parseDuration } from './duration';

describe('parseDuration', () => {
  it.each([
    ['1:30', 90],
    ['0:45', 45],
    ['1.5', 90],
    ['2', 120],
    ['1.5h', 90],
    ['1.5 hours', 90],
    ['2hrs', 120],
    ['90m', 90],
    ['90 mins', 90],
    ['45 minutes', 45],
    ['1h30', 90],
    ['1h 30m', 90],
    [' 1H30M ', 90],
    ['24', 1440],
  ])('reads "%s" as %i minutes', (input, minutes) => {
    expect(parseDuration(input)).toEqual({ ok: true, minutes });
  });

  it('asks about a bare number over 24 instead of saving it as hours', () => {
    // Previously "90" was silently saved as 90 hours.
    expect(parseDuration('90')).toEqual({ ok: false, error: 'Did you mean 90 minutes? Type 90m.' });
  });

  it.each(['', 'abc', '1:75', '1h75', '0', '0:00', '25h', '1500m'])('rejects "%s"', input => {
    expect(parseDuration(input).ok).toBe(false);
  });
});

describe('formatHM', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [90, '1:30'],
    [600, '10:00'],
  ])('%i minutes → %s', (m, s) => expect(formatHM(m)).toBe(s));
});
