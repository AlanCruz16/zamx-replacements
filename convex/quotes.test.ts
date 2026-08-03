/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

/**
 * Ejemplo de referencia — Seam 1: la frontera de las funciones de Convex.
 *
 * `convex-test` ejecuta las funciones contra una base de datos real en memoria,
 * así que no se hacen stubs de la base: se siembra con `t.run` y se afirma sobre
 * lo que un llamador puede observar (el valor devuelto, el registro escrito, el
 * error lanzado) — nunca sobre cómo se llegó al resultado.
 *
 * El precio sale de un sorteo aleatorio dentro del rango configurado, así que lo
 * observable es que el Suggested Price **cae dentro del rango** del Model Prefix
 * que coincidió. Afirmar un valor exacto exigiría inyectar un generador con
 * semilla, que es probar detalles internos.
 *
 * `modules` es obligatorio para que convex-test descubra los archivos de
 * funciones. Los módulos se cargan de forma perezosa, por lo que `emails.ts`
 * (`'use node'`, importa imapflow) nunca se evalúa desde aquí.
 */
const modules = import.meta.glob('./**/*.ts');

const INTERNAL_SECRET = 'secreto-de-prueba';

/**
 * El rango de la regla es deliberadamente disjunto del rango inventado
 * (2500–3000 USD) que `create` usa hoy cuando ningún Model Prefix coincide, de
 * modo que un precio fabricado hace fallar la aserción de rango en vez de
 * colarse por debajo de ella.
 */
const PRICING_RULE = {
  prefix: 'MK',
  minPriceUSD: 4000,
  maxPriceUSD: 4200,
  description: 'Motores EC con controlador integrado',
  isActive: true,
};

const PRODUCT = {
  partNumber: 'P-001',
  model: 'MK137-4DZ.07.U',
  quantity: 2,
  deliveryLocation: 'Monterrey',
};

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', INTERNAL_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

type TestConvex = ReturnType<typeof convexTest>;

/** Siembra la regla de precios que ambos Customers comparten. */
async function seedPricingRule(t: TestConvex) {
  await t.run(async (ctx) => {
    await ctx.db.insert('pricing_rules', PRICING_RULE);
  });
}

/** Siembra un Customer y devuelve su clerkId. */
async function seedCustomer(t: TestConvex, clerkId: string, fullName: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      clerkId,
      fullName,
      companyName: `Empresa de ${fullName}`,
      email: `${clerkId}@example.com`,
      preferredLanguage: 'es',
    });
  });
  return clerkId;
}

/** Siembra la regla de precios y un Customer, el arreglo por defecto. */
async function seed(t: TestConvex) {
  await seedPricingRule(t);
  return seedCustomer(t, 'user_ana', 'Ana');
}

/** Crea una Replacement Request como el llamador interno. */
function createQuote(t: TestConvex, clerkId: string, secret = INTERNAL_SECRET) {
  return t.mutation(api.quotes.create, { clerkId, secret, products: [PRODUCT] });
}

/** Afirma que un Suggested Price cae dentro del rango de la regla sembrada. */
function expectWithinSeededRange(price: number) {
  expect(price).toBeGreaterThanOrEqual(PRICING_RULE.minPriceUSD);
  expect(price).toBeLessThanOrEqual(PRICING_RULE.maxPriceUSD);
}

describe('quotes.create', () => {
  test('el Suggested Price cae dentro del rango configurado para el Model Prefix', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    const result = await createQuote(t, clerkId);

    expect(result.products).toHaveLength(1);
    expectWithinSeededRange(result.products[0].pricePerUnitUSD);
  });

  test('escribe la Replacement Request con un requestId REQ- y el precio sorteado', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    const result = await createQuote(t, clerkId);
    const stored = await t.run(async (ctx) => ctx.db.get(result.quoteId));

    expect(stored).not.toBeNull();
    expect(stored!.requestId).toMatch(/^REQ-[A-Z0-9]+$/);
    expectWithinSeededRange(stored!.products[0].pricePerUnitUSD);
  });

  test('un llamador sin el secreto interno es rechazado y no escribe nada', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    await expect(createQuote(t, clerkId, 'secreto-equivocado')).rejects.toThrow('No autorizado');

    const quotes = await t.run(async (ctx) => ctx.db.query('quotes').collect());
    expect(quotes).toEqual([]);
  });
});

describe('quotes.getUserQuotes', () => {
  test('un llamador no autenticado es rechazado', async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    await expect(t.query(api.quotes.getUserQuotes, {})).rejects.toThrow('No autenticado');
  });

  test('un Customer autenticado ve la suya y no la de otro Customer', async () => {
    const t = convexTest(schema, modules);
    await seedPricingRule(t);
    const ana = await seedCustomer(t, 'user_ana', 'Ana');
    const beto = await seedCustomer(t, 'user_beto', 'Beto');

    // Cada Customer tiene una Replacement Request propia, así que devolver la
    // lista equivocada — o todas — hace fallar el test.
    const deAna = await createQuote(t, ana);
    const deBeto = await createQuote(t, beto);
    expect(deAna.requestId).not.toBe(deBeto.requestId);

    const vistasPorAna = await t.withIdentity({ subject: ana }).query(api.quotes.getUserQuotes, {});
    expect(vistasPorAna.map((q) => q.requestId)).toEqual([deAna.requestId]);

    const vistasPorBeto = await t
      .withIdentity({ subject: beto })
      .query(api.quotes.getUserQuotes, {});
    expect(vistasPorBeto.map((q) => q.requestId)).toEqual([deBeto.requestId]);
  });
});
