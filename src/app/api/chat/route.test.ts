import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * Seam 2 — el techo del chat visto desde la ruta.
 *
 * Se cortan en la frontera del módulo las tres cosas que salen de la máquina:
 * Clerk (quién llama), la frontera interna de Convex (la cuenta) y el modelo
 * (el gasto que se quiere acotar). Lo que se comprueba es que el rechazo llega
 * antes que el modelo y que se le puede leer al Customer, no la aritmética de
 * la ventana — eso ya está en `convex/lib/rate_limit.test.ts`.
 *
 * El doble del limitador cuenta de verdad por identidad, en vez de devolver un
 * booleano fijo: así la prueba del aislamiento entre Customers afirma sobre el
 * argumento con el que la ruta llama, que es lo único suyo que hay que creer.
 */

const { authMock, consumeChatRateLimit, persistChatTurn, streamText } = vi.hoisted(() => ({
  authMock: vi.fn(),
  consumeChatRateLimit: vi.fn(),
  persistChatTurn: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));

vi.mock('@/lib/internal-api', () => ({
  consumeChatRateLimit,
  persistChatTurn,
  createReplacementRequest: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn() };
  },
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText };
});

const LIMIT = 3;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * Un limitador con la misma forma que el de Convex: ventana fija por identidad,
 * con un reloj que la prueba puede adelantar. Cuenta de verdad en vez de
 * devolver un booleano fijo, para que la prueba del aislamiento entre Customers
 * afirme sobre el argumento con el que la ruta llama.
 */
function limitadorPorIdentidad(clock: { now: number }) {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return vi.fn(async (clerkId: string) => {
    const existing = windows.get(clerkId);
    const window =
      existing === undefined || clock.now - existing.startedAt >= WINDOW_MS
        ? { startedAt: clock.now, count: 0 }
        : existing;

    if (window.count >= LIMIT) {
      return { allowed: false as const, retryAfterMs: window.startedAt + WINDOW_MS - clock.now };
    }

    windows.set(clerkId, { startedAt: window.startedAt, count: window.count + 1 });
    return { allowed: true as const };
  });
}

async function loadHandler() {
  vi.resetModules();
  const { POST } = await import('./route');
  return POST;
}

function request(language = 'es', messages: unknown[] = HOLA) {
  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, data: { userName: 'Ana', language } }),
  });
}

const HOLA = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hola' }] }];

/** El turno en el que `submit_quote_request` ya devolvió una Replacement Request. */
const YA_ENVIADO = [
  ...HOLA,
  {
    id: 'm2',
    role: 'assistant',
    parts: [
      {
        type: 'tool-submit_quote_request',
        toolCallId: 'call_1',
        state: 'output-available',
        input: { products: [{ partNumber: '162562' }] },
        output: { success: true, quoteId: 'k17abc', requestId: 'REQ-ABC123' },
      },
    ],
  },
];

/**
 * Deja que la prueba dispare el `onFinish` con el que el AI SDK entrega el
 * transcript terminado, que es el momento en el que la ruta guarda.
 */
