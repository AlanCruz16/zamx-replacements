/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import type { PaginationResult } from 'convex/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { hasQuoteDocument } from './lib/quote_document';
import type { RequestFilters } from './lib/request_filters';
import type { SupervisorRequestRow } from './lib/supervisor_view';
import { requireSupervisor } from './lib/supervisors';
import schema from './schema';

/**
 * Quién entra al panel del Supervisor, preguntado como lo pregunta la página:
 * por la consulta pública, con una identidad como la que firma Clerk.
 *
 * La lista sale de `SUPERVISOR_EMAILS` en el entorno de la prueba, como en las
 * pruebas de los Approvers. A diferencia de aquella, aquí no hay respaldo en
 * `ADMIN_EMAIL`, y una prueba lo fija.
 */
const modules = import.meta.glob('./**/*.ts');

afterEach(() => {
  vi.unstubAllEnvs();
});

type Identity = { subject: string; email?: string; emailVerified?: boolean };

const SUPERVISOR: Identity = {
  subject: 'user_sofia',
  email: 'sofia@zamx.mx',
  emailVerified: true,
};

/** La respuesta que la página recibe para esta identidad. */
function isSupervisor(identity: Identity) {
  const t = convexTest(schema, modules);
  return t.withIdentity(identity).query(api.supervisor.amISupervisor, {});
}

describe('quién es Supervisor', () => {
  test('una dirección verificada de la lista es Supervisor', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');

    expect(await isSupervisor(SUPERVISOR)).toBe(true);
  });

  test('la comparación no mira mayúsculas ni espacios, ni en la lista ni en la identidad', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', ' gerencia@zamx.mx ,  Sofia@ZAMX.mx ');

    expect(await isSupervisor({ ...SUPERVISOR, email: ' SOFIA@zamx.MX ' })).toBe(true);
  });

  test('una dirección que no está en la lista no lo es', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'gerencia@zamx.mx');

    expect(await isSupervisor(SUPERVISOR)).toBe(false);
  });

  test('una dirección de la lista sin verificar no lo es', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');

    // Cualquiera puede darse de alta con una dirección ajena; sólo la
    // verificación dice que es suya.
    expect(await isSupervisor({ ...SUPERVISOR, emailVerified: false })).toBe(false);
    expect(await isSupervisor({ ...SUPERVISOR, emailVerified: undefined })).toBe(false);
  });

  test('una identidad sin correo no lo es', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');

    // Es lo que llegaría si la plantilla de Clerk dejara de mandar el claim:
    // falla cerrado.
    expect(await isSupervisor({ subject: 'user_sofia', emailVerified: true })).toBe(false);
  });

  test('con la lista vacía o sin configurar, nadie lo es', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', '');
    expect(await isSupervisor(SUPERVISOR)).toBe(false);

    vi.stubEnv('SUPERVISOR_EMAILS', ' , ');
    expect(await isSupervisor(SUPERVISOR)).toBe(false);

    vi.stubEnv('SUPERVISOR_EMAILS', undefined);
    expect(await isSupervisor(SUPERVISOR)).toBe(false);
  });

  test('no hereda la lista de Approvers ni su respaldo', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', '');
    vi.stubEnv('APPROVER_EMAILS', 'sofia@zamx.mx');
    vi.stubEnv('ADMIN_EMAIL', 'sofia@zamx.mx');

    expect(await isSupervisor(SUPERVISOR)).toBe(false);
  });

  test('sin sesión no lo es', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');
    const t = convexTest(schema, modules);

    expect(await t.query(api.supervisor.amISupervisor, {})).toBe(false);
  });
});

/**
 * La guarda por la que pasa cada consulta del panel. Qué contesta a quien no
 * tiene sesión se prueba más abajo, por las consultas mismas.
 */
describe('la guarda del Supervisor', () => {
  test('deja pasar a un Supervisor', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');
    const t = convexTest(schema, modules);

    const reached = await t.withIdentity(SUPERVISOR).run(async (ctx) => {
      await requireSupervisor(ctx);
      return 'dentro';
    });

    expect(reached).toBe('dentro');
  });

  test('rechaza a un Customer cualquiera', async () => {
    vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');
    const t = convexTest(schema, modules);
    const customer = { subject: 'user_ana', email: 'ana@example.com', emailVerified: true };

    await expect(t.withIdentity(customer).run((ctx) => requireSupervisor(ctx))).rejects.toThrow(
      'No autorizado'
    );
  });
});

/**
 * La lista y el detalle de Replacement Requests. Se siembran registros
 * directamente —con el Outcome, los precios y las marcas que hagan falta— y se
 * pregunta como pregunta la página: por la consulta pública, como Supervisor.
 *
 * El periodo se mide por la fecha de recepción (`_creationTime`), así que cada
 * siembra fija el reloj antes de insertar. convex-test nunca deja que
 * `_creationTime` retroceda —una inserción con el reloj atrasado cae justo
 * después de la anterior, en cualquier tabla—, así que se siembra en orden
 * cronológico y los Customers, antes que nada, en un pasado lejano.
 */

