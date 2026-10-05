import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { INTERNAL_PATHS, stubInternalConvex } from '@/test/internal-convex';
import type { Outcome } from '../../../../convex/lib/outcome';
import type { Doc } from '../../../../convex/_generated/dataModel';
import { LANGUAGES, messagesFor } from '@/lib/messages';

/**
 * Seam 2 — la descarga del Quote Document autoriza sobre la identidad de Clerk
 * por dos caminos: la identidad es dueña de la Replacement Request, o Convex la
 * confirma como Supervisor. La lectura contra Convex es interna justamente para
 * que estas comprobaciones sean la única puerta.
 */

const { getAuth, fetchQuery } = vi.hoisted(() => ({
  getAuth: vi.fn(),
  fetchQuery: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: getAuth }));

// La pregunta «¿es Supervisor?» la contesta la consulta pública de Convex con
// el token de quien llama; se corta en la frontera con la biblioteca.
vi.mock('convex/nextjs', () => ({ fetchQuery }));

/**
 * Una sesión de Clerk con token para Convex, y lo que Convex contestará al
 * preguntarle si es Supervisor.
 */
function signedInAs(userId: string, { supervisor }: { supervisor: boolean }) {
  getAuth.mockResolvedValue({
    userId,
    getToken: vi.fn(async () => `token-de-${userId}`),
  });
  fetchQuery.mockResolvedValue(supervisor);
}

let convex: ReturnType<typeof stubInternalConvex>;

async function loadHandler() {
  vi.resetModules();
  const { GET } = await import('./route');
  return GET;
}

function request(quoteId = 'REQ-V59X9B') {
  return new Request(`http://localhost:3000/api/download-quote?quoteId=${quoteId}`);
}

/**
 * Los tipos salen del esquema a propósito: un fixture con forma libre sobrevive
 * a un renombrado de campo y deja de probar lo que dice probar.
 */
type QuoteOverrides = {
  outcome?: Outcome;
  customerNotifiedAt?: number;
  products?: Doc<'quotes'>['products'];
  preferredLanguage?: Doc<'users'>['preferredLanguage'];
};

