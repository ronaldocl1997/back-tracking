import type { DayOfWeek } from '../generated/prisma/enums.js';

/** Fecha local 'YYYY-MM-DD' en una zona horaria IANA. */
export function localDate(timezone: string, now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const DAYS: DayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

/** Día de la semana de una fecha 'YYYY-MM-DD'. */
export function dayOfWeekOf(date: string): DayOfWeek {
  return DAYS[toDbDate(date).getUTCDay()]!;
}

/** 'YYYY-MM-DD' → Date para una columna `@db.Date`. */
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Columna `@db.Date` → 'YYYY-MM-DD'. */
export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