type TestConvex = ReturnType<typeof convexTest>;
type StoredQuote = Omit<Doc<'quotes'>, '_id' | '_creationTime' | 'userId'>;
type StoredProduct = StoredQuote['products'][number];

const DAY = 24 * 60 * 60 * 1000;
/** Domingo: la semana en curso empezó el lunes 28 de septiembre. */
const NOW = Date.UTC(2026, 9, 4, 12);
/** El reloj que manda el navegador al resumen: en UTC, salvo donde se diga. */
const CLOCK = { now: NOW, utcOffsetMinutes: 0 };

const PRICED_PART: StoredProduct = {
  partNumber: 'P-001',
  model: 'MK137-4DZ.07.U',
  quantity: 2,
  deliveryLocation: 'Monterrey',
  suggestedPriceUSD: 4100,
  confirmedPriceUSD: 3900,
  suggestedDeliveryWeeksMin: 25,
  suggestedDeliveryWeeksMax: 30,
  confirmedDeliveryWeeksMin: 20,
  confirmedDeliveryWeeksMax: 22,
};

/** Una pieza sin Model Prefix que coincida y sin precio confirmado todavía. */
const UNPRICED_PART: StoredProduct = {
  partNumber: 'P-002',
  model: 'XX999-SIN-REGLA',
  quantity: 1,
  deliveryLocation: 'Saltillo',
  suggestedDeliveryWeeksMin: 25,
  suggestedDeliveryWeeksMax: 30,
};

function supervisorConvex() {
  vi.stubEnv('SUPERVISOR_EMAILS', 'sofia@zamx.mx');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const t = convexTest(schema, modules);
  return { t, asSupervisor: t.withIdentity(SUPERVISOR) };
}

afterEach(() => {
  vi.useRealTimers();
});

async function seedCustomer(
  t: TestConvex,
  fullName: string,
  fields: Partial<Omit<Doc<'users'>, '_id' | '_creationTime'>> = {}
) {
  vi.setSystemTime(NOW - 1000 * DAY);
  return t.run((ctx) =>
    ctx.db.insert('users', {
      clerkId: `user_${fullName.toLowerCase()}`,
      fullName,
      companyName: `Empresa de ${fullName}`,
      email: `${fullName.toLowerCase()}@example.com`,
      phone: '+52 81 1234 5678',
      preferredLanguage: 'es',
      ...fields,
    })
  );
}

/** Siembra una Replacement Request recibida en `receivedAt`, posterior a la anterior. */
async function seedRequest(
  t: TestConvex,
  userId: Id<'users'>,
  receivedAt: number,
  fields: Partial<StoredQuote> = {}
) {
  vi.setSystemTime(receivedAt);
  const id = await t.run((ctx) =>
    ctx.db.insert('quotes', {
      userId,
      requestId: `REQ-${receivedAt.toString(36).toUpperCase().slice(-6)}`,
      products: [PRICED_PART],
      expiresAt: receivedAt + 30 * DAY,
      ...fields,
    })
  );
  vi.setSystemTime(NOW);
  return t.run(async (ctx) => (await ctx.db.get(id))!);
}

/** Recorre la lista entera, página a página, como lo hace la pantalla. */
async function listAll(
  asSupervisor: ReturnType<TestConvex['withIdentity']>,
  period: { start?: number; end?: number },
  numItems = 2,
  filters: RequestFilters = {}
) {
  const rows = [];
  let cursor: string | null = null;
  for (;;) {
    const result: PaginationResult<SupervisorRequestRow> = await asSupervisor.query(
      api.supervisor.listRequests,
      {
        period,
        filters,
        paginationOpts: { numItems, cursor },
      }
    );
    rows.push(...result.page);
    if (result.isDone) return rows;
    cursor = result.continueCursor;
  }
}

