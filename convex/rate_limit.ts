import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import {
  CHAT_POLICY,
  chatRateLimitKey,
  consumeWindow,
  type RateLimitVerdict,
} from './lib/rate_limit';

/**
 * El techo de peticiones del chat por identidad, aplicado donde sí se puede
 * aplicar.
 *
 * Las reglas —cuándo se agota una ventana y cuándo se renueva— viven en
 * `lib/rate_limit.ts`. Lo que aporta este módulo es la transacción: leer la
 * ventana y escribirla es aquí una sola operación atómica, de modo que dos
 * peticiones simultáneas de la misma identidad no pueden leer la misma cuenta y
 * pasar las dos por el último hueco. Un contador en el route handler no podría
 * hacerlo: la ruta es una función serverless y su memoria no se comparte entre
 * instancias ni sobrevive a la invocación.
 *
 * Es `internalMutation` a propósito: un techo que el navegador pudiera llamar
 * —o no llamar— no sería un techo.
 *
 * La tabla no se poda: hay una fila por Customer, no por petición, y se
 * reutiliza en cada ventana. Crece con la clientela, no con el tráfico.
 */
export const consumeChat = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<RateLimitVerdict> => {
    const key = chatRateLimitKey(args.clerkId);

    const existing = await ctx.db
      .query('rate_limit_windows')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();

    const { window, verdict } = consumeWindow(
      existing === null
        ? undefined
        : { windowStartedAt: existing.windowStartedAt, count: existing.count },
      CHAT_POLICY,
      Date.now()
    );

    if (existing === null) {
      await ctx.db.insert('rate_limit_windows', { key, ...window });
    } else {
      await ctx.db.patch(existing._id, window);
    }

    return verdict;
  },
});
