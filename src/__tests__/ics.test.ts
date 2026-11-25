import { describe, expect, it } from 'vitest';
import {
  generateCombinedRemindersIcs,
  generateDailyCheckInIcs,
  generateSaturdayWeighInIcs,
} from '../domain/ics';

describe('ics generator', () => {
  it('uses strict CRLF line endings with zero bare LF', () => {
    const files = [
      generateDailyCheckInIcs('20261125T000000Z'),
      generateSaturdayWeighInIcs('20261125T000000Z'),
      generateCombinedRemindersIcs('20261125T000000Z'),
    ];
    for (const content of files) {
      expect(content.endsWith('\r\n')).toBe(true);
      const withoutCrlf = content.replace(/\r\n/g, '');
      expect(withoutCrlf).not.toContain('\n');
      expect(withoutCrlf).not.toContain('\r');
    }
  });

  it('generates valid Daily 8:00 PM reminder .ics', () => {
    const ics = generateDailyCheckInIcs('20261125T000000Z');
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART:20261124T200000\r\n');
    expect(ics).toContain('RRULE:FREQ=DAILY\r\n');
    expect(ics).toContain(
      "DESCRIPTION:Time to finish logging today's meals and mark your workout.\r\n",
    );
    expect(ics).toContain('BEGIN:VALARM\r\n');
    expect(ics).toContain('END:VCALENDAR\r\n');
  });

  it('generates valid Saturday 7:00 AM reminder .ics', () => {
    const ics = generateSaturdayWeighInIcs('20261125T000000Z');
    expect(ics).toContain('DTSTART:20261128T070000\r\n');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA\r\n');
    expect(ics).toContain(
      'DESCRIPTION:Morning weigh-in & weekly progress report ready.\r\n',
    );
    expect(ics).toContain('BEGIN:VALARM\r\n');
  });

  it('combines both recurring reminders into one calendar', () => {
    const combined = generateCombinedRemindersIcs('20261125T000000Z');
    const eventStarts = combined.match(/BEGIN:VEVENT/g);
    expect(eventStarts).toHaveLength(2);
    expect(combined).toContain('RRULE:FREQ=DAILY\r\n');
    expect(combined).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA\r\n');
  });
});
