import { v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { pollerFailureValidator } from './schema';
import {
  recordPollerRun,
  withdrawAlert,
  type PollerAlert,
  type PollerHealth,
} from './lib/poller_health';

/**
 * La memoria del sondeo del buzón, entre una ejecución del cron y la siguiente.
 *
 * La acción que abre IMAP es un proceso que no sobrevive a su invocación, así
 * que «lleva 225 sondeos fallando» no es un hecho que ella pueda saber. Aquí se
 * guarda, y aquí se decide —con la función pura de `lib/poller_health`— si toca
 * avisar. La acción sólo reporta lo que le pasó y manda el correo que se le
 * diga.
 */

/** La única fila de la tabla, recortada al estado que entienden las reglas. */
async function readHealth(
  ctx: MutationCtx
): Promise<{ id: Id<'poller_health'>; health: PollerHealth } | null> {
  const row = await ctx.db.query('poller_health').unique();
  if (row === null) return null;

  // `_id` y `_creationTime` no son campos del esquema: si viajaran con el estado
  // hasta el `replace`, Convex rechazaría la escritura.
  const { _id, _creationTime, ...health } = row;
  return { id: _id, health };
}

/** Escribe el estado omitiendo los campos ausentes: `undefined` no es un valor de Convex. */
async function writeHealth(
  ctx: MutationCtx,
  id: Id<'poller_health'> | null,
  health: PollerHealth
): Promise<void> {
  const document = {
    outageFailures: health.outageFailures,
    ...(health.lastSuccessAt === undefined ? {} : { lastSuccessAt: health.lastSuccessAt }),
    ...(health.outageStartedAt === undefined ? {} : { outageStartedAt: health.outageStartedAt }),
    ...(health.lastFailure === undefined ? {} : { lastFailure: health.lastFailure }),
    ...(health.alertedAt === undefined ? {} : { alertedAt: health.alertedAt }),
  };

  // `replace` y no `patch`: los campos del apagón desaparecen cuando el apagón
  // termina, y un `patch` los dejaría ahí para siempre.
  if (id === null) {
    await ctx.db.insert('poller_health', document);
  } else {
    await ctx.db.replace(id, document);
  }
}

/**
 * Apunta cómo fue un sondeo y devuelve el aviso que haya que mandar, o `null`.
 *
 * Que decida la mutación y no la acción no es cosmética: leer el estado y
 * escribirlo son una sola transacción aquí, y dos sondeos solapados no pueden
 * mandar cada uno su correo del mismo apagón.
 */
export const recordInboxRun = internalMutation({
  args: {
    run: v.union(
      v.object({ ok: v.literal(true) }),
      v.object({ ok: v.literal(false), kind: pollerFailureValidator, detail: v.string() })
    ),
  },
  handler: async (ctx, args): Promise<PollerAlert | null> => {
    const existing = await readHealth(ctx);

    const { health, alert } = recordPollerRun(existing?.health, args.run, Date.now());
    await writeHealth(ctx, existing?.id ?? null, health);

    return alert ?? null;
  },
});

/**
 * Retira la marca de un aviso que no se llegó a mandar.
 *
 * La marca se pone dentro de la transacción, antes de que exista el correo, para
 * que dos sondeos solapados no manden dos. El precio es que un envío fallido
 * dejaría el apagón marcado como avisado sin que nadie se haya enterado —el
 * mismo silencio de siempre—, así que quien no consigue mandarlo lo retira y el
 * sondeo siguiente lo vuelve a intentar.
 */
export const withdrawInboxAlert = internalMutation({
  args: { alertedAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await readHealth(ctx);
    if (existing === null) return null;

    await writeHealth(ctx, existing.id, withdrawAlert(existing.health, args.alertedAt));
    return null;
  },
});
