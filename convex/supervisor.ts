import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { filteredRequests, periodValidator, requestFiltersValidator } from './lib/request_filters';
import { callerIsSupervisor, requireSupervisor } from './lib/supervisors';
import { supervisorDetail, supervisorRow } from './lib/supervisor_view';

/**
 * El panel del Supervisor: sólo mira, nunca actúa. Cada consulta de aquí pasa
 * por `requireSupervisor`, salvo esta, que es la pregunta misma.
 */

/**
 * Si quien llama es Supervisor. La usa la ruta del panel para decidir entre
 * pintarlo o contestar «no encontrado»; no protege nada por sí sola.
 */
export const amISupervisor = query({
  args: {},
  handler: async (ctx) => callerIsSupervisor(ctx),
});

/**
 * Las Replacement Requests recibidas en el periodo, de la más reciente a la más
 * antigua, por páginas, y con los filtros de la lista combinados. Cada
 * combinación sale por un índice acotado al periodo (`lib/request_filters.ts`),
 * así que no lee nada de fuera.
 */
export const listRequests = query({
  args: {
    period: periodValidator,
    filters: v.optional(requestFiltersValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { period, filters = {}, paginationOpts }) => {
    const nothing = { page: [], isDone: true, continueCursor: '' };
    if ((await requireSupervisor(ctx)) === 'signed_out') return nothing;

    const requests = filteredRequests(ctx, period, filters);
    if (!requests) return nothing;
    const result = await requests.paginate(paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((quote) => supervisorRow(ctx, quote))),
    };
  },
});

/** Una Replacement Request por su código `REQ-`, o `null` si no existe (o sin sesión). */
export const requestDetail = query({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    if ((await requireSupervisor(ctx)) === 'signed_out') return null;

    const quote = await ctx.db
      .query('quotes')
      .withIndex('by_request_id', (q) => q.eq('requestId', requestId))
      .first();

    return quote ? supervisorDetail(ctx, quote) : null;
  },
});