describe('la lista de Replacement Requests', () => {
  test('va de la más reciente a la más antigua, con lo que hace falta para leer cada fila', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    const old = await seedRequest(t, ana, NOW - 3 * DAY);
    const recent = await seedRequest(t, ana, NOW - 1 * DAY, {
      products: [PRICED_PART, UNPRICED_PART],
      outcome: 'discontinued',
    });

    const rows = await listAll(asSupervisor, {});

    expect(rows).toEqual([
      {
        _id: recent._id,
        requestId: recent.requestId,
        receivedAt: recent._creationTime,
        customerId: ana,
        customerName: 'Ana',
        companyName: 'Empresa de Ana',
        partCount: 2,
        outcome: 'discontinued',
      },
      {
        _id: old._id,
        requestId: old.requestId,
        receivedAt: old._creationTime,
        customerId: ana,
        customerName: 'Ana',
        companyName: 'Empresa de Ana',
        partCount: 1,
        outcome: undefined,
      },
    ]);
  });

  test('sólo trae las recibidas dentro del periodo', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    await seedRequest(t, ana, NOW - 40 * DAY);
    const inside = await seedRequest(t, ana, NOW - 10 * DAY);
    await seedRequest(t, ana, NOW - 1 * DAY);

    const rows = await listAll(asSupervisor, { start: NOW - 30 * DAY, end: NOW - 5 * DAY });

    expect(rows.map((row) => row._id)).toEqual([inside._id]);
  });

  test('sin periodo trae todas', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    await seedRequest(t, ana, NOW - 400 * DAY);
    await seedRequest(t, ana, NOW - 1 * DAY);

    expect(await listAll(asSupervisor, {})).toHaveLength(2);
  });

  test('paginando, cada Replacement Request sale exactamente una vez', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    const bruno = await seedCustomer(t, 'Bruno');
    const seeded = [];
    for (let day = 7; day >= 1; day--) {
      seeded.push(await seedRequest(t, day % 2 ? ana : bruno, NOW - day * DAY));
    }

    const rows = await listAll(asSupervisor, {}, 3);

    expect(rows.map((row) => row._id)).toEqual(seeded.map((quote) => quote._id).reverse());
  });
});

/**
 * Los filtros de la lista. Se siembra una mezcla de Customers y Outcomes en
 * fechas distintas, y cada prueba pregunta por un corte y compara contra lo que
 * debería salir, en orden.
 */
describe('los filtros de la lista', () => {
  async function seedMix(t: TestConvex) {
    const ana = await seedCustomer(t, 'Ana');
    const bruno = await seedCustomer(t, 'Bruno');
    const quotes = {
      anaOldDiscontinued: await seedRequest(t, ana, NOW - 40 * DAY, { outcome: 'discontinued' }),
      brunoAwaiting: await seedRequest(t, bruno, NOW - 20 * DAY),
      anaBlocked: await seedRequest(t, ana, NOW - 15 * DAY, { outcome: 'blocked_pending_info' }),
      brunoDiscontinued: await seedRequest(t, bruno, NOW - 10 * DAY, { outcome: 'discontinued' }),
      anaAwaiting: await seedRequest(t, ana, NOW - 5 * DAY),
      anaDiscontinued: await seedRequest(t, ana, NOW - 2 * DAY, { outcome: 'discontinued' }),
    };
    return { ana, bruno, quotes };
  }

  const ids = (rows: { _id: Id<'quotes'> }[]) => rows.map((row) => row._id);

  test('por Outcome trae sólo las de ese Outcome', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const { quotes } = await seedMix(t);

    const rows = await listAll(asSupervisor, {}, 2, { outcome: 'discontinued' });

    expect(ids(rows)).toEqual([
      quotes.anaDiscontinued._id,
      quotes.brunoDiscontinued._id,
      quotes.anaOldDiscontinued._id,
    ]);
  });

  test('«en revisión» trae sólo las que no tienen Outcome', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const { quotes } = await seedMix(t);

    const rows = await listAll(asSupervisor, {}, 2, { outcome: 'awaiting_review' });

    expect(ids(rows)).toEqual([quotes.anaAwaiting._id, quotes.brunoAwaiting._id]);
  });

  test('blocked_pending_info es su propio filtro, no «en revisión»', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const { quotes } = await seedMix(t);

    const rows = await listAll(asSupervisor, {}, 2, { outcome: 'blocked_pending_info' });

    expect(ids(rows)).toEqual([quotes.anaBlocked._id]);
  });

  test('por Customer trae sólo las suyas', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const { bruno, quotes } = await seedMix(t);

    const rows = await listAll(asSupervisor, {}, 2, { customerId: bruno });

    expect(ids(rows)).toEqual([quotes.brunoDiscontinued._id, quotes.brunoAwaiting._id]);
  });

  test('un Customer que no existe, o un id mal formado, no trae nada', async () => {
    const { t, asSupervisor } = supervisorConvex();
    await seedMix(t);

    // El id llega de la URL: tiene que soportar cualquier cosa sin tumbar la página.
    expect(await listAll(asSupervisor, {}, 2, { customerId: 'no-es-un-id' })).toEqual([]);
  });

  test('Outcome y periodo se combinan: descontinuadas de los últimos 30 días', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const { quotes } = await seedMix(t);

    const rows = await listAll(asSupervisor, { start: NOW - 30 * DAY }, 2, {
      outcome: 'discontinued',
    });

    expect(ids(rows)).toEqual([quotes.anaDiscontinued._id, quotes.brunoDiscontinued._id]);
  });

  test('Customer y Outcome se combinan, también con el periodo', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const { ana, quotes } = await seedMix(t);

    expect(
      ids(await listAll(asSupervisor, {}, 2, { customerId: ana, outcome: 'discontinued' }))
    ).toEqual([quotes.anaDiscontinued._id, quotes.anaOldDiscontinued._id]);
    expect(
      ids(
        await listAll(asSupervisor, { start: NOW - 30 * DAY, end: NOW - 3 * DAY }, 2, {
          customerId: ana,
          outcome: 'awaiting_review',
        })
      )
    ).toEqual([quotes.anaAwaiting._id]);
  });

  test('por código REQ- encuentra exactamente esa, sin importar mayúsculas ni espacios', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const { quotes } = await seedMix(t);
    const code = quotes.brunoAwaiting.requestId;

    const rows = await listAll(asSupervisor, {}, 2, {
      requestId: `  ${code.toLowerCase()} `,
    });

    expect(ids(rows)).toEqual([quotes.brunoAwaiting._id]);
  });

  test('por código REQ- no encuentra nada si no existe o si otro filtro la deja fuera', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const { ana, quotes } = await seedMix(t);
    const code = quotes.brunoAwaiting.requestId;

    expect(await listAll(asSupervisor, {}, 2, { requestId: 'REQ-NOEXIS' })).toEqual([]);
    expect(await listAll(asSupervisor, {}, 2, { requestId: code, customerId: ana })).toEqual([]);
    expect(
      await listAll(asSupervisor, {}, 2, { requestId: code, outcome: 'discontinued' })
    ).toEqual([]);
    expect(await listAll(asSupervisor, { start: NOW - 7 * DAY }, 2, { requestId: code })).toEqual(
      []
    );
  });

  test('paginando bajo cualquier combinación, cada coincidencia sale exactamente una vez', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    const bruno = await seedCustomer(t, 'Bruno');
    const outcomes = [undefined, 'discontinued', 'priced_as_suggested'] as const;
    const seeded = [];
    for (let day = 30; day >= 1; day--) {
      const outcome = outcomes[day % 3];
      seeded.push(
        await seedRequest(t, day % 2 ? ana : bruno, NOW - day * DAY, outcome ? { outcome } : {})
      );
    }

    const combos: { period: { start?: number }; filters: RequestFilters }[] = [
      { period: {}, filters: { outcome: 'discontinued' } },
      { period: {}, filters: { outcome: 'awaiting_review' } },
      { period: {}, filters: { customerId: ana } },
      {
        period: { start: NOW - 20 * DAY },
        filters: { customerId: bruno, outcome: 'discontinued' },
      },
      { period: { start: NOW - 12 * DAY }, filters: { outcome: 'awaiting_review' } },
    ];
    for (const { period, filters } of combos) {
      const expected = seeded
        .filter((quote) => period.start === undefined || quote._creationTime >= period.start)
        .filter((quote) => !filters.customerId || quote.userId === filters.customerId)
        .filter(
          (quote) =>
            !filters.outcome ||
            (filters.outcome === 'awaiting_review'
              ? quote.outcome === undefined
              : quote.outcome === filters.outcome)
        )
        .map((quote) => quote._id)
        .reverse();

      expect(expected.length).toBeGreaterThan(1);
      expect(ids(await listAll(asSupervisor, period, 2, filters))).toEqual(expected);
    }
  });
});

