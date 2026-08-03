/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { SUGGESTED_DELIVERY_WEEKS } from './lib/delivery';
import schema from './schema';
import * as quotes from './quotes';

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
  vi.restoreAllMocks();
});

type TestConvex = ReturnType<typeof convexTest>;

/** Siembra una regla de precios, partiendo de `PRICING_RULE`. */
async function seedRule(t: TestConvex, rule: Partial<typeof PRICING_RULE> = {}) {
  await t.run(async (ctx) => {
    await ctx.db.insert('pricing_rules', { ...PRICING_RULE, ...rule });
  });
}

/**
 * Deja el sorteo en un valor fijo, de modo que el generador de códigos sólo
 * pueda producir uno. Una colisión real ocurre una vez cada 36^6 y no sería
 * observable de otra forma; fijar el valor no depende de cuántos sorteos
 * consuma la mutación ni en qué orden.
 */
function freezeRandom(value: number) {
  vi.spyOn(Math, 'random').mockReturnValue(value);
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
  await seedRule(t);
  return seedCustomer(t, 'user_ana', 'Ana');
}

/**
 * Crea una Replacement Request como el llamador interno. No lleva secreto: la
 * mutación es interna, así que el único modo de alcanzarla es ya estar dentro
 * de Convex, y el secreto se comprueba en la frontera HTTP.
 */
function createQuote(t: TestConvex, clerkId: string, products = [PRODUCT]) {
  return t.mutation(internal.quotes.create, { clerkId, products });
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

    const result = await createQuote(t, clerkId, [{ ...PRODUCT, model: 'XX999-SIN-REGLA' }]);

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

  test('gana el Model Prefix más largo, no el primero que coincide', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    // `MK` ya está sembrada y también coincide: si ganara la más corta, el precio
    // caería en 4000–4200 y la aserción de rango fallaría.
    await seedRule(t, { prefix: 'MK137', minPriceUSD: 9000, maxPriceUSD: 9100 });

    const result = await createQuote(t, clerkId);

    expect(result.products[0].suggestedPriceUSD).toBeGreaterThanOrEqual(9000);
    expect(result.products[0].suggestedPriceUSD).toBeLessThanOrEqual(9100);
  });

  test('el emparejamiento tolera mayúsculas y espacios almacenados', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seedCustomer(t, 'user_ana', 'Ana');
    await seedRule(t, { prefix: '  ck  ', minPriceUSD: 7000, maxPriceUSD: 7100 });

    const result = await createQuote(t, clerkId, [{ ...PRODUCT, model: ' ck900-2ez.10.c ' }]);

    expect(result.products[0].suggestedPriceUSD).toBeGreaterThanOrEqual(7000);
    expect(result.products[0].suggestedPriceUSD).toBeLessThanOrEqual(7100);
  });

  test('una regla desactivada no cotiza aunque su prefijo coincida', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seedCustomer(t, 'user_ana', 'Ana');
    await seedRule(t, { prefix: 'MK', isActive: false });

    const result = await createQuote(t, clerkId);

    expect(result.products[0].suggestedPriceUSD).toBeUndefined();
  });

  test('el Suggested Price se cotiza al centavo y nunca se sale del rango', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seedCustomer(t, 'user_ana', 'Ana');
    // Un rango de menos de un dólar de ancho, con un máximo en fracciones de
    // centavo: cotizar en dólares enteros, o redondear sólo el resultado del
    // sorteo, se sale de él por arriba.
    await seedRule(t, { prefix: 'MK', minPriceUSD: 1234.1, maxPriceUSD: 1234.905 });

    // Veinte piezas ejercen el sorteo veinte veces sin tocar `Math.random`: lo
    // que se afirma vale para cualquier valor que salga, no para uno guionado.
    const products = Array.from({ length: 20 }, (_, i) => ({ ...PRODUCT, partNumber: `P-${i}` }));
    const result = await createQuote(t, clerkId, products);

    for (const { suggestedPriceUSD: price } of result.products) {
      expect(price).toBeGreaterThanOrEqual(1234.1);
      expect(price).toBeLessThanOrEqual(1234.905);
      // Centavos, no milésimas: la aritmética del Quote Document tiene que
      // cuadrar contra una orden de compra.
      expect(price).toBe(Math.round(price! * 100) / 100);
    }
  });

  test('los totales sugeridos cuadran al centavo contra los precios unitarios', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seedCustomer(t, 'user_ana', 'Ana');
    await seedRule(t, { prefix: 'MK', minPriceUSD: 1234.56, maxPriceUSD: 1234.56 });

    // 1234.56 × 2 = 2469.12; IVA 16% = 395.0592, que al centavo son 395.06.
    const result = await createQuote(t, clerkId);

    expect(result.subtotalUSD).toBe(2469.12);
    expect(result.taxUSD).toBe(395.06);
    expect(result.totalUSD).toBe(2864.18);
  });

  test('dos Replacement Requests nunca comparten código', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    // Con el sorteo congelado el generador sólo produce un código, así que la
    // segunda Replacement Request no tiene ninguno libre. Falla en voz alta en
    // vez de repetirlo: `by_request_id` resuelve con `.first()`, y un código
    // repetido encaminaría la respuesta de un Approver a la request equivocada.
    freezeRandom(0.1);

    const primera = await createQuote(t, clerkId);
    await expect(createQuote(t, clerkId)).rejects.toThrow(
      'No se pudo generar un identificador de Replacement Request libre'
    );

    const stored = await t.run(async (ctx) => ctx.db.query('quotes').collect());
    expect(stored.map((q) => q.requestId)).toEqual([primera.requestId]);
    expect(primera.requestId).toMatch(/^REQ-[A-Z0-9]{6}$/);
  });
});

