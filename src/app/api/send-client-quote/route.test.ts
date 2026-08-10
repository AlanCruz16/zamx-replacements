import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { INTERNAL_PATHS, stubInternalConvex } from '@/test/internal-convex';
import { messagesFor, type Language } from '@/lib/messages';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/**
 * Una Replacement Request completa, como la devuelve `getFullQuoteDetails`.
 *
 * `preferredLanguage` viaja con el Customer porque el correo y su adjunto salen
 * en el idioma de él: quien lo genera es el servidor, sin navegador al que
 * preguntarle (ticket 20).
 */
function quoteDetails(preferredLanguage: Language = 'es') {
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
      preferredLanguage,
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
    // El asunto nombra la Replacement Request por su código y por nada más. El
    // `ZAMX-Q-` que lo prefijaba inventaba un segundo esquema de identificador y
    // se lo pegaba delante al primero, así que el Customer leía
    // `ZAMX-Q-REQ-V59X9B` en la bandeja y `REQ-V59X9B` dentro del PDF adjunto.
    expect(enviado.subject).toContain('REQ-V59X9B');
    expect(enviado.subject).not.toContain('ZAMX-Q-');
    expect(enviado.subject).toMatch(/(^|\s)REQ-V59X9B(\s|$)/);
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

  /**
   * El fallo que arregla el ticket 17, comprobado sobre el PDF de verdad y no
   * sobre los props. El logo se pasaba como `${baseUrl}/logo_final.png` con
   * `baseUrl` cayendo a `http://localhost:3000`, así que el renderizador salía a
   * la red: en la máquina de quien lo escribió el logo aparecía, y en cualquier
   * otra parte el documento salía sin él. Sin URL base configurado, el logo
   * tiene que seguir estando dentro del documento.
   */
  test('el Quote Document lleva el logo aunque no haya URL base configurado', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    convex.reply(INTERNAL_PATHS.details, quoteDetails());
    sendEmail.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    const POST = await loadHandler();

    const res = await POST(
      request({ 'x-internal-secret': INTERNAL_SECRET }, { requestId: 'REQ-V59X9B' })
    );

    expect(res.status).toBe(200);
    const [{ attachments }] = sendEmail.mock.calls[0];
    const pdf: Buffer = attachments[0].content;

    // El PDF declara un XObject de imagen con las dimensiones exactas del PNG.
    // Se leen del propio archivo, no se escriben aquí: así la afirmación sigue
    // valiendo cuando alguien cambie el logo, y falla si el documento se queda
    // sin él.
    const png = readFileSync(join(process.cwd(), 'public', 'logo_final.png'));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);

    const bytes = pdf.toString('latin1');
    expect(bytes).toContain('/Subtype /Image');
    expect(bytes).toContain(`/Width ${width}`);
    expect(bytes).toContain(`/Height ${height}`);
  });

  /**
   * El fallo del ticket 20 en el correo: el Customer con la cuenta en inglés
   * recibía asunto, cuerpo y adjunto en español. Los tres tienen que ir en el
   * mismo idioma, o el correo se lee a dos voces.
   */
  test('el Customer que eligió inglés recibe asunto, cuerpo y adjunto en inglés', async () => {
    convex.reply(INTERNAL_PATHS.details, quoteDetails('en'));
    sendEmail.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    const POST = await loadHandler();

    const res = await POST(
      request({ 'x-internal-secret': INTERNAL_SECRET }, { requestId: 'REQ-V59X9B' })
    );

    expect(res.status).toBe(200);
    const [enviado] = sendEmail.mock.calls[0];

    const en = messagesFor('en');
    expect(enviado.subject).toBe(en.clientQuoteEmail.subject('REQ-V59X9B'));
    expect(enviado.subject).not.toContain('cotización');
    expect(enviado.html).toContain(en.clientQuoteEmail.heading);
    expect(enviado.html).not.toContain(messagesFor('es').clientQuoteEmail.contents);

    // Hasta el nombre del archivo: el Customer lo ve en su bandeja y en su
    // carpeta de descargas.
    expect(enviado.attachments[0].filename).toBe('Quotation_REQ-V59X9B.pdf');
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

  test.each(['oem_restricted', 'discontinued', 'blocked_pending_info'] as const)(
    'con Outcome %s no se adjunta un Quote Document aunque haya precios',
    async (outcome) => {
      const detalles = quoteDetails();
      detalles.quote.outcome = outcome;
      convex.reply(INTERNAL_PATHS.details, detalles);
      const POST = await loadHandler();

      const res = await POST(
        request({ 'x-internal-secret': INTERNAL_SECRET }, { requestId: 'REQ-V59X9B' })
      );

      expect(res.status).toBe(409);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(convex.to(INTERNAL_PATHS.quoteDocumentSent)).toEqual([]);
    }
  );
});
