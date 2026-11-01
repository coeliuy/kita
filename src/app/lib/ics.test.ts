import type { Client } from '../store/types';
import { icsDate, meetingsToImport, parseICS } from './ics';

const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:abc1
DTSTART:20261020T100000Z
DTEND:20261020T110000Z
SUMMARY:Northlight monthly check-in
ATTENDEE;CN=Sam:mailto:sam@northlightlegal.co.uk
END:VEVENT
BEGIN:VEVENT
UID:abc2
DTSTART;TZID=Europe/London:20261021T140000
DTEND;TZID=Europe/London:20261021T143000
SUMMARY:Call with Priya\\, re: launch
DESCRIPTION:Talking about the
  Fennel launch
END:VEVENT
BEGIN:VEVENT
UID:allday
DTSTART;VALUE=DATE:20261022
DTEND;VALUE=DATE:20261023
SUMMARY:Holiday
END:VEVENT
BEGIN:VEVENT
UID:weekly
DTSTART:20261023T090000Z
DTEND:20261023T093000Z
RRULE:FREQ=WEEKLY
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:cancelled
DTSTART:20261024T090000Z
DTEND:20261024T100000Z
STATUS:CANCELLED
SUMMARY:Cancelled
END:VEVENT
BEGIN:VEVENT
UID:old
DTSTART:20260101T090000Z
DTEND:20260101T100000Z
SUMMARY:Too old
END:VEVENT
BEGIN:VEVENT
UID:other
DTSTART:20261025T090000Z
DTEND:20261025T094500Z
SUMMARY:Dentist
END:VEVENT
END:VCALENDAR`;

const client = (name: string, email = ''): Client =>
  ({ id: name, name, email, billing: 'hourly', rate: 0, fee: 0, included: 0, color: '', weekly: 0, currency: '', address: '', createdAt: 0 });
const clients = [client('Northlight Legal', 'accounts@northlightlegal.co.uk'), client('Fennel Bakery'), client('Harbour & Pine Studio')];
const now = new Date('2026-10-30T12:00:00Z');

describe('calendar import', () => {
  const events = parseICS(ics);

  it('reads events, joining folded lines and unescaping text', () => {
    expect(events).toHaveLength(7);
    expect(events[1]!.summary).toBe('Call with Priya, re: launch');
    expect(events[1]!.description).toBe('Talking about the Fennel launch');
    expect(events[2]!.start!.allDay).toBe(true);
    expect(events[3]!.repeats).toBe(true);
  });

  it('reads UTC and local times', () => {
    expect(icsDate('20261020T100000Z')!.toISOString()).toBe('2026-10-20T10:00:00.000Z');
    expect(icsDate('20261021T140000')!.getHours()).toBe(14);
    expect(icsDate('nonsense')).toBeNull();
  });

  it('keeps recent one-off meetings, newest first, and skips the rest', () => {
    const m = meetingsToImport(events, { clients, categories: [], importedKeys: new Set(), now });
    expect(m.map(x => x.summary)).toEqual(['Dentist', 'Call with Priya, re: launch', 'Northlight monthly check-in']);
    expect(m.map(x => x.minutes)).toEqual([45, 30, 60]);
  });

  it('matches clients by email domain or a distinctive word, and ticks them', () => {
    const m = meetingsToImport(events, { clients, categories: [], importedKeys: new Set(), now });
    const by = Object.fromEntries(m.map(x => [x.summary, [x.clientId, x.selected]]));
    expect(by['Northlight monthly check-in']).toEqual(['Northlight Legal', true]);
    expect(by['Call with Priya, re: launch']).toEqual(['Fennel Bakery', true]);
    expect(by['Dentist']).toEqual(['', false]);
  });

  it('does not match on generic words like "studio"', () => {
    const m = meetingsToImport(parseICS(ics.replace('SUMMARY:Dentist', 'SUMMARY:Studio tour')), { clients, categories: [], importedKeys: new Set(), now });
    expect(m.find(x => x.summary === 'Studio tour')!.clientId).toBe('');
  });

  it('skips meetings already imported, and uses a calls category if there is one', () => {
    const first = meetingsToImport(events, { clients, categories: [], importedKeys: new Set(), now });
    const again = meetingsToImport(events, {
      clients, categories: [{ id: 'k', name: 'Strategy and calls', createdAt: 0 }], importedKeys: new Set([first[0]!.key]), now,
    });
    expect(again).toHaveLength(2);
    expect(again.every(x => x.categoryId === 'k')).toBe(true);
  });
});