/** Afirma que un producto lleva la Delivery Estimate sugerida configurada. */
function expectConfiguredDeliveryRange(product: {
  suggestedDeliveryWeeksMin: number;
  suggestedDeliveryWeeksMax: number;
}) {
  expect(product.suggestedDeliveryWeeksMin).toBe(SUGGESTED_DELIVERY_WEEKS.min);
  expect(product.suggestedDeliveryWeeksMax).toBe(SUGGESTED_DELIVERY_WEEKS.max);
}

describe('la Delivery Estimate sugerida', () => {
  test('la capacidad configurada es de 25 a 30 semanas enteras', () => {
    // Éste es el único sitio que nombra las cifras, a propósito. El resto de los
    // tests las toman de la configuración para que un cambio de capacidad sea
    // una edición de `lib/delivery.ts`; sin esta afirmación, sin embargo, volver
    // a poner las 4–8 semanas de temporada pasaría la suite entera sin ruido, y
    // subestimar la realidad en veinte semanas es justamente el defecto que este
    // trabajo existe para cerrar. Cambiar la capacidad son dos ediciones, y las
    // dos deliberadas.
    expect(SUGGESTED_DELIVERY_WEEKS).toEqual({ min: 25, max: 30 });

    // Semanas enteras y un mínimo que no supera al máximo, según el glosario. Un
    // rango con los dos extremos iguales es válido: es una cifra ya acordada.
    expect(Number.isInteger(SUGGESTED_DELIVERY_WEEKS.min)).toBe(true);
    expect(Number.isInteger(SUGGESTED_DELIVERY_WEEKS.max)).toBe(true);
    expect(SUGGESTED_DELIVERY_WEEKS.min).toBeLessThanOrEqual(SUGGESTED_DELIVERY_WEEKS.max);
  });

  test('cada producto de la Replacement Request lleva el rango configurado', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    const products = Array.from({ length: 3 }, (_, i) => ({ ...PRODUCT, partNumber: `P-${i}` }));
    const result = await createQuote(t, clerkId, products);
    const stored = await t.run(async (ctx) => ctx.db.get(result.quoteId));

    // También sobre el registro escrito: el rango que ve el Approver en la
    // respuesta y el que acaba en el Quote Document son el mismo hecho.
    expect(result.products).toHaveLength(products.length);
    expect(stored!.products).toHaveLength(products.length);
    for (const product of [...result.products, ...stored!.products]) {
      expectConfiguredDeliveryRange(product);
    }
  });

  test('un producto sin Suggested Price lleva igualmente el rango configurado', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    // No cotizable no es lo mismo que sin Delivery Estimate: el Approver necesita
    // el rango de fábrica para poder poner un precio a mano sobre él.
    const result = await createQuote(t, clerkId, [{ ...PRODUCT, model: 'XX999-SIN-REGLA' }]);

    expect(result.products[0].suggestedPriceUSD).toBeUndefined();
    expectConfiguredDeliveryRange(result.products[0]);
  });

  test('el rango no depende del mes en curso', async () => {
    // La capacidad de fábrica gobierna la entrega, no el calendario. Hoy nada en
    // la ruta mira el reloj, así que esto no describe una rama viva: es una
    // guardia contra reintroducir una búsqueda por mes como la tabla de
    // temporadas que reemplaza, que daba 4, 5 u 8 semanas según la fecha — y ni
    // siquiera eso, porque su rango octubre–marzo no podía emparejar al cruzar
    // el fin de año. Por eso se recorren los doce meses y no dos.
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (let month = 0; month < 12; month++) {
        vi.setSystemTime(new Date(Date.UTC(2026, month, 15)));

        const result = await createQuote(t, clerkId);

        expectConfiguredDeliveryRange(result.products[0]);
      }
    } finally {
      vi.useRealTimers();
    }
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
    const creada = await createQuote(t, clerkId, [{ ...PRODUCT, model: 'XX999-SIN-REGLA' }]);

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

    await t.mutation(internal.quotes.markQuoteDocumentSent, { quoteId: creada.quoteId });

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
    await seedRule(t);
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

/**
 * Ticket 06 — la autorización se reduce a dos reglas: la identidad de Clerk para
 * el Customer, y el secreto interno en una cabecera para la máquina.
 */
describe('las funciones máquina a máquina no son alcanzables como públicas', () => {
  /**
   * `convex-test` no hace cumplir la visibilidad: `t.mutation` ejecuta cualquier
   * función registrada, sea pública o interna. Lo que decide si un navegador
   * puede alcanzarla es la propia registración, así que es sobre ella sobre lo
   * que se afirma. Cambiar un `internalMutation` por `mutation` — que es
   * exactamente la regresión que este ticket cierra — hace fallar esto.
   */
  const INTERNAS = [
    'create',
    'getByRequestId',
    'getFullQuoteDetails',
    'markQuoteDocumentSent',
    'markRejectionExplained',
    'processEmployeeResponse',
  ] as const;

  test.each(INTERNAS)('%s está registrada como interna', (name) => {
    expect(quotes[name].isInternal).toBe(true);
  });

  test('la única función pública es la lectura del propio Customer', () => {
    const publicas = Object.entries(quotes)
      .filter(([, fn]) => (fn as { isPublic?: boolean }).isPublic)
      .map(([name]) => name);

    // Toda superficie pública nueva tiene que autorizar sobre la identidad de
    // Clerk y comprobar la propiedad. Añadir una sin querer se ve aquí.
    expect(publicas).toEqual(['getUserQuotes']);
  });
});

describe('la frontera HTTP interna distingue la mala configuración de la denegación', () => {
  function createRequest(headers: Record<string, string>, clerkId = 'user_ana') {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ clerkId, products: [PRODUCT] }),
    };
  }

  test('sin la cabecera del secreto responde 401 y no escribe nada', async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    const res = await t.fetch('/internal/quotes/create', createRequest({}));

    expect(res.status).toBe(401);
    const almacenadas = await t.run(async (ctx) => ctx.db.query('quotes').collect());
    expect(almacenadas).toEqual([]);
  });

  test('con el secreto equivocado responde 401', async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    const res = await t.fetch(
      '/internal/quotes/create',
      createRequest({ 'x-internal-secret': 'secreto-equivocado' })
    );

    expect(res.status).toBe(401);
  });

  test('sin INTERNAL_API_SECRET configurado el error nombra la variable', async () => {
    // El 2026-08-02 esta situación se presentó como «No autorizado» y costó una
    // investigación entera. Se afirma el *mensaje*, no sólo el rechazo: es lo
    // único que impide que las dos causas vuelvan a colapsar en una.
    vi.stubEnv('INTERNAL_API_SECRET', '');
    const t = convexTest(schema, modules);
    await seed(t);

    const res = await t.fetch(
      '/internal/quotes/create',
      createRequest({ 'x-internal-secret': INTERNAL_SECRET })
    );

    expect(res.status).not.toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('INTERNAL_API_SECRET'),
    });
  });

  test('con el secreto correcto crea la Replacement Request', async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    const res = await t.fetch(
      '/internal/quotes/create',
      createRequest({ 'x-internal-secret': INTERNAL_SECRET })
    );

    expect(res.status).toBe(200);
    const { result } = await res.json();
    expect(result.requestId).toMatch(/^REQ-[A-Z0-9]+$/);

    const almacenadas = await t.run(async (ctx) => ctx.db.query('quotes').collect());
    expect(almacenadas.map((q) => q.requestId)).toEqual([result.requestId]);
  });
});

