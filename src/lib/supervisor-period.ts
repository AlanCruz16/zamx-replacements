/**
 * El periodo que elige el Supervisor, como preajuste. Lo comparten la lista de
 * Replacement Requests y, más adelante, el resumen, para que los números de una
 * pantalla y de la otra cuenten lo mismo.
 *
 * Se resuelve a marcas de tiempo en el navegador, una vez por elección: la
 * consulta de Convex es reactiva, y un `Date.now()` nuevo en cada render sería
 * una suscripción nueva en cada render.
 */

const DAY = 24 * 60 * 60 * 1000;

const PRESET_DAYS = { last7: 7, last30: 30, last90: 90, all: undefined } as const;

export type PeriodPreset = keyof typeof PRESET_DAYS;

export const PERIOD_PRESETS = Object.keys(PRESET_DAYS) as PeriodPreset[];

export const DEFAULT_PERIOD: PeriodPreset = 'last30';

/** Lo que recibe la consulta: `start` incluido, `end` excluido; sin ellos, todo. */
export interface PeriodBounds {
  start?: number;
  end?: number;
}

export function periodBounds(preset: PeriodPreset, now: number): PeriodBounds {
  const days = PRESET_DAYS[preset];
  return days === undefined ? {} : { start: now - days * DAY };
}
