import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { INTERNAL_PATHS, stubInternalConvex } from '@/test/internal-convex';

/**
 * Ejemplo de referencia — Seam 2: la frontera del route handler.
 *
 * Convención de stubs, que los tickets posteriores siguen en lugar de inventar
 * la suya:
 *
 * 1. Se hace stub **en la frontera de la red** — el paquete que el handler
 *    importa (`resend`) o el propio `fetch` con el que llama a las funciones
 *    internas de Convex, nunca una función interna del handler. Las reglas del
 *    handler quedan intactas y son lo que se prueba. El renderizado de PDF y de
 *    email **no** se stubea: corre de verdad bajo jsdom, que es la razón de ser
 *    de este proyecto de vitest.
 * 2. Los dobles se declaran con `vi.hoisted`, porque `vi.mock` se eleva por
 *    encima de los `import` y no puede cerrar sobre variables normales.
 * 3. El handler se importa **dentro del test** (`await import(...)`), después de
 *    haber fijado el entorno. Estos módulos construyen el cliente de Convex al
 *    evaluarse, así que importarlos arriba congelaría el entorno equivocado.
 * 4. Se invoca como `POST(new Request(...))` y se afirma sobre lo que un
 *    llamador observa: el código de estado y el cuerpo de la respuesta.
 */

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

const INTERNAL_SECRET = 'secreto-de-prueba';

let convex: ReturnType<typeof stubInternalConvex>;

/** Importa el handler recién evaluado, con el entorno ya fijado. */
async function loadHandler() {
  vi.resetModules();
  const { POST } = await import('./route');
  return POST;
}

function request(headers: Record<string, string>, body: unknown = {}) {
  return new Request('http://localhost:3000/api/send-client-quote', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** Una Replacement Request completa, como la devuelve `getFullQuoteDetails`. */
function quoteDetails() {
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
      outcome: 'priced_differently',
    },
    user: {
      fullName: 'Ana Cliente',
      companyName: 'Refrigeración del Norte',
      email: 'ana@example.com',
    },
  };
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', INTERNAL_SECRET);
  vi.stubEnv('NEXT_PUBLIC_CONVEX_SITE_URL', 'https://convex.example.site');
  vi.stubEnv('RESEND_API_KEY', 're_prueba');
  convex = stubInternalConvex();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('POST /api/send-client-quote', () => {
  test('sin el header del secreto interno responde 401 y no toca Convex ni Resend', async () => {
    const POST = await loadHandler();

    const res = await POST(
      request({ 'content-type': 'application/json' }, { requestId: 'REQ-ABC' })
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ success: false, error: 'No autorizado' });
    expect(convex.calls).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('con un secreto interno equivocado responde 401', async () => {
    const POST = await loadHandler();

    const res = await POST(
      request({ 'x-internal-secret': 'secreto-equivocado' }, { requestId: 'REQ-ABC' })
    );

    expect(res.status).toBe(401);
    expect(convex.calls).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sin INTERNAL_API_SECRET configurado responde nombrando la variable, no 401', async () => {
    // Las dos causas se separan a propósito: el 2026-08-02 una variable ausente
    // en el despliegue se presentó como una denegación y costó una
    // investigación entera antes de encontrar la configuración.
    vi.stubEnv('INTERNAL_API_SECRET', '');
    const POST = await loadHandler();

    const res = await POST(
      request({ 'x-internal-secret': INTERNAL_SECRET }, { requestId: 'REQ-ABC' })
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('INTERNAL_API_SECRET'),
    });
    expect(convex.calls).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('con el secreto correcto pero sin requestId responde 400', async () => {
    const POST = await loadHandler();

    const res = await POST(request({ 'x-internal-secret': INTERNAL_SECRET }, {}));

    expect(res.status).toBe(400);
    expect(convex.calls).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('con el secreto correcto y una Replacement Request inexistente responde 404', async () => {
    const POST = await loadHandler();

    const res = await POST(
      request({ 'x-internal-secret': INTERNAL_SECRET }, { requestId: 'REQ-NO-EXISTE' })
    );

    expect(res.status).toBe(404);
    expect(convex.to(INTERNAL_PATHS.details)).toHaveLength(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // Este es el test que justifica el proyecto `jsdom`: el Quote Document y el
  // email del Customer se renderizan de verdad, sin stub.
  test('autorizado, renderiza el Quote Document y lo adjunta al email del Customer', async () => {
    convex.reply(INTERNAL_PATHS.details, quoteDetails());
    sendEmail.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    const POST = await loadHandler();

    const res = await POST(
      request({ 'x-internal-secret': INTERNAL_SECRET }, { requestId: 'REQ-V59X9B' })
    );

    expect(res.status).toBe(200);

    expect(sendEmail).toHaveBeenCalledOnce();
    const [enviado] = sendEmail.mock.calls[0];
    expect(enviado.to).toEqual(['ana@example.com']);
    expect(enviado.subject).toContain('REQ-V59X9B');
    expect(enviado.html).toContain('Ana Cliente');

    // El PDF se renderizó de verdad: un Buffer que empieza con la firma %PDF-.
    expect(enviado.attachments).toHaveLength(1);
    const [adjunto] = enviado.attachments;
    expect(adjunto.filename).toBe('Cotizacion_REQ-V59X9B.pdf');
    expect(adjunto.content.subarray(0, 5).toString()).toBe('%PDF-');

    // El Quote Document enviado se registra con su propia mutación interna.
    expect(convex.to(INTERNAL_PATHS.quoteDocumentSent)).toMatchObject([
      { body: { quoteId: 'quote_1' }, secret: INTERNAL_SECRET },
    ]);
    expect(convex.to(INTERNAL_PATHS.rejectionExplained)).toEqual([]);
  });

  test('sin Confirmed Price no se produce Quote Document ni se cotiza la pieza a cero', async () => {
    const detalles = quoteDetails();
    delete (detalles.quote.products[0] as { confirmedPriceUSD?: number }).confirmedPriceUSD;
    convex.reply(INTERNAL_PATHS.details, detalles);
    const POST = await loadHandler();

    const res = await POST(
      request({ 'x-internal-secret': INTERNAL_SECRET }, { requestId: 'REQ-V59X9B' })
    );

    expect(res.status).toBe(409);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(convex.to(INTERNAL_PATHS.quoteDocumentSent)).toEqual([]);
  });
});
