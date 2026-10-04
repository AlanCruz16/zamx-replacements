import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
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
 * El periodo por fecha de recepción: `start` incluido, `end` excluido. Sin
 * ninguno de los dos es «todo».
 */
const periodValidator = v.object({
  start: v.optional(v.number()),
  end: v.optional(v.number()),
});

/**
 * Las Replacement Requests recibidas en el periodo, de la más reciente a la más
 * antigua, por páginas. Recorre el índice de creación acotado al periodo, así
 * que no lee nada de fuera.
 */
export const listRequests = query({
  args: { period: periodValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { period, paginationOpts }) => {
    if ((await requireSupervisor(ctx)) === 'signed_out') {
      return { page: [], isDone: true, continueCursor: '' };
    }

    const result = await ctx.db
      .query('quotes')
      .withIndex('by_creation_time', (q) => {
        const from = period.start === undefined ? q : q.gte('_creationTime', period.start);
        return period.end === undefined ? from : from.lt('_creationTime', period.end);
      })
      .order('desc')
      .paginate(paginationOpts);

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