describe('el detalle de una Replacement Request', () => {
  test('trae al Customer, las piezas con su Suggested Price, el Outcome y cada aviso', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    const quote = await seedRequest(t, ana, NOW - 2 * DAY, {
      outcome: 'priced_differently',
      approverExplanation: 'Le bajamos el precio por volumen.',
      customerNotifiedAt: NOW - DAY,
      quoteDocumentSentAt: NOW - DAY,
    });

    const detail = await asSupervisor.query(api.supervisor.requestDetail, {
      requestId: quote.requestId,
    });

    expect(detail).toEqual({
      _id: quote._id,
      requestId: quote.requestId,
      receivedAt: quote._creationTime,
      customer: {
        _id: ana,
        fullName: 'Ana',
        companyName: 'Empresa de Ana',
        email: 'ana@example.com',
        phone: '+52 81 1234 5678',
      },
      products: [PRICED_PART],
      outcome: 'priced_differently',
      approverExplanation: 'Le bajamos el precio por volumen.',
      customerNotifiedAt: NOW - DAY,
      quoteDocumentSentAt: NOW - DAY,
      rejectionExplainedAt: undefined,
      hasQuoteDocument: true,
    });
  });

  test('un precio ausente sigue ausente, nunca cero', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    const quote = await seedRequest(t, ana, NOW - DAY, { products: [UNPRICED_PART] });

    const detail = await asSupervisor.query(api.supervisor.requestDetail, {
      requestId: quote.requestId,
    });

    const [part] = detail!.products;
    expect(part).not.toHaveProperty('suggestedPriceUSD');
    expect(part).not.toHaveProperty('confirmedPriceUSD');
  });

  test.each([
    ['con precio y todas las piezas confirmadas', 'priced_as_suggested', [PRICED_PART], true],
    [
      'con precio y una pieza sin confirmar',
      'priced_as_suggested',
      [PRICED_PART, UNPRICED_PART],
      false,
    ],
    ['descontinuada, aunque lleve precios', 'discontinued', [PRICED_PART], false],
    ['exclusiva del fabricante, aunque lleve precios', 'oem_restricted', [PRICED_PART], false],
    ['en revisión', undefined, [PRICED_PART], false],
  ] as const)(
    'si tiene Quote Document lo decide la regla compartida: %s',
    async (_case, outcome, products, expected) => {
      const { t, asSupervisor } = supervisorConvex();
      const ana = await seedCustomer(t, 'Ana');
      const quote = await seedRequest(t, ana, NOW - DAY, {
        products: [...products],
        ...(outcome ? { outcome } : {}),
      });

      const detail = await asSupervisor.query(api.supervisor.requestDetail, {
        requestId: quote.requestId,
      });

      expect(detail!.hasQuoteDocument).toBe(expected);
      expect(detail!.hasQuoteDocument).toBe(hasQuoteDocument(quote));
    }
  );

  test('un código que no existe no trae nada', async () => {
    const { asSupervisor } = supervisorConvex();

    expect(
      await asSupervisor.query(api.supervisor.requestDetail, { requestId: 'REQ-NOEXIS' })
    ).toBeNull();
  });
});

