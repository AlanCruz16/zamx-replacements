'use client';

import { useState } from 'react';
import type { WeeklyCount } from '../../../convex/lib/weeks';
import { formatDayMonth, SUPERVISOR_MESSAGES } from '@/lib/messages';

const t = SUPERVISOR_MESSAGES.dashboard.weekly;

/** Cuántas etiquetas de fecha caben bajo el eje sin pisarse a ancho de teléfono. */
const MAX_DATE_LABELS = 4;

/**
 * Las Replacement Requests recibidas por semana, en columnas. Una sola serie,
 * así que no lleva leyenda: el título dice qué se pinta.
 *
 * Cada columna se puede señalar o enfocar con el teclado y dice su semana y su
 * cuenta; la tabla de debajo dice lo mismo sin tener que señalar nada. Con
 * muchas semanas («todo»), la gráfica se desplaza en horizontal dentro de su
 * tarjeta en vez de estrechar las columnas hasta que no se vean.
 */
export function WeeklyChart({ weeks }: { weeks: WeeklyCount[] }) {
  const [active, setActive] = useState<number | null>(null);

  if (weeks.length === 0) return <p className="text-sm text-gray-500">{t.empty}</p>;

  const ticks = axisTicks(Math.max(...weeks.map((week) => week.count)));
  const top = ticks.at(-1)!;
  const labelled = dateLabelIndexes(weeks.length);
  const activeWeek = active === null ? null : weeks[active];

  return (
    <div>
      <div className="flex gap-2">
        {/* El eje de valores: números redondos, en la tinta de los textos. */}
        <div className="relative mt-11 h-40 w-6 shrink-0 text-right text-xs text-gray-500 tabular-nums">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          {/* El hueco de arriba es del recuadro de la columna señalada: así no tapa la barra. */}
          <div className="relative pt-11" style={{ minWidth: `${weeks.length * 8}px` }}>
            <div
              className="relative h-40"
              role="list"
              aria-label={t.chartLabel(weeks.length)}
              onPointerLeave={() => setActive(null)}
            >
              {ticks.map((tick) => (
                <div
                  key={tick}
                  aria-hidden
                  className="absolute inset-x-0 border-t border-gray-200 dark:border-gray-800"
                  style={{ bottom: `${(tick / top) * 100}%` }}
                />
              ))}

              <div className="absolute inset-0 flex items-end gap-[2px]">
                {weeks.map((week, index) => (
                  <div
                    key={week.weekStart}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${t.week(formatDayMonth(week.weekStart, 'es'))}: ${t.count(week.count)}`}
                    onPointerEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    className="flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-light)]"
                  >
                    {week.count > 0 && (
                      <div
                        className={`w-full max-w-6 rounded-t bg-[#0066b3] dark:bg-[#4a9be0] transition-opacity ${
                          active !== null && active !== index ? 'opacity-60' : ''
                        }`}
                        style={{ height: `${(week.count / top) * 100}%` }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {activeWeek && active !== null && (
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 z-10 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0a0a0a] px-2 py-1 text-xs shadow-sm whitespace-nowrap"
                style={tooltipPosition(active, weeks.length)}
              >
                <p className="font-semibold text-sm tabular-nums">{t.count(activeWeek.count)}</p>
                <p className="text-gray-500">
                  {t.week(formatDayMonth(activeWeek.weekStart, 'es'))}
                </p>
              </div>
            )}

            {/* Las fechas, sólo unas pocas: la primera, la última y alguna en medio. */}
            <div aria-hidden className="relative mt-1 h-4 text-xs text-gray-500">
              {labelled.map((index) => (
                <span
                  key={index}
                  className="absolute whitespace-nowrap"
                  style={labelPosition(index, weeks.length)}
                >
                  {formatDayMonth(weeks[index].weekStart, 'es')}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500">{t.note}</p>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-gray-500">{t.showTable}</summary>
        <table className="mt-2 w-full max-w-xs">
          <thead className="text-left text-gray-500">
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="py-1 pr-4 font-medium">{t.columns.week}</th>
              <th className="py-1 font-medium text-right">{t.columns.count}</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.weekStart} className="border-b border-gray-200 dark:border-gray-800">
                <td className="py-1 pr-4">{formatDayMonth(week.weekStart, 'es')}</td>
                <td className="py-1 text-right tabular-nums">{week.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/**
 * De cero a un tope redondo (1, 2 o 5 por una potencia de diez), en no más de
 * cuatro tramos. Sin ninguna recibida, el tope es 1 para que la escala exista.
 */
export function axisTicks(max: number): number[] {
  const target = Math.max(max, 1);
  let step = 1;
  for (let magnitude = 1; ; magnitude *= 10) {
    const fit = [1, 2, 5].map((m) => m * magnitude).find((s) => Math.ceil(target / s) <= 4);
    if (fit) {
      step = fit;
      break;
    }
  }
  const ticks = [];
  for (let tick = 0; tick < target + step; tick += step) ticks.push(tick);
  return ticks;
}

/** Qué columnas llevan su fecha debajo: repartidas, siempre la primera y la última. */
function dateLabelIndexes(count: number): number[] {
  if (count <= MAX_DATE_LABELS) return [...Array(count).keys()];
  const indexes = new Set<number>();
  for (let i = 0; i < MAX_DATE_LABELS; i++) {
    indexes.add(Math.round((i * (count - 1)) / (MAX_DATE_LABELS - 1)));
  }
  return [...indexes];
}

/** El centro de una columna, en porcentaje del ancho. */
function columnCentre(index: number, count: number): number {
  return ((index + 0.5) / count) * 100;
}

/** La etiqueta se centra en su columna, salvo en los bordes, donde se alinea hacia dentro. */
function labelPosition(index: number, count: number): React.CSSProperties {
  if (index === 0 && count > 1) return { left: 0 };
  if (index === count - 1 && count > 1) return { right: 0 };
  return { left: `${columnCentre(index, count)}%`, transform: 'translateX(-50%)' };
}

/** Encima de la columna, sin salirse de la gráfica por ningún lado. */
function tooltipPosition(index: number, count: number): React.CSSProperties {
  const centre = columnCentre(index, count);
  if (centre < 25) return { left: `${centre}%` };
  if (centre > 75) return { right: `${100 - centre}%` };
  return { left: `${centre}%`, transform: 'translateX(-50%)' };
}
