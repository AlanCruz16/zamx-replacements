import { v, type Infer } from 'convex/values';
import type { Period } from './request_filters';

/**
 * La serie semanal del resumen: cuántas Replacement Requests llegaron cada
 * semana del periodo. Las semanas empiezan el lunes a medianoche en la hora de
 * quien mira, que es la misma en la que el panel pinta todas sus fechas.
 *
 * Una consulta no debe leer el reloj (se quedaría con la hora de su primera
 * ejecución), así que el navegador manda la suya: `now`, el mismo instante con
 * el que resolvió el periodo, y su desfase respecto a UTC.
 */

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const MINUTE = 60 * 1000;

export const weekClockValidator = v.object({
  /** Cuándo resolvió el navegador el periodo: el final de la serie si el periodo no lo tiene. */
  now: v.number(),
  /**
   * Minutos que la hora local va por delante de UTC (`-getTimezoneOffset()`).
   * Uno solo para toda la serie: en una zona con horario de verano, las semanas
   * del otro lado del cambio se desplazan una hora, que no mueve casi nada.
   */
  utcOffsetMinutes: v.number(),
});

export type WeekClock = Infer<typeof weekClockValidator>;

export interface WeeklyCount {
  /** El lunes a medianoche, hora local, en que empieza la semana. */
  weekStart: number;
  count: number;
}

/** El lunes a medianoche (hora local) de la semana en que cae `timestamp`. */
export function weekStartOf(timestamp: number, utcOffsetMinutes: number): number {
  const offset = utcOffsetMinutes * MINUTE;
  const localDay = Math.floor((timestamp + offset) / DAY);
  // El día 0 de la época fue jueves: tres días después del lunes.
  const daysSinceMonday = (((localDay + 3) % 7) + 7) % 7;
  return (localDay - daysSinceMonday) * DAY - offset;
}

/**
 * Una entrada por semana, de la primera a la última del periodo, con las vacías
 * a cero. Sin principio («todo»), empieza en la semana de la primera recibida;
 * sin final, acaba en la de `now`, o en la de alguna que haya llegado después,
 * para que la serie sume lo mismo que el total.
 */
export function weeklyCounts(
  receivedAt: number[],
  period: Period,
  clock: WeekClock
): WeeklyCount[] {
  const offset = clock.utcOffsetMinutes;
  let earliest: number | undefined;
  let latest: number | undefined;
  for (const timestamp of receivedAt) {
    if (earliest === undefined || timestamp < earliest) earliest = timestamp;
    if (latest === undefined || timestamp > latest) latest = timestamp;
  }

  const start = period.start ?? earliest;
  if (start === undefined) return [];
  // `end` no se incluye: la última semana es la de su instante anterior.
  const end = (period.end ?? clock.now) - 1;
  if (end < start && latest === undefined) return [];

  const first = weekStartOf(start, offset);
  const last = weekStartOf(Math.max(end, latest ?? end, start), offset);

  const counts = new Map<number, number>();
  for (let week = first; week <= last; week += WEEK) counts.set(week, 0);
  for (const timestamp of receivedAt) {
    const week = weekStartOf(timestamp, offset);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }

  return [...counts].map(([weekStart, count]) => ({ weekStart, count }));
}