/**
 * Los Customers: una fila por persona con al menos una Replacement Request,
 * nunca agrupadas por empresa, y el detalle de cada una.
 */
describe('la lista de Customers', () => {
  test('sólo trae a quien ha enviado alguna Replacement Request', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    // Se dio de alta y nunca pidió nada; un Supervisor es igual que ella.
    await seedCustomer(t, 'Bruno');
    await seedCustomer(t, 'Sofia', { email: 'sofia@zamx.mx', companyName: 'Pendiente' });
    await seedRequest(t, ana, NOW - DAY);

    const rows = await asSupervisor.query(api.supervisor.listCustomers, {});

    expect(rows.map((row) => row._id)).toEqual([ana]);
  });

  test('cuenta sus Replacement Requests y da la fecha de la última', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    const bruno = await seedCustomer(t, 'Bruno');
    await seedRequest(t, ana, NOW - 30 * DAY);
    const brunoOnly = await seedRequest(t, bruno, NOW - 20 * DAY);
    const anaLatest = await seedRequest(t, ana, NOW - 2 * DAY);

    const rows = await asSupervisor.query(api.supervisor.listCustomers, {});

    // Por defecto, quien pidió algo más recientemente va primero.
    expect(rows).toEqual([
      {
        _id: ana,
        fullName: 'Ana',
        companyName: 'Empresa de Ana',
        email: 'ana@example.com',
        requestCount: 2,
        latestRequestAt: anaLatest._creationTime,
      },
      {
        _id: bruno,
        fullName: 'Bruno',
        companyName: 'Empresa de Bruno',
        email: 'bruno@example.com',
        requestCount: 1,
        latestRequestAt: brunoOnly._creationTime,
      },
    ]);
  });

  test('dos Customers con la misma empresa son dos filas', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana', { companyName: 'Pendiente' });
    const bruno = await seedCustomer(t, 'Bruno', { companyName: 'Pendiente' });
    await seedRequest(t, ana, NOW - 2 * DAY);
    await seedRequest(t, bruno, NOW - DAY);

    const rows = await asSupervisor.query(api.supervisor.listCustomers, {});

    expect(rows.map((row) => [row._id, row.companyName, row.requestCount])).toEqual([
      [bruno, 'Pendiente', 1],
      [ana, 'Pendiente', 1],
    ]);
  });

  test('filtra por empresa sin mirar mayúsculas, acentos ni espacios, y por un trozo del nombre', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana', { companyName: 'Ventiladores Monterrey' });
    const bruno = await seedCustomer(t, 'Bruno', { companyName: 'Climatización del Norte' });
    const carla = await seedCustomer(t, 'Carla', { companyName: 'CLIMATIZACION NORTE SA' });
    for (const customer of [ana, bruno, carla]) await seedRequest(t, customer, NOW - DAY);

    const rows = await asSupervisor.query(api.supervisor.listCustomers, {
      company: '  climatización ',
    });

    expect(rows.map((row) => row._id).sort()).toEqual([bruno, carla].sort());
  });

  test('ordena por empresa, y dentro de una empresa por la última solicitud', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana', { companyName: 'Zeta' });
    const bruno = await seedCustomer(t, 'Bruno', { companyName: 'álamo' });
    const carla = await seedCustomer(t, 'Carla', { companyName: 'Beta' });
    const dario = await seedCustomer(t, 'Dario', { companyName: 'Beta' });
    await seedRequest(t, carla, NOW - 4 * DAY);
    await seedRequest(t, ana, NOW - 3 * DAY);
    await seedRequest(t, dario, NOW - 2 * DAY);
    await seedRequest(t, bruno, NOW - DAY);

    const rows = await asSupervisor.query(api.supervisor.listCustomers, { sort: 'company' });

    expect(rows.map((row) => row._id)).toEqual([bruno, dario, carla, ana]);
  });

  test('ordena por número de solicitudes, de más a menos', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    const bruno = await seedCustomer(t, 'Bruno');
    await seedRequest(t, bruno, NOW - 3 * DAY);
    await seedRequest(t, bruno, NOW - 2 * DAY);
    await seedRequest(t, ana, NOW - DAY);

    const rows = await asSupervisor.query(api.supervisor.listCustomers, { sort: 'requests' });

    expect(rows.map((row) => row._id)).toEqual([bruno, ana]);
  });
});

