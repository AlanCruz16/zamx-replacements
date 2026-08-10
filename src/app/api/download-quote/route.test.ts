import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { INTERNAL_PATHS, stubInternalConvex } from '@/test/internal-convex';
import type { Outcome } from '../../../../convex/lib/outcome';
import type { Doc } from '../../../../convex/_generated/dataModel';
import { LANGUAGES, messagesFor } from '@/lib/messages';

/**
 * Seam 2 — la descarga del Quote Document es una superficie del Customer, así
 * que autoriza sobre la identidad de Clerk y comprueba que esa identidad es
 * dueña de la Replacement Request. La lectura contra Convex es interna
 * justamente para que esta comprobación sea la única puerta.
 */

const { getAuth } = vi.hoisted(() => ({ getAuth: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => ({ auth: getAuth }));

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
    getAuth.mockResolvedValue({ userId: 'user_beto' });
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
});
