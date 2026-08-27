/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

/**
 * Seam 1 — la memoria del sondeo contra una base de datos de verdad.
 *
 * Las reglas de cuándo avisar ya están probadas en `lib/poller_health.test.ts`.
 * Lo que se comprueba aquí es lo que sólo se ve con la base delante: que el
 * estado sobrevive entre invocaciones (es la razón entera de que exista la
 * tabla), que hay una sola fila por sondeo, y que un apagón terminado no deja
 * campos rancios detrás.
 */

const modules = import.meta.glob('./**/*.ts');

/** Hace `minutos` minutos, para escribir estados que ya venían de antes. */
function hace(minutos: number): number {
  return Date.now() - minutos * 60 * 1000;
}

const AUTH_FAILURE = {
  ok: false,
  kind: 'authentication',
  detail: '3 NO [ALERT] Invalid credentials (Failure)',
} as const;

describe('recordInboxRun', () => {
  test('un fallo aislado se recuerda pero no avisa', async () => {
    const t = convexTest(schema, modules);

    const alert = await t.mutation(internal.poller.recordInboxRun, { run: AUTH_FAILURE });

    expect(alert).toBeNull();
    const [row] = await t.run((ctx) => ctx.db.query('poller_health').collect());
    expect(row.outageFailures).toBe(1);
    expect(row.lastFailure?.kind).toBe('authentication');
  });

  test('la cuenta sobrevive entre invocaciones y acaba avisando una sola vez', async () => {
    // Lo que un contador en el proceso de la acción no puede hacer: cada
    // ejecución del cron es un proceso nuevo.
    const t = convexTest(schema, modules);

    const alerts = [];
    for (let i = 0; i < 8; i++) {
      alerts.push(await t.mutation(internal.poller.recordInboxRun, { run: AUTH_FAILURE }));
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // Ocho sondeos en milisegundos no llegan al umbral de veinte minutos: el
    // apagón se acumula, y avisar es cosa del tiempo, no de la cuenta.
    expect(alerts.every((alert) => alert === null)).toBe(true);
    const [row] = await t.run((ctx) => ctx.db.query('poller_health').collect());
    expect(row.outageFailures).toBe(8);
  });

  test('un apagón que empezó hace horas avisa en el sondeo siguiente', async () => {
    const t = convexTest(schema, modules);
    const ayer = Date.now() - 19 * 60 * 60 * 1000;

    await t.run((ctx) =>
      ctx.db.insert('poller_health', {
        lastSuccessAt: ayer,
        outageStartedAt: ayer + 5 * 60 * 1000,
        outageFailures: 224,
        lastFailure: { kind: 'authentication', detail: 'Invalid credentials', at: hace(5) },
      })
    );

    const alert = await t.mutation(internal.poller.recordInboxRun, { run: AUTH_FAILURE });

    expect(alert?.kind).toBe('authentication');
    expect(alert?.failures).toBe(225);
    expect(alert?.lastSuccessAt).toBe(ayer);

    // Y el siguiente sondeo del mismo apagón ya no manda nada.
    expect(await t.mutation(internal.poller.recordInboxRun, { run: AUTH_FAILURE })).toBeNull();
  });

  test('media hora sin fallos borra el apagón entero, sin dejar campos rancios', async () => {
    const t = convexTest(schema, modules);
    const ayer = Date.now() - 19 * 60 * 60 * 1000;

    await t.run((ctx) =>
      ctx.db.insert('poller_health', {
        lastSuccessAt: hace(31),
        outageStartedAt: ayer,
        outageFailures: 225,
        lastFailure: { kind: 'authentication', detail: 'Invalid credentials', at: hace(31) },
        alertedAt: hace(31),
      })
    );

    await t.mutation(internal.poller.recordInboxRun, { run: { ok: true } });

    const [row] = await t.run((ctx) => ctx.db.query('poller_health').collect());
    expect(row.outageFailures).toBe(0);
    expect(row.outageStartedAt).toBeUndefined();
    expect(row.lastFailure).toBeUndefined();
    // Sin `alertedAt` el próximo apagón vuelve a ser noticia; con él, callaría
    // para siempre.
    expect(row.alertedAt).toBeUndefined();
    expect(row.lastSuccessAt).toBeGreaterThan(ayer);
  });

  test('un aviso que no se pudo mandar se retira y el sondeo siguiente lo reintenta', async () => {
    // La marca se pone dentro de la transacción, antes de que exista el correo.
    // Si el correo no sale, dejarla puesta sería el silencio de siempre.
    const t = convexTest(schema, modules);
    const ayer = Date.now() - 19 * 60 * 60 * 1000;

    await t.run((ctx) =>
      ctx.db.insert('poller_health', {
        lastSuccessAt: ayer,
        outageStartedAt: ayer,
        outageFailures: 224,
        lastFailure: { kind: 'authentication', detail: 'Invalid credentials', at: hace(5) },
      })
    );

    const alert = await t.mutation(internal.poller.recordInboxRun, { run: AUTH_FAILURE });
    expect(alert).not.toBeNull();

    await t.mutation(internal.poller.withdrawInboxAlert, { alertedAt: alert!.alertedAt });

    const reintento = await t.mutation(internal.poller.recordInboxRun, { run: AUTH_FAILURE });
    expect(reintento?.failures).toBe(226);
  });

  test('el sondeo tiene una sola fila, por muchas veces que corra', async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.poller.recordInboxRun, { run: { ok: true } });
    await t.mutation(internal.poller.recordInboxRun, { run: AUTH_FAILURE });
    await t.mutation(internal.poller.recordInboxRun, { run: { ok: true } });

    const rows = await t.run((ctx) => ctx.db.query('poller_health').collect());
    expect(rows).toHaveLength(1);
  });
});
