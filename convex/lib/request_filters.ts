import type { IndexRange } from 'convex/server';
import { v, type Infer } from 'convex/values';
import type { QueryCtx } from '../_generated/server';
import { outcomeValidator } from '../schema';
import { AWAITING_REVIEW } from './outcome';

/**
 * Los filtros de la lista de Replacement Requests del Supervisor, y la consulta
 * que los resuelve. Todos se combinan entre sí y con el periodo.
 *
 * Cada combinación sale por un índice, nunca recorriendo la tabla entera:
 *
 * - con código `REQ-`, `by_request_id`, que deja a lo sumo una fila, así que el
 *   resto de filtros se comprueba sobre ella;
 * - con Customer, `by_user_id` o, si además hay Outcome, `by_user_id_and_outcome`;
 * - con sólo Outcome, `by_outcome`;
 * - sin filtros, el índice de creación.
 *
 * Todos acaban en `_creationTime`, que acota el periodo dentro del propio rango
 * del índice y ordena de la más reciente a la más antigua, así que paginar
 * devuelve cada coincidencia exactamente una vez.
 */

export const requestFiltersValidator = v.object({
  /** Un Outcome, o `AWAITING_REVIEW` para las que no tienen ninguno (`outcome.ts`). */
  outcome: v.optional(v.union(outcomeValidator, v.literal(AWAITING_REVIEW))),
  /**
   * Llega de la URL, así que es texto y no `v.id`: un id mal formado no debe
   * tumbar la página, sólo no encontrar nada.
   */
  customerId: v.optional(v.string()),
  /** El código exacto; no distingue mayúsculas ni espacios alrededor. */
  requestId: v.optional(v.string()),
});

export type RequestFilters = Infer<typeof requestFiltersValidator>;

/** Si hay algún filtro puesto. Uno sin valor no cuenta. */
export function hasFilters(filters: RequestFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

/**
 * El periodo por fecha de recepción: `start` incluido, `end` excluido. Sin
 * ninguno de los dos es «todo».
 */
export const periodValidator = v.object({
  start: v.optional(v.number()),
  end: v.optional(v.number()),
});

export type Period = Infer<typeof periodValidator>;

/**
 * Lo que queda de cualquier índice de `quotes` una vez fijadas sus columnas con
 * `eq`: el rango sobre `_creationTime`.
 */
type UpperCreationTimeRange = IndexRange & {
  lt(field: '_creationTime', value: number): IndexRange;
};
type CreationTimeRange = UpperCreationTimeRange & {
  gte(field: '_creationTime', value: number): UpperCreationTimeRange;
};

/**
 * La consulta, ya ordenada de la más reciente a la más antigua, lista para
 * paginar. `null` cuando el Customer pedido no puede existir.
 */
export function filteredRequests(ctx: QueryCtx, period: Period, filters: RequestFilters) {
  const { start, end } = period;

  // Acota `_creationTime`, la última columna de cualquier índice, al periodo.
  function inPeriod(q: CreationTimeRange): IndexRange {
    const from = start === undefined ? q : q.gte('_creationTime', start);
    return end === undefined ? from : from.lt('_creationTime', end);
  }

  // `undefined` es como se indexa un Outcome ausente: «en revisión».
  const filtersOutcome = filters.outcome !== undefined;
  const outcome = filters.outcome === AWAITING_REVIEW ? undefined : filters.outcome;

  const customerId =
    filters.customerId === undefined ? undefined : ctx.db.normalizeId('users', filters.customerId);
  if (customerId === null) return null;

  const quotes = ctx.db.query('quotes');

  const requestId = filters.requestId?.trim().toUpperCase();
  if (requestId) {
    return quotes
      .withIndex('by_request_id', (q) => inPeriod(q.eq('requestId', requestId)))
      .filter((q) =>
        q.and(
          customerId === undefined ? true : q.eq(q.field('userId'), customerId),
          filtersOutcome ? q.eq(q.field('outcome'), outcome) : true
        )
      )
      .order('desc');
  }

  if (customerId !== undefined) {
    return filtersOutcome
      ? quotes
          .withIndex('by_user_id_and_outcome', (q) =>
            inPeriod(q.eq('userId', customerId).eq('outcome', outcome))
          )
          .order('desc')
      : quotes.withIndex('by_user_id', (q) => inPeriod(q.eq('userId', customerId))).order('desc');
  }

  if (filtersOutcome) {
    return quotes.withIndex('by_outcome', (q) => inPeriod(q.eq('outcome', outcome))).order('desc');
  }

  return quotes.withIndex('by_creation_time', (q) => inPeriod(q)).order('desc');
}
