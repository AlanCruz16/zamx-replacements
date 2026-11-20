import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { findSubmission, toTranscriptMessages } from '../../../../convex/lib/chat';

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

const {
  authMock,
  consumeChatRateLimit,
  persistChatTurn,
  continuesSubmittedConversation,
  streamText,
  createReplacementRequest,
  sendEmail,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  consumeChatRateLimit: vi.fn(),
  persistChatTurn: vi.fn(),
  continuesSubmittedConversation: vi.fn(),
  streamText: vi.fn(),
  createReplacementRequest: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));

vi.mock('@/lib/internal-api', () => ({
  consumeChatRateLimit,
  persistChatTurn,
  continuesSubmittedConversation,
  createReplacementRequest,
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendEmail };
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
  };
}

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', 'secreto-de-prueba');
  vi.stubEnv('NEXT_PUBLIC_CONVEX_SITE_URL', 'https://example.convex.site');
  vi.stubEnv('RESEND_API_KEY', 're_prueba');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'clave-de-prueba');
  authMock.mockResolvedValue({ userId: 'user_ana' });
  continuesSubmittedConversation.mockResolvedValue(false);
  streamText.mockReturnValue({
    toUIMessageStreamResponse: () => new Response('ok', { status: 200 }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  // Los `vi.spyOn(console, …)` de cada prueba: sin esto, una prueba que silencia
  // la consola la deja silenciada para las que vienen detrás.
  vi.restoreAllMocks();
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
     * La respuesta del modelo se guarda con su propio turno. Antes llegaba a
     * `onFinish` con `id: ""` —el SDK sólo le pone `id` cuando se le da con qué
     * generarlo— y `toStoredMessages` la descartaba: se guardaba un turno más
     * tarde, cuando el navegador la reenviaba. El último turno, el del folio, no
     * tiene «un turno más tarde», y al recargar la conversación volvía abierta.
     *
     * Se maneja el `streamText` de verdad, con el modelo cortado en su
     * frontera, porque lo que falla es el contrato con el SDK y un doble de
     * `toUIMessageStreamResponse` no lo puede ver.
     */
    describe('con el SDK de verdad', () => {
      const USO = {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      };

      function texto(t: string): LanguageModelV3StreamPart[] {
        return [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: t },
          { type: 'text-end', id: 't' },
          { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: USO },
        ];
      }

      function llamada(toolName: string, input: object): LanguageModelV3StreamPart[] {
        return [
          { type: 'stream-start', warnings: [] },
          { type: 'tool-call', toolCallId: 'call_1', toolName, input: JSON.stringify(input) },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage: USO,
          },
        ];
      }

      /** Un modelo que contesta, paso a paso, lo que se le da. */
      function modeloQueContesta(...pasos: LanguageModelV3StreamPart[][]) {
        let paso = 0;
        return new MockLanguageModelV3({
          doStream: async () => ({
            stream: simulateReadableStream({ chunks: pasos[Math.min(paso++, pasos.length - 1)] }),
          }),
        });
      }

      async function turnoCompleto(
        modelo = modeloQueContesta(texto('¿Número de parte?')),
        messages: unknown[] = HOLA
      ) {
        const actual = await vi.importActual<typeof import('ai')>('ai');
        streamText.mockImplementation((opts) => actual.streamText({ ...opts, model: modelo }));
        consumeChatRateLimit.mockResolvedValue({ allowed: true });
        const POST = await loadHandler();

        const res = await POST(request('es', messages));
        // Leer el stream entero es lo que hace el navegador, y lo que dispara
        // el `onFinish` en el que la ruta guarda.
        const cuerpo = await res.text();
        await vi.waitFor(() => expect(persistChatTurn).toHaveBeenCalled());

        const inicio = cuerpo
          .split('\n')
          .filter((l) => l.startsWith('data: {'))
          .map((l) => JSON.parse(l.slice('data: '.length)))
          .find((chunk) => chunk.type === 'start');

        return { guardados: persistChatTurn.mock.lastCall![0].messages, inicio };
      }

      test('la respuesta del modelo se guarda en el mismo turno, con id', async () => {
        const { guardados } = await turnoCompleto();

        expect(guardados).toHaveLength(2);
        expect(guardados[1]).toMatchObject({
          role: 'assistant',
          messageId: expect.stringMatching(/.+/),
          parts: expect.arrayContaining([
            expect.objectContaining({ type: 'text', text: '¿Número de parte?' }),
          ]),
        });
      });

      /**
       * El turno siguiente el navegador reenvía esta respuesta con el `id` que
       * le dio `useChat`, y Convex reescribe la fila con ese `id` en vez de
       * añadir otra. Eso sólo funciona si el `id` que viaja al navegador es el
       * mismo que se guardó.
       */
      test('el id guardado es el mismo que recibe el navegador', async () => {
        const { guardados, inicio } = await turnoCompleto();

        expect(inicio?.messageId).toBe(guardados[1].messageId);
      });

      /**
       * El caso por el que existe todo esto: el turno que envía. Lo guardado
       * tiene que cerrar la conversación por sí solo, porque al recargar es lo
       * único que el navegador tiene para reenviar, y la ruta decide el 409
       * sobre lo que el navegador reenvía.
       */
      test('el turno que envía se guarda, y lo guardado cierra la conversación', async () => {
        createReplacementRequest.mockResolvedValue({
          quoteId: 'quote_1',
          requestId: 'REQ-ABC123',
          products: [],
          customer: { fullName: 'Ana', companyName: 'ACME', email: 'ana@example.com' },
          subtotalUSD: 0,
          taxUSD: 0,
          totalUSD: 0,
        });
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const modelo = modeloQueContesta(
          llamada('submit_quote_request', {
            products: [
              { partNumber: '162562', model: 'GR45C', quantity: 1, deliveryLocation: 'Monterrey' },
            ],
          }),
          texto('Gracias, que tenga buen día.')
        );

        const { guardados } = await turnoCompleto(modelo);
        const envio = findSubmission(toTranscriptMessages(guardados));

        expect(envio).toEqual({ quoteId: 'quote_1', messageId: guardados[1].messageId });

        // Recargar y seguir escribiendo: el navegador reenvía lo guardado más
        // un mensaje nuevo, y eso no llega al modelo.
        streamText.mockClear();
        const POST = await loadHandler();
        const res = await POST(
          request('es', [
            ...toTranscriptMessages(guardados),
            { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'y también otro' }] },
          ])
        );

        expect(res.status).toBe(409);
        expect(streamText).not.toHaveBeenCalled();
        expect(createReplacementRequest).toHaveBeenCalledTimes(1);
      });

      test('cada respuesta estrena id', async () => {
        const primero = await turnoCompleto();
        const segundo = await turnoCompleto();

        expect(primero.guardados[1].messageId).not.toBe(segundo.guardados[1].messageId);
      });
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

    /**
     * Ticket 02: la copia del navegador puede no traer el envío —una pestaña
     * que no lo vio, un cuerpo editado, una recarga temprana—, así que la ruta
     * le pregunta también a Convex por lo guardado.
     */
    describe('aunque el transcript no traiga el envío', () => {
      test('si continúa una conversación enviada se rechaza igual, sin modelo', async () => {
        consumeChatRateLimit.mockResolvedValue({ allowed: true });
        continuesSubmittedConversation.mockResolvedValue(true);
        const POST = await loadHandler();

        const res = await POST(request('es', HOLA));

        expect(res.status).toBe(409);
        expect(await res.text()).toContain('Esta conversación ya terminó');
        expect(streamText).not.toHaveBeenCalled();
        expect(persistChatTurn).not.toHaveBeenCalled();
        expect(createReplacementRequest).not.toHaveBeenCalled();
      });

      /** La identidad sale de Clerk; lo que manda el navegador no la cambia. */
      test('pregunta por los ids del transcript, con la identidad de Clerk', async () => {
        consumeChatRateLimit.mockResolvedValue({ allowed: true });
        const POST = await loadHandler();

        await POST(
          new Request('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              messages: [
                ...HOLA,
                { id: 'm2', role: 'user', parts: [{ type: 'text', text: 'y' }] },
                { role: 'user', parts: [{ type: 'text', text: 'sin id' }] },
              ],
              data: { userName: 'Ana', language: 'es', clerkId: 'user_beto' },
              clerkId: 'user_beto',
            }),
          })
        );

        expect(continuesSubmittedConversation).toHaveBeenCalledWith('user_ana', ['m1', 'm2']);
      });

      test('un transcript con el envío dentro se rechaza sin preguntar a Convex', async () => {
        consumeChatRateLimit.mockResolvedValue({ allowed: true });
        const POST = await loadHandler();

        expect((await POST(request('es', YA_ENVIADO))).status).toBe(409);
        expect(continuesSubmittedConversation).not.toHaveBeenCalled();
      });

      test('si Convex no puede contestar, responde 503 y no llama al modelo', async () => {
        consumeChatRateLimit.mockResolvedValue({ allowed: true });
        continuesSubmittedConversation.mockRejectedValue(new Error('Convex no responde'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const POST = await loadHandler();

        const res = await POST(request());

        expect(res.status).toBe(503);
        expect(streamText).not.toHaveBeenCalled();
      });
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

  test('el chat habla con gemini-3.5-flash-lite', async () => {
    // ADR-0003: el modelo es una decisión, y la pasada manual sólo vale para él.
    consumeChatRateLimit.mockResolvedValue({ allowed: true });
    const POST = await loadHandler();
    await POST(request());

    const [{ model }] = streamText.mock.calls[0];
    expect(model.modelId).toBe('gemini-3.5-flash-lite');
  });

  test('cada petición estrena modelo, para que un turno caído a Groq no arrastre al siguiente', async () => {
    // ADR-0003: el failover se queda en Groq dentro de un turno; el mensaje
    // siguiente tiene que volver a probar Gemini, y eso sólo pasa con otra instancia.
    consumeChatRateLimit.mockResolvedValue({ allowed: true });
    const POST = await loadHandler();
    await POST(request());
    await POST(request());

    const [[first], [second]] = streamText.mock.calls;
    expect(first.model).not.toBe(second.model);
  });

  describe('el aviso al Approver de una Request nueva', () => {
    async function enviarSolicitud() {
      consumeChatRateLimit.mockResolvedValue({ allowed: true });
      createReplacementRequest.mockResolvedValue({
        quoteId: 'quote_1',
        requestId: 'REQ-ABC123',
        products: [],
        customer: { fullName: 'Ana', companyName: 'ACME', email: 'ana@example.com' },
        subtotalUSD: 0,
        taxUSD: 0,
        totalUSD: 0,
      });
      const POST = await loadHandler();
      await POST(request());

      const [{ tools }] = streamText.mock.calls[0];
      return tools.submit_quote_request.execute(
        {
          products: [
            { partNumber: 'P-001', model: 'MK137', quantity: 1, deliveryLocation: 'Monterrey' },
          ],
        },
        { toolCallId: 't1', messages: [] }
      );
    }

    test('un rechazo de Resend se registra como error, no como enviado', async () => {
      // Resend no lanza: devuelve `{ error }`. Leerlo como éxito dejaba la
      // Request esperando a un Approver que nunca se enteró.
      vi.stubEnv('ADMIN_EMAIL', 'ventas@example.com');
      sendEmail.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});

      const resultado = await enviarSolicitud();

      expect(resultado).toMatchObject({ success: true, requestId: 'REQ-ABC123' });
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('REQ-ABC123'),
        expect.objectContaining({ message: expect.stringContaining('domain not verified') })
      );
      expect(log).not.toHaveBeenCalledWith('Email sent successfully via Resend');
    });

    test('sin ADMIN_EMAIL no se manda a nadie y se dice por qué', async () => {
      vi.stubEnv('ADMIN_EMAIL', '');
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await enviarSolicitud();

      expect(sendEmail).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: expect.stringContaining('ADMIN_EMAIL') })
      );
    });
  });
});
