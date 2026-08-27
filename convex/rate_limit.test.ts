/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { CHAT_POLICY } from './lib/rate_limit';
import { consumeChat } from './rate_limit';

/**
 * Seam 1 — el techo del chat contra una base de datos de verdad.
 *
 * La aritmética ya está probada en `lib/rate_limit.test.ts`. Lo que sólo se ve
 * con la base delante es esto: que la cuenta sobrevive entre invocaciones —la
 * razón entera de que la tabla exista, porque la ruta es serverless—, que cada
 * identidad tiene la suya, y que la fila no se duplica.
 */

const modules = import.meta.glob('./**/*.ts');

/** Gasta `n` peticiones de una identidad y devuelve el último veredicto. */
async function consumir(
  t: ReturnType<typeof convexTest>,
  clerkId: string,
  n: number
): Promise<{ allowed: boolean }> {
  let verdict = { allowed: true } as { allowed: boolean };
  for (let i = 0; i < n; i++) {
    verdict = await t.mutation(internal.rate_limit.consumeChat, { clerkId });
  }
  return verdict;
}

/** La ventana guardada de una identidad, o `undefined` si no tiene. */
async function ventanaDe(t: ReturnType<typeof convexTest>, clerkId: string) {
  const rows = await t.run((ctx) => ctx.db.query('rate_limit_windows').collect());
  return rows.find((row) => row.key.endsWith(clerkId));
}

describe('consumeChat', () => {
  test('las peticiones dentro de la ventana pasan y la siguiente se rechaza', async () => {
    const t = convexTest(schema, modules);

    const last = await consumir(t, 'user_abc', CHAT_POLICY.limit);
    expect(last.allowed).toBe(true);

    const rejected = await t.mutation(internal.rate_limit.consumeChat, { clerkId: 'user_abc' });

    expect(rejected.allowed).toBe(false);
    expect(rejected.allowed === false && rejected.retryAfterMs).toBeGreaterThan(0);
  });

  test('la cuenta sobrevive entre invocaciones en una sola fila', async () => {
    // Un contador en memoria del route handler no haría ni una cosa ni la otra:
    // cada invocación de la función serverless empieza de cero.
    const t = convexTest(schema, modules);

    await consumir(t, 'user_abc', 5);

    const rows = await t.run((ctx) => ctx.db.query('rate_limit_windows').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(5);
    expect(rows[0].key).toContain('user_abc');
  });

  test('una identidad no gasta el cupo de otra', async () => {
    const t = convexTest(schema, modules);

    await consumir(t, 'user_abc', CHAT_POLICY.limit + 1);
    const otra = await t.mutation(internal.rate_limit.consumeChat, { clerkId: 'user_xyz' });

    expect(otra.allowed).toBe(true);
    expect((await ventanaDe(t, 'user_xyz'))?.count).toBe(1);
  });

  test('vencida la ventana, la identidad recupera el acceso con una ventana nueva', async () => {
    const t = convexTest(schema, modules);

    await consumir(t, 'user_abc', CHAT_POLICY.limit);
    // Se envejece la ventana en la propia base: es la única forma de mover el
    // reloj sin inyectarle uno falso a la mutación.
    const vencida = Date.now() - CHAT_POLICY.windowMs - 1;
    await t.run(async (ctx) => {
      const row = await ctx.db.query('rate_limit_windows').unique();
      await ctx.db.patch(row!._id, { windowStartedAt: vencida });
    });

    const after = await t.mutation(internal.rate_limit.consumeChat, { clerkId: 'user_abc' });

    expect(after.allowed).toBe(true);
    // No es que quedara hueco: la ventana entera se reinició.
    const window = await ventanaDe(t, 'user_abc');
    expect(window?.count).toBe(1);
    expect(window?.windowStartedAt).toBeGreaterThan(vencida);
  });

  test('no es alcanzable como función pública', () => {
    // El techo no puede depender de que el llamador quiera respetarlo. Como en
    // `quotes.test.ts`, se afirma sobre la registración y no sobre `t.mutation`,
    // que ejecuta cualquier función registrada: cambiar `internalMutation` por
    // `mutation` pondría el contador al alcance del navegador que limita.
    expect(consumeChat.isInternal).toBe(true);
  });
});