describe('el detalle de un Customer', () => {
  test('trae sus datos de contacto y sólo sus Replacement Requests, la más reciente primero', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana', { preferredLanguage: 'en' });
    const bruno = await seedCustomer(t, 'Bruno');
    const signedUpAt = (await t.run((ctx) => ctx.db.get(ana)))!._creationTime;
    const old = await seedRequest(t, ana, NOW - 10 * DAY, { outcome: 'discontinued' });
    await seedRequest(t, bruno, NOW - 5 * DAY);
    const recent = await seedRequest(t, ana, NOW - DAY);

    const detail = await asSupervisor.query(api.supervisor.customerDetail, { customerId: ana });

    expect(detail).toEqual({
      _id: ana,
      fullName: 'Ana',
      companyName: 'Empresa de Ana',
      email: 'ana@example.com',
      phone: '+52 81 1234 5678',
      preferredLanguage: 'en',
      signedUpAt,
      requests: [
        {
          _id: recent._id,
          requestId: recent.requestId,
          receivedAt: recent._creationTime,
          customerId: ana,
          customerName: 'Ana',
          companyName: 'Empresa de Ana',
          partCount: 1,
          outcome: undefined,
        },
        {
          _id: old._id,
          requestId: old.requestId,
          receivedAt: old._creationTime,
          customerId: ana,
          customerName: 'Ana',
          companyName: 'Empresa de Ana',
          partCount: 1,
          outcome: 'discontinued',
        },
      ],
    });
  });

  test('un Customer que no existe, o un id mal formado, no trae nada', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    await t.run((ctx) => ctx.db.delete(ana));

    expect(await asSupervisor.query(api.supervisor.customerDetail, { customerId: ana })).toBeNull();
    expect(
      await asSupervisor.query(api.supervisor.customerDetail, { customerId: 'no-es-un-id' })
    ).toBeNull();
  });
});

/**
 * El resumen del panel: cuántas llegaron en el periodo, cómo se reparten por
 * Outcome, quién pide más y cuántos se dieron de alta sin pedir nada.
 */