describe('el Quote Document enviado y el rechazo explicado son hechos distintos', () => {
  test('cada mutación registra su propio hecho y no el del otro camino', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    const conDocumento = await createQuote(t, clerkId);
    const conRechazo = await createQuote(t, clerkId);

    await t.mutation(internal.quotes.markQuoteDocumentSent, { quoteId: conDocumento.quoteId });
    await t.mutation(internal.quotes.markRejectionExplained, { quoteId: conRechazo.quoteId });

    const [documento, rechazo] = await t.run(async (ctx) => [
      await ctx.db.get(conDocumento.quoteId),
      await ctx.db.get(conRechazo.quoteId),
    ]);

    expect(documento!.quoteDocumentSentAt).toEqual(expect.any(Number));
    expect(documento!.rejectionExplainedAt).toBeUndefined();

    expect(rechazo!.rejectionExplainedAt).toEqual(expect.any(Number));
    expect(rechazo!.quoteDocumentSentAt).toBeUndefined();

    // Notificar sigue siendo independiente del Outcome, como fijó el ticket 03.
    expect(documento!.customerNotifiedAt).toEqual(expect.any(Number));
    expect(rechazo!.customerNotifiedAt).toEqual(expect.any(Number));
    expect(documento!.outcome).toBeUndefined();
    expect(rechazo!.outcome).toBeUndefined();
  });

  test('explicar un rechazo después no borra que el Quote Document salió', async () => {
    // Es el caso que obliga a que sean dos hechos y no uno: una Replacement
    // Request cotizada cuyo Approver corrige más tarde a descontinuada. Con un
    // solo campo, el segundo aviso hacía desaparecer el primero.
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    const creada = await createQuote(t, clerkId);

    await t.mutation(internal.quotes.markQuoteDocumentSent, { quoteId: creada.quoteId });
    await t.mutation(internal.quotes.markRejectionExplained, { quoteId: creada.quoteId });

    const stored = await t.run(async (ctx) => ctx.db.get(creada.quoteId));
    expect(stored!.quoteDocumentSentAt).toEqual(expect.any(Number));
    expect(stored!.rejectionExplainedAt).toEqual(expect.any(Number));
  });
});

