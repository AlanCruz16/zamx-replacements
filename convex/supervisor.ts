import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import {
  customerSortValidator,
  DEFAULT_CUSTOMER_SORT,
  matchesCompany,
  sortCustomers,
} from './lib/customer_list';
import { dashboardSummary, type DashboardSummary } from './lib/dashboard';
import { filteredRequests, periodValidator, requestFiltersValidator } from './lib/request_filters';
import { callerIsSupervisor, requireSupervisor } from './lib/supervisors';
import {
  supervisorCustomerDetail,
  supervisorCustomerRow,
  supervisorDetail,
  supervisorRow,
  type SupervisorCustomerRow,
} from './lib/supervisor_view';

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
 * El resumen del periodo (`lib/dashboard.ts`). `null` sin sesión, para que la
 * pantalla no pinte ceros que no son.
 */
export const dashboard = query({
  args: { period: periodValidator },
  handler: async (ctx, { period }): Promise<DashboardSummary | null> => {
    if ((await requireSupervisor(ctx)) === 'signed_out') return null;
    return dashboardSummary(ctx, period);
  },
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

/**
 * Los Customers que han enviado al menos una Replacement Request, una fila por
 * persona, con cuántas y cuándo fue la última. Quien se dio de alta y nunca
 * pidió nada —un Supervisor, por ejemplo— no sale.
 *
 * Recorre todas las Replacement Requests, como el resumen: al volumen actual
 * (cientos) es aceptable, y si crece la salida es un agregado, no otra interfaz.
 */
export const listCustomers = query({
  args: {
    /** Un trozo del nombre de la empresa (`lib/customer_list.ts`). */
    company: v.optional(v.string()),
    sort: v.optional(customerSortValidator),
  },
  handler: async (
    ctx,
    { company, sort = DEFAULT_CUSTOMER_SORT }
  ): Promise<SupervisorCustomerRow[]> => {
    if ((await requireSupervisor(ctx)) === 'signed_out') return [];

    // De la más reciente a la más antigua: la primera de cada Customer es su última.
    const activity = new Map<Id<'users'>, { requestCount: number; latestRequestAt: number }>();
    for await (const quote of ctx.db.query('quotes').order('desc')) {
      const seen = activity.get(quote.userId);
      if (seen) seen.requestCount++;
      else activity.set(quote.userId, { requestCount: 1, latestRequestAt: quote._creationTime });
    }

    const rows: SupervisorCustomerRow[] = [];
    for (const [userId, counted] of activity) {
      const user = await ctx.db.get(userId);
      if (user && matchesCompany(user.companyName, company)) {
        rows.push(supervisorCustomerRow(user, counted));
      }
    }
    return sortCustomers(rows, sort);
  },
});

/**
 * Un Customer, con sus datos de contacto y sus Replacement Requests en la forma
 * de la lista. `null` si no existe (o sin sesión).
 */
export const customerDetail = query({
  args: {
    /** Llega de la URL: un id mal formado no encuentra nada, no tumba la página. */
    customerId: v.string(),
  },
  handler: async (ctx, { customerId }) => {
    if ((await requireSupervisor(ctx)) === 'signed_out') return null;

    const userId = ctx.db.normalizeId('users', customerId);
    const user = userId && (await ctx.db.get(userId));
    if (!user) return null;

    // Todas las de una sola persona: decenas como mucho, no la tabla.
    const quotes = await ctx.db
      .query('quotes')
      .withIndex('by_user_id', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect();
    return supervisorCustomerDetail(user, quotes);
  },
});
