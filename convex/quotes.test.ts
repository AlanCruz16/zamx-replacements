/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
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
 * El rango de la regla es deliberadamente disjunto del rango (2500–3000 USD) que
 * `create` inventaba cuando ningún Model Prefix coincidía, de modo que un precio
 * fabricado hace fallar la aserción de rango en vez de colarse por debajo de ella.
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
function createQuote(
  t: TestConvex,
  clerkId: string,
  secret = INTERNAL_SECRET,
  products = [PRODUCT]
) {
  return t.mutation(api.quotes.create, { clerkId, secret, products });
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
    expectWithinSeededRange(result.products[0].suggestedPriceUSD!);
  });

  test('un Model Prefix sin regla configurada no recibe Suggested Price', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    const result = await createQuote(t, clerkId, INTERNAL_SECRET, [
      { ...PRODUCT, model: 'XX999-SIN-REGLA' },
    ]);

    // La ausencia es el dato: significa "no cotizable", no "gratis". Un número
    // inventado aquí se presentaría como una propuesta del sistema.
    expect(result.products[0].suggestedPriceUSD).toBeUndefined();
  });

  test('una Replacement Request nace sin Outcome, que es lo que significa en revisión', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    const result = await createQuote(t, clerkId);
    const stored = await t.run(async (ctx) => ctx.db.get(result.quoteId));

    expect(stored!.outcome).toBeUndefined();
    expect(stored!.customerNotifiedAt).toBeUndefined();
  });

  test('escribe la Replacement Request con un requestId REQ- y el precio sorteado', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    const result = await createQuote(t, clerkId);
    const stored = await t.run(async (ctx) => ctx.db.get(result.quoteId));

    expect(stored).not.toBeNull();
    expect(stored!.requestId).toMatch(/^REQ-[A-Z0-9]+$/);
    expectWithinSeededRange(stored!.products[0].suggestedPriceUSD!);
  });

  test('un llamador sin el secreto interno es rechazado y no escribe nada', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    await expect(createQuote(t, clerkId, 'secreto-equivocado')).rejects.toThrow('No autorizado');

    const quotes = await t.run(async (ctx) => ctx.db.query('quotes').collect());
    expect(quotes).toEqual([]);
  });
});

describe('el Confirmed Price no toca el Suggested Price', () => {
  test('un override escribe el Confirmed Price y deja intacto el Suggested Price', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    const creada = await createQuote(t, clerkId);
    const suggested = creada.products[0].suggestedPriceUSD!;

    await t.mutation(internal.quotes.processEmployeeResponse, {
      requestId: creada.requestId,
      classification: 'modified',
      explanation: 'Ajusto el precio de esta pieza.',
      newPricesUSD: [{ partNumber: PRODUCT.partNumber, price: 5555 }],
    });

    const stored = await t.run(async (ctx) => ctx.db.get(creada.quoteId));
    // Los dos precios conviven: la distancia entre ellos es la única evidencia
    // de si los rangos configurados sirven de algo.
    expect(stored!.products[0].confirmedPriceUSD).toBe(5555);
    expect(stored!.products[0].suggestedPriceUSD).toBe(suggested);
    expect(stored!.outcome).toBe('priced_differently');
    expect(stored!.approverExplanation).toBe('Ajusto el precio de esta pieza.');
  });

  test('aprobar sin cambios copia el Suggested Price al Confirmed Price', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    const creada = await createQuote(t, clerkId);
    const suggested = creada.products[0].suggestedPriceUSD!;

    await t.mutation(internal.quotes.processEmployeeResponse, {
      requestId: creada.requestId,
      classification: 'approved',
      explanation: 'Precios correctos, adelante.',
    });

    const stored = await t.run(async (ctx) => ctx.db.get(creada.quoteId));
    expect(stored!.products[0].confirmedPriceUSD).toBe(suggested);
    expect(stored!.products[0].suggestedPriceUSD).toBe(suggested);
    expect(stored!.outcome).toBe('priced_as_suggested');
  });

  test('aprobar sin cambios ignora cualquier precio suelto en la respuesta', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    const creada = await createQuote(t, clerkId);
    const suggested = creada.products[0].suggestedPriceUSD!;

    await t.mutation(internal.quotes.processEmployeeResponse, {
      requestId: creada.requestId,
      classification: 'approved',
      explanation: 'Todo correcto.',
      newPricesUSD: [{ partNumber: PRODUCT.partNumber, price: 9999 }],
      newDeliveryWeeks: 4,
    });

    // "Priced as suggested" tiene que significar exactamente eso: si el registro
    // llevara 9999 estaría afirmando algo falso sobre lo que decidió el Approver.
    const stored = await t.run(async (ctx) => ctx.db.get(creada.quoteId));
    expect(stored!.outcome).toBe('priced_as_suggested');
    expect(stored!.products[0].confirmedPriceUSD).toBe(suggested);
    expect(stored!.products[0].confirmedDeliveryWeeksMin).toBe(
      stored!.products[0].suggestedDeliveryWeeksMin
    );
  });

  test('una pieza sin Suggested Price no gana un cero al aprobarse en bloque', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    const creada = await createQuote(t, clerkId, INTERNAL_SECRET, [
      { ...PRODUCT, model: 'XX999-SIN-REGLA' },
    ]);

    await t.mutation(internal.quotes.processEmployeeResponse, {
      requestId: creada.requestId,
      classification: 'approved',
      explanation: 'Adelante.',
    });

    const stored = await t.run(async (ctx) => ctx.db.get(creada.quoteId));
    expect(stored!.products[0].confirmedPriceUSD).toBeUndefined();
  });
});

describe('el Outcome y la notificación al Customer se mueven por separado', () => {
  test('registrar un Outcome no marca al Customer como notificado', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    const creada = await createQuote(t, clerkId);

    await t.mutation(internal.quotes.processEmployeeResponse, {
      requestId: creada.requestId,
      classification: 'obsolete',
      explanation: 'Pieza descontinuada, sin reemplazo directo.',
    });

    const stored = await t.run(async (ctx) => ctx.db.get(creada.quoteId));
    expect(stored!.outcome).toBe('discontinued');
    expect(stored!.customerNotifiedAt).toBeUndefined();
  });

  test('notificar al Customer no inventa un Outcome', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    const creada = await createQuote(t, clerkId);

    await t.mutation(api.quotes.markAsSentToClient, { quoteId: creada.quoteId });

    const stored = await t.run(async (ctx) => ctx.db.get(creada.quoteId));
    expect(stored!.customerNotifiedAt).toEqual(expect.any(Number));
    expect(stored!.outcome).toBeUndefined();
  });

  test('un Outcome que no produce cotización deja al Customer sin notificar', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    const creada = await createQuote(t, clerkId);

    // Una clasificación que el intérprete no reconoce no debe producir Outcome:
    // la Replacement Request sigue en revisión, que es lo que significa su
    // ausencia.
    await t.mutation(internal.quotes.processEmployeeResponse, {
      requestId: creada.requestId,
      classification: 'no-se-entiende',
      explanation: 'Respuesta ambigua.',
    });

    const stored = await t.run(async (ctx) => ctx.db.get(creada.quoteId));
    expect(stored!.outcome).toBeUndefined();
    expect(stored!.products[0].confirmedPriceUSD).toBeUndefined();
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