describe('las demás rutas internas pasan por la misma frontera', () => {
  const RUTAS = [
    ['/internal/quotes/details', { requestId: 'REQ-ABC' }],
    ['/internal/quotes/quote-document-sent', { quoteId: 'no-importa' }],
    ['/internal/quotes/rejection-explained', { quoteId: 'no-importa' }],
  ] as const;

  test.each(RUTAS)('%s responde 401 sin la cabecera del secreto', async (path, body) => {
    const t = convexTest(schema, modules);
    await seed(t);

    const res = await t.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(401);
  });

  test('con el secreto correcto cada ruta alcanza su función interna', async () => {
    const t = convexTest(schema, modules);
    const clerkId = await seed(t);
    const creada = await createQuote(t, clerkId);

    const post = (path: string, body: unknown) =>
      t.fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
        body: JSON.stringify(body),
      });

    const detalles = await post('/internal/quotes/details', { requestId: creada.requestId });
    expect((await detalles.json()).result.quote.requestId).toBe(creada.requestId);

    expect(
      (await post('/internal/quotes/quote-document-sent', { quoteId: creada.quoteId })).status
    ).toBe(200);
    expect(
      (await post('/internal/quotes/rejection-explained', { quoteId: creada.quoteId })).status
    ).toBe(200);

    const stored = await t.run(async (ctx) => ctx.db.get(creada.quoteId));
    expect(stored!.quoteDocumentSentAt).toEqual(expect.any(Number));
    expect(stored!.rejectionExplainedAt).toEqual(expect.any(Number));
  });
});
