import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { AWAITING_REVIEW, OUTCOME_FILTERS, type OutcomeFilter } from './outcome';
import { filteredRequests, type Period } from './request_filters';
import { weeklyCounts, type WeekClock, type WeeklyCount } from './weeks';

/**
 * El resumen del panel del Supervisor: volumen y quién pide, nunca dinero.
 *
 * Se calcula recorriendo las Replacement Requests del periodo, por el índice de
 * creación. Al volumen actual (cientos) es aceptable. Si crece, lo que cambia es
 * el interior de `dashboardSummary` —un contador o un agregado—, no la forma
 * que devuelve.
 *
 * «Nunca pidieron nada» no tiene periodo que acotar: recorre los usuarios, con
 * una búsqueda por índice cada uno. Vale lo mismo: cientos, no cientos de miles.
 */

/** Cuántos Customers enseña el ranking. */
export const TOP_CUSTOMERS = 5;

export interface TopCustomer {
  customerId: Id<'users'>;
  fullName: string;
  companyName: string;
  requestCount: number;
  /** La suma de las cantidades de todas sus piezas en el periodo. */
  unitCount: number;
}

export interface DashboardSummary {
  /** Las recibidas en el periodo. */
  received: number;
  /** Una cuenta por Outcome, más `AWAITING_REVIEW` para las que no tienen ninguno. */
  byOutcome: Record<OutcomeFilter, number>;
  /** Por número de Replacement Requests en el periodo; empata quien pidió más unidades. */
  topCustomers: TopCustomer[];
  /**
   * Quienes se dieron de alta y nunca enviaron ninguna. Es un estado, no un
   * hecho del periodo, así que no lo mira.
   */
  neverRequested: number;
  /** Las recibidas por semana, de lunes a lunes, con las semanas vacías a cero (`weeks.ts`). */
  weekly: WeeklyCount[];
}

export async function dashboardSummary(
  ctx: QueryCtx,
  period: Period,
  clock: WeekClock
): Promise<DashboardSummary> {
  const byOutcome = Object.fromEntries(OUTCOME_FILTERS.map((filter) => [filter, 0])) as Record<
    OutcomeFilter,
    number
  >;
  const activity = new Map<Id<'users'>, { requestCount: number; unitCount: number }>();
  const receivedAt: number[] = [];
  let received = 0;

  // Sin filtros nunca es `null`: eso sólo pasa con un Customer imposible.
  for await (const quote of filteredRequests(ctx, period, {})!) {
    received++;
    receivedAt.push(quote._creationTime);
    byOutcome[quote.outcome ?? AWAITING_REVIEW]++;

    const counted = activity.get(quote.userId) ?? { requestCount: 0, unitCount: 0 };
    counted.requestCount++;
    counted.unitCount += quote.products.reduce((sum, product) => sum + product.quantity, 0);
    activity.set(quote.userId, counted);
  }

  const ranked: TopCustomer[] = [];
  for (const [customerId, counted] of activity) {
    const user = await ctx.db.get(customerId);
    if (!user) continue;
    ranked.push({
      customerId,
      fullName: user.fullName,
      companyName: user.companyName,
      ...counted,
    });
  }
  ranked.sort(
    (a, b) =>
      b.requestCount - a.requestCount ||
      b.unitCount - a.unitCount ||
      a.fullName.localeCompare(b.fullName, 'es')
  );

  return {
    received,
    byOutcome,
    topCustomers: ranked.slice(0, TOP_CUSTOMERS),
    neverRequested: await countNeverRequested(ctx),
    weekly: weeklyCounts(receivedAt, period, clock),
  };
}

/** Los usuarios sin ninguna Replacement Request, mirando la primera de cada uno. */
async function countNeverRequested(ctx: QueryCtx): Promise<number> {
  let count = 0;
  for await (const user of ctx.db.query('users')) {
    const firstRequest = await ctx.db
      .query('quotes')
      .withIndex('by_user_id', (q) => q.eq('userId', user._id))
      .first();
    if (!firstRequest) count++;
  }
  return count;
}
