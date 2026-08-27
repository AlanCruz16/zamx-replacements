import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { INTERNAL_PATHS, stubInternalConvex } from '@/test/internal-convex';
import type { Language } from '@/lib/messages';
import type { ReactElement } from 'react';
import type { QuoteDocumentProps } from '@/components/pdf/QuoteDocument';
import type { Doc } from '../../../convex/_generated/dataModel';

/** El elemento que las rutas le pasan al renderizador, con sus props tipados. */
type QuoteElement = ReactElement<QuoteDocumentProps>;

/**
 * Seam 2, a través de las dos rutas a la vez: el adjunto del correo y la
 * descarga del Customer tienen que producir **el mismo** Quote Document para la
 * misma Replacement Request.
 *
 * Cada ruta armaba sus props por su cuenta (el porqué está en
 * `@/lib/quote-document-props`) y nada obligaba a que coincidieran. Este test es
 * la obligación: falla en cuanto una de las dos empiece a construir un documento
 * distinto.
 *
 * El corte va en `@react-pdf/renderer`, la frontera con la biblioteca, no en
 * nuestro componente: lo que se prueba es qué props salen de cada ruta, y el
 * documento en sí ya lo renderizan de verdad los tests de cada ruta.
 */

const { renderToBuffer, renderToStream } = vi.hoisted(() => ({
  renderToBuffer: vi.fn(async (_element: QuoteElement) => Buffer.from('%PDF-falso')),
  renderToStream: vi.fn(async (_element: QuoteElement) => new ReadableStream()),
}));

// Parcial: sólo se sustituyen las dos funciones que dibujan. El resto de la
// biblioteca es lo que `QuoteDocument` usa para definirse, y falsearlo sería
// falsear el componente en vez de la frontera.
vi.mock('@react-pdf/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-pdf/renderer')>()),
  renderToBuffer,
  renderToStream,
}));

const { sendEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => ({ data: { id: 'email_1' }, error: null })),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

const { getAuth } = vi.hoisted(() => ({ getAuth: vi.fn() }));

vi.mock('@clerk/nextjs/server', () => ({ auth: getAuth }));

const INTERNAL_SECRET = 'secreto-de-prueba';
const REQUEST_ID = 'REQ-V59X9B';

let convex: ReturnType<typeof stubInternalConvex>;

/**
 * Una Replacement Request con Quote Document, como la devuelve
 * `getFullQuoteDetails`. Las piezas salen tipadas del esquema a propósito: un
 * fixture con forma libre sobrevive a un renombrado de campo y deja de probar lo
 * que dice probar.
 */
function quoteDetails(preferredLanguage: Language = 'es') {
  const products: Doc<'quotes'>['products'] = [
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
      model: 'RH45V-4EK.4F.1R',
      quantity: 1,
      deliveryLocation: 'Monterrey',
      suggestedPriceUSD: 1200,
      confirmedPriceUSD: 1200,
      suggestedDeliveryWeeksMin: 10,
      suggestedDeliveryWeeksMax: 14,
      confirmedDeliveryWeeksMin: 12,
      confirmedDeliveryWeeksMax: 16,
    },
  ];

  return {
    quote: {
      _id: 'quote_1',
      _creationTime: Date.UTC(2026, 6, 30),
      requestId: REQUEST_ID,
      expiresAt: Date.UTC(2026, 7, 30),
      products,
      outcome: 'priced_differently',
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

/** Los props con los que la ruta del correo pidió renderizar el documento. */
async function propsFromEmailRoute(): Promise<QuoteDocumentProps> {
  vi.resetModules();
  const { POST } = await import('./send-client-quote/route');

  const res = await POST(
    new Request('http://localhost:3000/api/send-client-quote', {
      method: 'POST',
      headers: { 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ requestId: REQUEST_ID }),
    })
  );

  expect(res.status).toBe(200);
  return renderToBuffer.mock.calls.at(-1)![0].props;
}

/** Los props con los que la ruta de descarga pidió renderizar el documento. */
async function propsFromDownloadRoute(): Promise<QuoteDocumentProps> {
  vi.resetModules();
  const { GET } = await import('./download-quote/route');

  const res = await GET(
    new Request(`http://localhost:3000/api/download-quote?quoteId=${REQUEST_ID}`)
  );

  expect(res.status).toBe(200);
  return renderToStream.mock.calls.at(-1)![0].props;
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', INTERNAL_SECRET);
  vi.stubEnv('NEXT_PUBLIC_CONVEX_SITE_URL', 'https://convex.example.site');
  vi.stubEnv('RESEND_API_KEY', 're_prueba');
  getAuth.mockResolvedValue({ userId: 'user_ana' });
  convex = stubInternalConvex();
  convex.reply(INTERNAL_PATHS.details, quoteDetails());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('el Quote Document de las dos rutas', () => {
  test('las dos rutas renderizan props idénticos para la misma Replacement Request', async () => {
    const desdeElCorreo = await propsFromEmailRoute();
    const desdeLaDescarga = await propsFromDownloadRoute();

    expect(desdeLaDescarga).toEqual(desdeElCorreo);
  });

  test('los props llevan los precios confirmados, los totales y el contacto de ZAMX', async () => {
    const props = await propsFromEmailRoute();

    expect(props).toMatchObject({
      requestId: REQUEST_ID,
      customerInfo: {
        companyName: 'Refrigeración del Norte',
        fullName: 'Ana Cliente',
        deliveryLocation: 'Monterrey',
      },
      contactName: 'Ventas ZAMX',
      contactEmail: 'cotizaciones@ziehl-abegg.com.mx',
    });

    // 3125 × 2 + 1200 × 1 = 7450, y la Delivery Estimate confirmada le gana a la
    // sugerida pieza por pieza.
    expect(props.subtotal).toBe(7450);
    expect(props.products).toEqual([
      expect.objectContaining({ partNumber: 'P-001', priceUSD: 3125, deliveryWeeksMin: 25 }),
      expect.objectContaining({ partNumber: 'P-002', priceUSD: 1200, deliveryWeeksMin: 12 }),
    ]);
  });

  /**
   * El idioma es parte del documento, así que también tiene que ser el mismo por
   * las dos rutas: si el adjunto del correo saliera en un idioma y la descarga
   * en otro, el Customer tendría dos versiones distintas del mismo folio.
   */
  test('el idioma del Customer viaja igual por las dos rutas, fechas incluidas', async () => {
    convex.reply(INTERNAL_PATHS.details, quoteDetails('en'));

    const desdeElCorreo = await propsFromEmailRoute();
    const desdeLaDescarga = await propsFromDownloadRoute();

    expect(desdeLaDescarga).toEqual(desdeElCorreo);
    expect(desdeElCorreo.language).toBe('en');
    // La fecha se formatea una sola vez, aquí, porque el documento lo genera el
    // servidor: `es-MX` la escribe día/mes y `en-US` mes/día, y el Customer
    // recibe la suya. Se compara contra el propio locale y no contra una cadena
    // escrita a mano, que dependería de la zona horaria de quien ejecute esto.
    const creado = new Date(Date.UTC(2026, 6, 30));
    expect(desdeElCorreo.date).toBe(creado.toLocaleDateString('en-US'));
    expect(desdeElCorreo.date).not.toBe(creado.toLocaleDateString('es-MX'));
  });

  test('el Customer que no eligió inglés recibe su documento en español', async () => {
    const props = await propsFromEmailRoute();

    expect(props.language).toBe('es');
    expect(props.date).toBe(new Date(Date.UTC(2026, 6, 30)).toLocaleDateString('es-MX'));
  });
});