describe('el resumen', () => {
  test('cuenta las recibidas en el periodo, por Outcome, y deja fuera las de antes', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    // Fuera del periodo: no cuenta en nada.
    await seedRequest(t, ana, NOW - 40 * DAY, { outcome: 'discontinued' });
    await seedRequest(t, ana, NOW - 20 * DAY);
    await seedRequest(t, ana, NOW - 15 * DAY, { outcome: 'discontinued' });
    await seedRequest(t, ana, NOW - 10 * DAY, { outcome: 'blocked_pending_info' });
    await seedRequest(t, ana, NOW - 5 * DAY, { outcome: 'priced_as_suggested' });
    await seedRequest(t, ana, NOW - 1 * DAY);

    const summary = await asSupervisor.query(api.supervisor.dashboard, {
      period: { start: NOW - 30 * DAY },
      clock: CLOCK,
    });

    expect(summary?.received).toBe(5);
    expect(summary?.byOutcome).toEqual({
      // Exactamente las que no tienen Outcome; `blocked_pending_info` va aparte.
      awaiting_review: 2,
      priced_as_suggested: 1,
      priced_differently: 0,
      oem_restricted: 0,
      discontinued: 1,
      blocked_pending_info: 1,
    });
  });

  test('deja fuera las recibidas desde el final del periodo', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    await seedRequest(t, ana, NOW - 20 * DAY, { products: [{ ...PRICED_PART, quantity: 4 }] });
    // Justo en el final, que no se incluye.
    await seedRequest(t, ana, NOW - 10 * DAY, { outcome: 'discontinued' });

    const summary = await asSupervisor.query(api.supervisor.dashboard, {
      period: { start: NOW - 30 * DAY, end: NOW - 10 * DAY },
      clock: CLOCK,
    });

    expect(summary?.received).toBe(1);
    expect(summary?.byOutcome.discontinued).toBe(0);
    expect(summary?.topCustomers).toEqual([
      expect.objectContaining({ requestCount: 1, unitCount: 4 }),
    ]);
  });

  test('sin periodo cuenta todo', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    await seedRequest(t, ana, NOW - 400 * DAY);
    await seedRequest(t, ana, NOW - DAY);

    const summary = await asSupervisor.query(api.supervisor.dashboard, {
      period: {},
      clock: CLOCK,
    });

    expect(summary?.received).toBe(2);
  });

  test('los Customers que más piden, como mucho cinco, con sus unidades sumadas', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const names = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fer'];
    const ids = [];
    for (const name of names) ids.push(await seedCustomer(t, name));
    const [ana, bruno, carla, diego, elena, fer] = ids;

    // Lo que pidió Bruno antes del periodo no le sube en el ranking.
    await seedRequest(t, bruno, NOW - 60 * DAY);
    await seedRequest(t, bruno, NOW - 50 * DAY);

    // Ana: 3 solicitudes; Bruno: 2; Carla, Diego, Elena: 1; Fer: 1 pero con más unidades.
    let at = NOW - 25 * DAY;
    const next = () => (at += DAY);
    await seedRequest(t, ana, next(), { products: [PRICED_PART, UNPRICED_PART] });
    await seedRequest(t, ana, next());
    await seedRequest(t, ana, next(), { products: [{ ...PRICED_PART, quantity: 5 }] });
    await seedRequest(t, bruno, next());
    await seedRequest(t, bruno, next(), { products: [UNPRICED_PART] });
    await seedRequest(t, carla, next());
    await seedRequest(t, diego, next());
    await seedRequest(t, elena, next(), { products: [UNPRICED_PART] });
    await seedRequest(t, fer, next(), { products: [{ ...PRICED_PART, quantity: 10 }] });

    const summary = await asSupervisor.query(api.supervisor.dashboard, {
      period: { start: NOW - 30 * DAY },
      clock: CLOCK,
    });

    expect(summary?.topCustomers).toHaveLength(5);
    expect(summary?.topCustomers[0]).toEqual({
      customerId: ana,
      fullName: 'Ana',
      companyName: 'Empresa de Ana',
      requestCount: 3,
      // 2 + 1, luego 2, luego 5.
      unitCount: 10,
    });
    expect(summary?.topCustomers[1]).toMatchObject({
      customerId: bruno,
      requestCount: 2,
      unitCount: 3,
    });
    // Empatados a una solicitud, desempata quien pidió más unidades; Elena queda fuera.
    expect(summary?.topCustomers.slice(2).map((row) => [row.customerId, row.unitCount])).toEqual([
      [fer, 10],
      [carla, 2],
      [diego, 2],
    ]);
  });

  test('cuenta a quien se dio de alta y nunca pidió nada, sin mirar el periodo', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    const bruno = await seedCustomer(t, 'Bruno');
    await seedCustomer(t, 'Carla');
    await seedCustomer(t, 'Diego');
    await seedRequest(t, ana, NOW - DAY);
    // Pidió hace mucho, fuera del periodo: ya no es «nunca».
    await seedRequest(t, bruno, NOW - 200 * DAY);

    const summary = await asSupervisor.query(api.supervisor.dashboard, {
      period: { start: NOW - 30 * DAY },
      clock: CLOCK,
    });

    expect(summary?.neverRequested).toBe(2);
  });

  test('cuenta por semana, de lunes a lunes, con las semanas vacías a cero', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    // Antes del periodo: no cuenta en ninguna semana.
    await seedRequest(t, ana, Date.UTC(2026, 8, 13, 11));
    // El domingo 13 hasta su último milisegundo es de la semana del lunes 7…
    await seedRequest(t, ana, Date.UTC(2026, 8, 13, 13));
    await seedRequest(t, ana, Date.UTC(2026, 8, 14) - 1);
    // …y la medianoche del lunes 14 ya es de la siguiente.
    await seedRequest(t, ana, Date.UTC(2026, 8, 14));
    // Nada la semana del 21.
    await seedRequest(t, ana, Date.UTC(2026, 8, 28, 9));
    await seedRequest(t, ana, NOW - 1000);

    const summary = await asSupervisor.query(api.supervisor.dashboard, {
      period: { start: Date.UTC(2026, 8, 13, 12) },
      clock: CLOCK,
    });

    expect(summary?.weekly).toEqual([
      { weekStart: Date.UTC(2026, 8, 7), count: 2 },
      { weekStart: Date.UTC(2026, 8, 14), count: 1 },
      { weekStart: Date.UTC(2026, 8, 21), count: 0 },
      { weekStart: Date.UTC(2026, 8, 28), count: 2 },
    ]);
  });

  test('las semanas empiezan el lunes en la hora de quien mira', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    // Lunes 28 a las 03:00 UTC: en Ciudad de México (UTC−6) todavía es domingo.
    await seedRequest(t, ana, Date.UTC(2026, 8, 28, 3));

    const summary = await asSupervisor.query(api.supervisor.dashboard, {
      period: { start: Date.UTC(2026, 8, 25) },
      clock: { now: NOW, utcOffsetMinutes: -360 },
    });

    // El lunes a medianoche en México son las 06:00 UTC.
    expect(summary?.weekly).toEqual([
      { weekStart: Date.UTC(2026, 8, 21, 6), count: 1 },
      { weekStart: Date.UTC(2026, 8, 28, 6), count: 0 },
    ]);
  });

  test('con «todo», la serie empieza en la semana de la primera recibida', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    // Miércoles 19 de agosto: su semana empieza el lunes 17.
    await seedRequest(t, ana, Date.UTC(2026, 7, 19, 15));
    await seedRequest(t, ana, NOW - DAY);

    const summary = await asSupervisor.query(api.supervisor.dashboard, {
      period: {},
      clock: CLOCK,
    });

    const weekly = summary?.weekly ?? [];
    expect(weekly[0]).toEqual({ weekStart: Date.UTC(2026, 7, 17), count: 1 });
    // Del 17 de agosto al 28 de septiembre: siete semanas, la última la de hoy.
    expect(weekly).toHaveLength(7);
    expect(weekly.at(-1)).toEqual({ weekStart: Date.UTC(2026, 8, 28), count: 1 });
    expect(weekly.slice(1, -1).every((week) => week.count === 0)).toBe(true);
  });

  test('con «todo» y ninguna recibida, la serie está vacía', async () => {
    const { t, asSupervisor } = supervisorConvex();
    await seedCustomer(t, 'Ana');

    const summary = await asSupervisor.query(api.supervisor.dashboard, {
      period: {},
      clock: CLOCK,
    });

    expect(summary?.weekly).toEqual([]);
  });

  test('una recibida después de `now` alarga la serie en vez de perderse', async () => {
    const { t, asSupervisor } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    // El navegador resolvió el periodo el domingo; esta llega el lunes siguiente.
    await seedRequest(t, ana, Date.UTC(2026, 9, 5, 9));

    const summary = await asSupervisor.query(api.supervisor.dashboard, {
      period: { start: Date.UTC(2026, 8, 28) },
      clock: CLOCK,
    });

    expect(summary?.weekly).toEqual([
      { weekStart: Date.UTC(2026, 8, 28), count: 0 },
      { weekStart: Date.UTC(2026, 9, 5), count: 1 },
    ]);
  });
});