function quoteDetails(overrides: QuoteOverrides = {}) {
  const { outcome = 'priced_differently', preferredLanguage = 'es', ...rest } = overrides;
  return {
    quote: {
      _id: 'quote_1',
      _creationTime: Date.UTC(2026, 6, 30),
      requestId: 'REQ-V59X9B',
      expiresAt: Date.UTC(2026, 7, 30),
      products: [
        {
          partNumber: 'P-001',
          model: 'MK137-4DZ.07.U',
          quantity: 2,
          deliveryLocation: 'Monterrey',
          suggestedPriceUSD: 3000,
          confirmedPriceUSD: 3125,
          suggestedDeliveryWeeksMin: 25,
          suggestedDeliveryWeeksMax: 30,
        },
      ],
      outcome,
      ...rest,
    },
    user: {
      clerkId: 'user_ana',
      fullName: 'Ana Cliente',
      companyName: 'Refrigeración del Norte',
      email: 'ana@example.com',
      preferredLanguage,
    },
  };
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', 'secreto-de-prueba');
  vi.stubEnv('NEXT_PUBLIC_CONVEX_SITE_URL', 'https://convex.example.site');
  convex = stubInternalConvex();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('GET /api/download-quote', () => {
  test('un llamador sin identidad de Clerk es rechazado y no llega a leer nada', async () => {
    getAuth.mockResolvedValue({ userId: null });
    const GET = await loadHandler();

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(convex.calls).toEqual([]);
  });

  test('un Customer no puede descargar la Replacement Request de otro', async () => {
    signedInAs('user_beto', { supervisor: false });
    convex.reply(INTERNAL_PATHS.details, quoteDetails());
    const GET = await loadHandler();

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(res.headers.get('Content-Type')).not.toBe('application/pdf');
  });

  test('el Customer dueño recibe su Quote Document', async () => {
    getAuth.mockResolvedValue({ userId: 'user_ana' });
    convex.reply(INTERNAL_PATHS.details, quoteDetails());
    const GET = await loadHandler();

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  /**
   * El archivo que se descarga lleva el nombre en el idioma del Customer: es lo
   * que le queda en su carpeta de descargas después de cerrar la pestaña.
   */
  test.each([
    ['es', 'Cotizacion_REQ-V59X9B.pdf'],
    ['en', 'Quotation_REQ-V59X9B.pdf'],
  ] as const)(
    'el Customer que eligió %s descarga un archivo llamado así',
    async (preferredLanguage, filename) => {
      getAuth.mockResolvedValue({ userId: 'user_ana' });
      convex.reply(INTERNAL_PATHS.details, quoteDetails({ preferredLanguage }));
      const GET = await loadHandler();

      const res = await GET(request());

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Disposition')).toContain(filename);
    }
  );

  /**
   * La negativa también es la pantalla: el Customer pulsa «Ver PDF» desde la
   * lista y lee la respuesta a tamaño completo. Traducir la lista y dejar esto
   * en español fijo dejaba la superficie a medias.
   */
  test.each(LANGUAGES)('el «todavía no hay cotización» se le dice en %s', async (language) => {
    getAuth.mockResolvedValue({ userId: 'user_ana' });
    convex.reply(
      INTERNAL_PATHS.details,
      quoteDetails({ outcome: 'discontinued', preferredLanguage: language })
    );
    const GET = await loadHandler();

    const res = await GET(request());

    expect(res.status).toBe(409);
    await expect(res.text()).resolves.toBe(messagesFor(language).quotes.downloadNoQuoteDocument);
  });

  /**
   * El test de más valor de la suite. Una pieza descontinuada o exclusiva del
   * fabricante no se puede vender, así que no tiene Quote Document — por mucho
   * que lleve precios encima y por mucho que ya se le haya avisado al Customer.
   * La comprobación va aquí, en el servidor, porque la ruta se alcanza directa
   * aunque el enlace esté escondido.
   */
  test.each(['oem_restricted', 'discontinued', 'blocked_pending_info'] as const)(
    'una Replacement Request con Outcome %s no produce PDF ni aunque tenga precios',
    async (outcome) => {
      getAuth.mockResolvedValue({ userId: 'user_ana' });
      convex.reply(
        INTERNAL_PATHS.details,
        quoteDetails({ outcome, customerNotifiedAt: Date.UTC(2026, 6, 31) })
      );
      const GET = await loadHandler();

      const res = await GET(request());

      expect(res.status).toBe(409);
      expect(res.headers.get('Content-Type')).not.toBe('application/pdf');
    }
  );

  test('una Replacement Request todavía en revisión no produce PDF', async () => {
    getAuth.mockResolvedValue({ userId: 'user_ana' });
    const { quote, user } = quoteDetails();
    // En revisión es la *ausencia* de Outcome, no un valor: se quita el campo.
    delete (quote as { outcome?: string }).outcome;
    convex.reply(INTERNAL_PATHS.details, { quote, user });
    const GET = await loadHandler();

    const res = await GET(request());

    expect(res.status).toBe(409);
    expect(res.headers.get('Content-Type')).not.toBe('application/pdf');
  });

  test('una pieza sin Confirmed Price impide el Quote Document entero', async () => {
    getAuth.mockResolvedValue({ userId: 'user_ana' });
    convex.reply(
      INTERNAL_PATHS.details,
      quoteDetails({
        products: [
          {
            partNumber: 'P-001',
            model: 'MK137-4DZ.07.U',
            quantity: 2,
            deliveryLocation: 'Monterrey',
            suggestedPriceUSD: 3000,
            confirmedPriceUSD: 3125,
            suggestedDeliveryWeeksMin: 25,
            suggestedDeliveryWeeksMax: 30,
          },
          {
            partNumber: 'P-002',
            model: 'ZZ999-SIN-PREFIJO',
            quantity: 1,
            deliveryLocation: 'Monterrey',
            suggestedDeliveryWeeksMin: 25,
            suggestedDeliveryWeeksMax: 30,
          },
        ],
      })
    );
    const GET = await loadHandler();

    const res = await GET(request());

    expect(res.status).toBe(409);
    expect(res.headers.get('Content-Type')).not.toBe('application/pdf');
  });

  test('el Customer dueño no necesita preguntarle a Convex si es Supervisor', async () => {
    getAuth.mockResolvedValue({ userId: 'user_ana' });
    convex.reply(INTERNAL_PATHS.details, quoteDetails());
    const GET = await loadHandler();

    await GET(request());

    expect(fetchQuery).not.toHaveBeenCalled();
  });

  describe('el Supervisor', () => {
    test('descarga el Quote Document de otro Customer', async () => {
      signedInAs('user_sara', { supervisor: true });
      convex.reply(INTERNAL_PATHS.details, quoteDetails());
      const GET = await loadHandler();

      const res = await GET(request());

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      // Se le pregunta a Convex con el token de quien llama, no con otro.
      expect(fetchQuery).toHaveBeenCalledWith(
        expect.anything(),
        {},
        { token: 'token-de-user_sara' }
      );
    });

    test('sin token de Convex no entra: falla cerrado', async () => {
      getAuth.mockResolvedValue({ userId: 'user_sara', getToken: vi.fn(async () => null) });
      fetchQuery.mockResolvedValue(true);
      convex.reply(INTERNAL_PATHS.details, quoteDetails());
      const GET = await loadHandler();

      const res = await GET(request());

      expect(res.status).toBe(401);
    });

    /**
     * Si Convex no contesta, quien no es dueño recibe la misma negativa de
     * siempre: ni un 500 ni el texto del error.
     */
    test('si la pregunta a Convex falla, un no dueño es rechazado como siempre', async () => {
      signedInAs('user_beto', { supervisor: true });
      fetchQuery.mockRejectedValue(new Error('Convex caído: detalle interno'));
      convex.reply(INTERNAL_PATHS.details, quoteDetails());
      const GET = await loadHandler();

      const res = await GET(request());

      expect(res.status).toBe(401);
      await expect(res.text()).resolves.not.toContain('detalle interno');
    });

    /**
     * Es el documento que recibió el Customer, así que va en su idioma: el
     * Supervisor no tiene idioma preferido que valga aquí.
     */
    test.each([
      ['es', 'Cotizacion_REQ-V59X9B.pdf'],
      ['en', 'Quotation_REQ-V59X9B.pdf'],
    ] as const)(
      'recibe el PDF en el idioma del Customer (%s)',
      async (preferredLanguage, filename) => {
        signedInAs('user_sara', { supervisor: true });
        convex.reply(INTERNAL_PATHS.details, quoteDetails({ preferredLanguage }));
        const GET = await loadHandler();

        const res = await GET(request());

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Disposition')).toContain(filename);
      }
    );

    test('no recibe PDF de una Replacement Request todavía en revisión', async () => {
      signedInAs('user_sara', { supervisor: true });
      const { quote, user } = quoteDetails();
      delete (quote as { outcome?: string }).outcome;
      convex.reply(INTERNAL_PATHS.details, { quote, user });
      const GET = await loadHandler();

      const res = await GET(request());

      expect(res.status).toBe(409);
      expect(res.headers.get('Content-Type')).not.toBe('application/pdf');
    });

    test('no recibe PDF si una pieza no tiene Confirmed Price', async () => {
      signedInAs('user_sara', { supervisor: true });
      const { quote, user } = quoteDetails();
      const [priced] = quote.products;
      quote.products = [priced, { ...priced, partNumber: 'P-002', confirmedPriceUSD: undefined }];
      convex.reply(INTERNAL_PATHS.details, { quote, user });
      const GET = await loadHandler();

      const res = await GET(request());

      expect(res.status).toBe(409);
      expect(res.headers.get('Content-Type')).not.toBe('application/pdf');
    });
  });
});
