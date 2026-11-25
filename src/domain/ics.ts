const CRLF = '\r\n';

function formatDefaultDtstamp(): string {
  const iso = new Date().toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildVEventLines(params: {
  uid: string;
  dtstamp: string;
  dtstart: string;
  rrule: string;
  summary: string;
  description: string;
}): string[] {
  const escapedSummary = escapeIcsText(params.summary);
  const escapedDesc = escapeIcsText(params.description);
  return [
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTAMP:${params.dtstamp}`,
    `DTSTART:${params.dtstart}`,
    `RRULE:${params.rrule}`,
    `SUMMARY:${escapedSummary}`,
    `DESCRIPTION:${escapedDesc}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapedDesc}`,
    'END:VALARM',
    'END:VEVENT',
  ];
}

function wrapVCalendar(eventLines: string[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FitTrack PWA//Fitness & Macro Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...eventLines,
    'END:VCALENDAR',
  ];
  return lines.join(CRLF) + CRLF;
}

export function generateDailyCheckInIcs(dtstamp?: string): string {
  const stamp = dtstamp ?? formatDefaultDtstamp();
  return wrapVCalendar(
    buildVEventLines({
      uid: 'daily-evening-checkin@fitnesstracker.local',
      dtstamp: stamp,
      dtstart: '20261124T200000',
      rrule: 'FREQ=DAILY',
      summary: 'Daily Fitness & Macro Check-In',
      description:
        "Time to finish logging today's meals and mark your workout.",
    }),
  );
}

export function generateSaturdayWeighInIcs(dtstamp?: string): string {
  const stamp = dtstamp ?? formatDefaultDtstamp();
  return wrapVCalendar(
    buildVEventLines({
      uid: 'saturday-weighin-report@fitnesstracker.local',
      dtstamp: stamp,
      dtstart: '20261128T070000',
      rrule: 'FREQ=WEEKLY;BYDAY=SA',
      summary: 'Saturday Weigh-In & Weekly Report',
      description: 'Morning weigh-in & weekly progress report ready.',
    }),
  );
}

export function generateCombinedRemindersIcs(dtstamp?: string): string {
  const stamp = dtstamp ?? formatDefaultDtstamp();
  const dailyLines = buildVEventLines({
    uid: 'daily-evening-checkin@fitnesstracker.local',
    dtstamp: stamp,
    dtstart: '20261124T200000',
    rrule: 'FREQ=DAILY',
    summary: 'Daily Fitness & Macro Check-In',
    description: "Time to finish logging today's meals and mark your workout.",
  });
  const saturdayLines = buildVEventLines({
    uid: 'saturday-weighin-report@fitnesstracker.local',
    dtstamp: stamp,
    dtstart: '20261128T070000',
    rrule: 'FREQ=WEEKLY;BYDAY=SA',
    summary: 'Saturday Weigh-In & Weekly Report',
    description: 'Morning weigh-in & weekly progress report ready.',
  });

  return wrapVCalendar([...dailyLines, ...saturdayLines]);
}