describe('quien no es Supervisor', () => {
  test('no puede leer el resumen', async () => {
    const { t } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    await seedRequest(t, ana, NOW - DAY);
    const asAna = t.withIdentity({
      subject: 'user_ana',
      email: 'ana@example.com',
      emailVerified: true,
    });

    await expect(
      asAna.query(api.supervisor.dashboard, { period: {}, clock: CLOCK })
    ).rejects.toThrow('No autorizado');
  });

  test('no puede leer ni la lista ni el detalle', async () => {
    const { t } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    const quote = await seedRequest(t, ana, NOW - DAY);
    // Ni siquiera la dueña de la Replacement Request.
    const asAna = t.withIdentity({
      subject: 'user_ana',
      email: 'ana@example.com',
      emailVerified: true,
    });

    await expect(
      asAna.query(api.supervisor.listRequests, {
        period: {},
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toThrow('No autorizado');
    await expect(
      asAna.query(api.supervisor.requestDetail, { requestId: quote.requestId })
    ).rejects.toThrow('No autorizado');
  });

  test('no puede leer ni la lista de Customers ni el detalle de uno, ni siquiera el suyo', async () => {
    const { t } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    await seedRequest(t, ana, NOW - DAY);
    const asAna = t.withIdentity({
      subject: 'user_ana',
      email: 'ana@example.com',
      emailVerified: true,
    });

    await expect(asAna.query(api.supervisor.listCustomers, {})).rejects.toThrow('No autorizado');
    await expect(asAna.query(api.supervisor.customerDetail, { customerId: ana })).rejects.toThrow(
      'No autorizado'
    );
  });
});

describe('quien no tiene sesión', () => {
  /**
   * No es un intruso: es el hueco del handshake. Al cargar la página, Clerk le
   * entrega a Convex un `getToken` nuevo y el proveedor vuelve a autenticarse
   * pasando por `clearAuth()`, así que las consultas ya suscritas se reejecutan
   * un instante sin identidad. Lanzar ahí tumbaba el panel de un Supervisor de
   * verdad; no devolver nada es lo que ya hacen las consultas del Customer.
   */
  test('no recibe nada de la lista ni del detalle, y tampoco un error', async () => {
    const { t } = supervisorConvex();
    const ana = await seedCustomer(t, 'Ana');
    const quote = await seedRequest(t, ana, NOW - DAY);

    const list = await t.query(api.supervisor.listRequests, {
      period: {},
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(list.page).toEqual([]);
    expect(list.isDone).toBe(true);

    expect(await t.query(api.supervisor.requestDetail, { requestId: quote.requestId })).toBeNull();
    expect(await t.query(api.supervisor.listCustomers, {})).toEqual([]);
    expect(await t.query(api.supervisor.customerDetail, { customerId: ana })).toBeNull();
    expect(await t.query(api.supervisor.dashboard, { period: {}, clock: CLOCK })).toBeNull();
  });
});