function capturarFinDelStream() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let options: any;
  streamText.mockReturnValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toUIMessageStreamResponse: (opts: any) => {
      options = opts;
      return new Response('ok', { status: 200 });
    },
  });

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async terminar(messages: any[]) {
      await options.onFinish({ messages, isContinuation: false, isAborted: false });
    },
    get originalMessages() {
      return options?.originalMessages;
    },
  };
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', 'secreto-de-prueba');
  vi.stubEnv('NEXT_PUBLIC_CONVEX_SITE_URL', 'https://example.convex.site');
  vi.stubEnv('RESEND_API_KEY', 're_prueba');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'clave-de-prueba');
  authMock.mockResolvedValue({ userId: 'user_ana' });
  streamText.mockReturnValue({
    toUIMessageStreamResponse: () => new Response('ok', { status: 200 }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/chat', () => {
  test('sin sesión de Clerk responde 401 y no gasta cupo ni modelo', async () => {
    authMock.mockResolvedValue({ userId: null });
    const POST = await loadHandler();

    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(consumeChatRateLimit).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  test('las peticiones dentro de la ventana pasan y la siguiente se rechaza', async () => {
    consumeChatRateLimit.mockImplementation(limitadorPorIdentidad({ now: 0 }));
    const POST = await loadHandler();

    for (let i = 0; i < LIMIT; i++) {
      expect((await POST(request())).status).toBe(200);
    }

    const res = await POST(request());

    expect(res.status).toBe(429);
    // El rechazo llega antes que el modelo: es la razón entera del techo.
    expect(streamText).toHaveBeenCalledTimes(LIMIT);
  });

  test('vencida la ventana, el Customer recupera el chat', async () => {
    const clock = { now: 0 };
    consumeChatRateLimit.mockImplementation(limitadorPorIdentidad(clock));
    const POST = await loadHandler();

    for (let i = 0; i < LIMIT; i++) await POST(request());
    expect((await POST(request())).status).toBe(429);

    clock.now += WINDOW_MS;

    // El techo es un tope de gasto, no una expulsión: pasada la hora, el mismo
    // Customer vuelve a poder cotizar.
    expect((await POST(request())).status).toBe(200);
  });

  test('el rechazo se le puede leer al Customer, en su idioma y con cuándo volver', async () => {
    consumeChatRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 30 * 60 * 1000 });
    const POST = await loadHandler();

    // `DefaultChatTransport` convierte el cuerpo en el `message` del error que
    // recibe `useChat`, así que esto es literalmente lo que ve el Customer.
    const es = await POST(request('es'));
    const textoEs = await es.text();
    expect(textoEs).toContain('demasiados mensajes');
    expect(textoEs).toContain('30 minutos');
    expect(es.headers.get('Retry-After')).toBe(String(30 * 60));

    const en = await POST(request('en'));
    expect(await en.text()).toContain('too many messages');
  });

  test('el cupo de un Customer no lo gasta otro', async () => {
    const limitador = limitadorPorIdentidad({ now: 0 });
    consumeChatRateLimit.mockImplementation(limitador);
    const POST = await loadHandler();

    authMock.mockResolvedValue({ userId: 'user_ana' });
    for (let i = 0; i < LIMIT + 1; i++) await POST(request());

    authMock.mockResolvedValue({ userId: 'user_beto' });
    const res = await POST(request());

    expect(res.status).toBe(200);
    // La identidad con la que se cuenta es la de Clerk, no nada que venga en el
    // cuerpo: un cuerpo lo escribe quien llama.
    expect(limitador).toHaveBeenLastCalledWith('user_beto');
  });

  /**
   * Ticket 21 — la conversación se guarda desde el servidor, al acabar el
   * stream. Es el servidor y no el navegador porque quien sabe qué dijo el
   * modelo y si la herramienta disparó de verdad es él; que el navegador lo
   * reportara sería fiarse de que lo reporte.
   */
  describe('la conversación se guarda al terminar el turno', () => {
    test('guarda el transcript entero contra la identidad de Clerk', async () => {
      consumeChatRateLimit.mockResolvedValue({ allowed: true });
      const stream = capturarFinDelStream();
      const POST = await loadHandler();

      await POST(request());
      const terminado = [
        ...HOLA,
        { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: '¿Número de parte?' }] },
      ];
      await stream.terminar(terminado);

      expect(persistChatTurn).toHaveBeenCalledWith({
        // La identidad es la de Clerk, no nada que venga en el cuerpo.
        clerkId: 'user_ana',
        messages: [
          { messageId: 'm1', role: 'user', parts: HOLA[0].parts },
          { messageId: 'm2', role: 'assistant', parts: terminado[1].parts },
        ],
      });
    });

    test('las tool parts se guardan enteras, sin aplanar a texto', async () => {
      consumeChatRateLimit.mockResolvedValue({ allowed: true });
      const stream = capturarFinDelStream();
      const POST = await loadHandler();

      await POST(request());
      await stream.terminar(YA_ENVIADO);

      const { messages } = persistChatTurn.mock.calls[0][0];
      expect(messages[1].parts).toEqual(YA_ENVIADO[1].parts);
    });

    /**
     * El SDK sólo asigna `id` al mensaje de respuesta cuando se le pasan los
     * mensajes originales. Sin `id` no hay forma de reconciliar el turno
     * siguiente contra lo guardado, y cada reenvío dejaría copias.
     */
    test('le pasa al SDK los mensajes originales, para que la respuesta traiga id', async () => {
      consumeChatRateLimit.mockResolvedValue({ allowed: true });
      const stream = capturarFinDelStream();
      const POST = await loadHandler();

      await POST(request());

      expect(stream.originalMessages).toEqual(HOLA);
    });

    /**
     * El stream ya se le entregó al Customer cuando esto corre: no hay respuesta
     * que cambiar. Perder el transcript es malo, pero reventar aquí le rompería
     * al Customer un chat que sí funcionó.
     */
    test('si no se puede guardar, el chat no se rompe', async () => {
      consumeChatRateLimit.mockResolvedValue({ allowed: true });
      persistChatTurn.mockRejectedValue(new Error('Convex no responde'));
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const stream = capturarFinDelStream();
      const POST = await loadHandler();

      const res = await POST(request());
      await expect(stream.terminar(HOLA)).resolves.toBeUndefined();

      expect(res.status).toBe(200);
      expect(error).toHaveBeenCalled();
    });
  });

  /**
   * Ticket 21 — una conversación que ya produjo una Replacement Request es de
   * solo lectura. Convex deja de servirla al reanudar, y aquí se rechaza el
   * transcript que la reenvía: sin esto, un cliente que se guardara la
   * conversación podría hacer que `submit_quote_request` disparase otra vez por
   * las mismas piezas.
   */
  describe('una conversación ya enviada no puede seguir', () => {
    test('reenviarla se rechaza antes de llamar al modelo', async () => {
      consumeChatRateLimit.mockResolvedValue({ allowed: true });
      const POST = await loadHandler();

      const res = await POST(request('es', YA_ENVIADO));

      expect(res.status).toBe(409);
      expect(streamText).not.toHaveBeenCalled();
      expect(persistChatTurn).not.toHaveBeenCalled();
    });

    test('lo que se le dice al Customer es una frase suya, en su idioma', async () => {
      consumeChatRateLimit.mockResolvedValue({ allowed: true });
      const POST = await loadHandler();

      expect(await (await POST(request('es', YA_ENVIADO))).text()).toContain(
        'Esta conversación ya terminó'
      );
      expect(await (await POST(request('en', YA_ENVIADO))).text()).toContain(
        'This conversation is already complete'
      );
    });

    test('un envío que falló no cierra nada: el Customer puede reintentar', async () => {
      consumeChatRateLimit.mockResolvedValue({ allowed: true });
      const POST = await loadHandler();

      const fallido = [
        ...HOLA,
        {
          id: 'm2',
          role: 'assistant',
          parts: [
            {
              type: 'tool-submit_quote_request',
              toolCallId: 'call_1',
              state: 'output-available',
              input: {},
              output: { success: false, message: 'Hubo un error.' },
            },
          ],
        },
      ];

      expect((await POST(request('es', fallido))).status).toBe(200);
    });
  });

  test('si no se puede contar, no se llama al modelo', async () => {
    // Fallar abierto dejaría el techo en nada justo cuando nadie está mirando.
    consumeChatRateLimit.mockRejectedValue(new Error('Convex no responde'));
    const POST = await loadHandler();

    const res = await POST(request());

    expect(res.status).toBe(503);
    expect(streamText).not.toHaveBeenCalled();
  });
});
