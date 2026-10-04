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
const NOW = Date.UTC(2026, 9, 4, 12);

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

async function seedCustomer(t: TestConvex, fullName: string) {
  vi.setSystemTime(NOW - 1000 * DAY);
  return t.run((ctx) =>
    ctx.db.insert('users', {
      clerkId: `user_${fullName.toLowerCase()}`,
      fullName,
      companyName: `Empresa de ${fullName}`,
      email: `${fullName.toLowerCase()}@example.com`,
      phone: '+52 81 1234 5678',
      preferredLanguage: 'es',
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

describe('quien no es Supervisor', () => {
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
  });
});
