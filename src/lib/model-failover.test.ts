import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  generateObject,
  jsonSchema,
  NoObjectGeneratedError,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test';
import { APICallError } from '@ai-sdk/provider';
import { z } from 'zod';
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';

/**
 * Seam 1 — la política de failover vista por quien la usa.
 *
 * Se manejan el `streamText` y el `generateObject` de verdad, como en el chat y
 * en el intérprete, y se cortan los dos proveedores en la frontera de su
 * paquete. Lo que se afirma es lo que ve quien llama: qué proveedor contestó,
 * si un error salió a la superficie y cuántas veces se llamó a cada uno. Nunca
 * cómo está hecho el failover por dentro.
 */

const { providers, createGroq } = vi.hoisted(() => ({
  providers: { gemini: undefined as unknown, groq: undefined as unknown },
  createGroq: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({ google: () => providers.gemini }));
vi.mock('@ai-sdk/groq', () => ({ createGroq }));

type Mock = MockLanguageModelV3;

function usage() {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
}

function textStream(text: string): LanguageModelV3StreamResult {
  const chunks: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: text },
    { type: 'text-end', id: 't' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: usage() },
  ];
  return { stream: simulateReadableStream({ chunks }) };
}

function toolCallStream(toolName: string, input: object): LanguageModelV3StreamResult {
  const chunks: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId: 'call-1', toolName, input: JSON.stringify(input) },
    {
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      usage: usage(),
    },
  ];
  return { stream: simulateReadableStream({ chunks }) };
}

function objectResult(object: object): LanguageModelV3GenerateResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(object) }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: usage(),
    warnings: [],
  };
}

function apiError(statusCode: number | undefined, message = `HTTP ${statusCode}`) {
  return new APICallError({
    message,
    url: 'https://example.test',
    requestBodyValues: {},
    statusCode,
    // Como lo marca el SDK: 408, 409, 429 y 5xx son reintentables por defecto, y
    // un fallo de fetch (sin status) lo marca reintentable `postToApi`.
    ...(statusCode === undefined ? { isRetryable: true } : {}),
  });
}

function timeoutError() {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError');
}

/** Un proveedor que falla al abrir la llamada, cada vez. */
function failing(provider: string, error: unknown): Mock {
  return new MockLanguageModelV3({
    provider,
    doStream: async () => {
      throw error;
    },
    doGenerate: async () => {
      throw error;
    },
  });
}

function answering(provider: string, text: string): Mock {
  return new MockLanguageModelV3({
    provider,
    doStream: async () => textStream(text),
    doGenerate: async () => objectResult({ answer: text }),
  });
}

function install(gemini: Mock, groq: Mock) {
  providers.gemini = gemini;
  providers.groq = groq;
}

async function loadFactory() {
  vi.resetModules();
  const { createFailoverModel } = await import('./model-failover');
  return createFailoverModel;
}

/** Lo que el Customer vería: el texto, o el error que el stream entregó. */
async function streamOutcome(model: Parameters<typeof streamText>[0]['model']) {
  const errors: unknown[] = [];
  const result = streamText({
    model,
    prompt: 'hola',
    onError: ({ error }) => {
      errors.push(error);
    },
  });
  let text = '';
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') text += part.text;
  }
  return { text, errors };
}

const schema = jsonSchema<{ answer: string }>({
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
});

let warn: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('GROQ_API_KEY', 'gsk_test');
  vi.stubEnv('AI_PROVIDER_ORDER', '');
  createGroq.mockReset();
  createGroq.mockImplementation(() => () => providers.groq);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Gemini falla por algo que el tiempo arregla', () => {
  test.each([
    ['503', apiError(503)],
    ['429', apiError(429)],
    ['500', apiError(500)],
    ['408', apiError(408)],
    ['un timeout', timeoutError()],
    ['un error de red', apiError(undefined, 'fetch failed')],
    ['un TypeError de fetch', new TypeError('fetch failed')],
  ])('con %s contesta Groq', async (_, failure) => {
    const gemini = failing('google', failure);
    const groq = answering('groq', 'respuesta de Groq');
    install(gemini, groq);
    const createFailoverModel = await loadFactory();

    const { text, errors } = await streamOutcome(createFailoverModel());

    expect(text).toBe('respuesta de Groq');
    expect(errors).toEqual([]);
    expect(groq.doStreamCalls).toHaveLength(1);
  });

  test('generateObject también cae a Groq', async () => {
    install(failing('google', apiError(503)), answering('groq', 'de Groq'));
    const createFailoverModel = await loadFactory();

    const { object } = await generateObject({ model: createFailoverModel(), schema, prompt: 'x' });

    expect(object).toEqual({ answer: 'de Groq' });
  });

  test('el cambio deja un console.warn con quién falló, por qué y quién contestó', async () => {
    install(failing('google', apiError(503)), answering('groq', 'ok'));
    const createFailoverModel = await loadFactory();

    await streamOutcome(createFailoverModel());

    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0].join(' ');
    expect(line).toMatch(/gemini/);
    expect(line).toMatch(/503/);
    expect(line).toMatch(/groq/);
  });

  test('a Gemini no se le reintenta: una sola llamada antes de cambiar', async () => {
    const gemini = failing('google', apiError(503));
    install(gemini, answering('groq', 'ok'));
    const createFailoverModel = await loadFactory();

    await streamOutcome(createFailoverModel());

    expect(gemini.doStreamCalls).toHaveLength(1);
  });

  test('a Gemini no se le reintenta tampoco cuando no hay a quién cambiar', async () => {
    vi.stubEnv('AI_PROVIDER_ORDER', 'gemini');
    const gemini = failing('google', apiError(503));
    install(gemini, answering('groq', 'ok'));
    const createFailoverModel = await loadFactory();

    // Sin `maxRetries`: el reintento por defecto del SDK no debe tocar a Gemini.
    await expect(
      generateObject({ model: createFailoverModel(), schema, prompt: 'x' })
    ).rejects.toThrow();

    expect(gemini.doGenerateCalls).toHaveLength(1);
  });
});

describe('Gemini rechaza la petición misma', () => {
  test.each([400, 401, 403, 404])(
    'un %s sale a la superficie y Groq no se llama',
    async (status) => {
      const groq = answering('groq', 'no debería');
      install(failing('google', apiError(status)), groq);
      const createFailoverModel = await loadFactory();

      const { text, errors } = await streamOutcome(createFailoverModel());

      expect(text).toBe('');
      expect(errors).toHaveLength(1);
      expect((errors[0] as APICallError).statusCode).toBe(status);
      expect(groq.doStreamCalls).toHaveLength(0);
    }
  );

  test('un 409, que el SDK tendría por reintentable, sale sin volver a llamar a Gemini', async () => {
    const gemini = failing('google', apiError(409));
    const groq = answering('groq', 'no debería');
    install(gemini, groq);
    const createFailoverModel = await loadFactory();

    const failure = await generateObject({
      model: createFailoverModel(),
      schema,
      prompt: 'x',
    }).catch((e: unknown) => e);

    expect((failure as APICallError).statusCode).toBe(409);
    expect(gemini.doGenerateCalls).toHaveLength(1);
    expect(groq.doGenerateCalls).toHaveLength(0);
  });

  test('un error que no es de red tampoco cambia', async () => {
    const groq = answering('groq', 'no debería');
    install(failing('google', new Error('bug nuestro')), groq);
    const createFailoverModel = await loadFactory();

    await expect(
      generateObject({ model: createFailoverModel(), schema, prompt: 'x' })
    ).rejects.toThrow('bug nuestro');
    expect(groq.doGenerateCalls).toHaveLength(0);
  });
});

test('con Gemini sano, Groq no se llama', async () => {
  const gemini = answering('google', 'de Gemini');
  const groq = answering('groq', 'no debería');
  install(gemini, groq);
  const createFailoverModel = await loadFactory();

  const { text } = await streamOutcome(createFailoverModel());

  expect(text).toBe('de Gemini');
  expect(groq.doStreamCalls).toHaveLength(0);
  expect(warn).not.toHaveBeenCalled();
});

test('el modelo se presenta con el id de Gemini', async () => {
  install(answering('google', 'x'), answering('groq', 'y'));
  const gemini = providers.gemini as Mock;
  const createFailoverModel = await loadFactory();

  expect(createFailoverModel().modelId).toBe(gemini.modelId);
});

test('un error dentro de un stream ya abierto sale y Groq no se llama', async () => {
  const gemini = new MockLanguageModelV3({
    provider: 'google',
    doStream: async () => ({
      stream: simulateReadableStream<LanguageModelV3StreamPart>({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: 'medio ' },
          { type: 'error', error: apiError(503) },
        ],
      }),
    }),
  });
  const groq = answering('groq', 'no debería');
  install(gemini, groq);
  const createFailoverModel = await loadFactory();

  const { text, errors } = await streamOutcome(createFailoverModel());

  expect(text).toBe('medio ');
  expect(errors).toHaveLength(1);
  expect(groq.doStreamCalls).toHaveLength(0);
});

test('tras caer a Groq en el paso 1, el paso 2 también va a Groq', async () => {
  const gemini = new MockLanguageModelV3({
    provider: 'google',
    doStream: async () => {
      if (gemini.doStreamCalls.length === 1) throw apiError(503);
      return textStream('Gemini en el paso 2');
    },
  });
  const groq: Mock = new MockLanguageModelV3({
    provider: 'groq',
    doStream: async (): Promise<LanguageModelV3StreamResult> =>
      groq.doStreamCalls.length === 1
        ? toolCallStream('lookup', { q: 'x' })
        : textStream('Groq en el paso 2'),
  });
  install(gemini, groq);
  const createFailoverModel = await loadFactory();
  const execute = vi.fn(async () => ({ ok: true }));

  const result = streamText({
    model: createFailoverModel(),
    prompt: 'hola',
    tools: {
      lookup: tool({
        inputSchema: jsonSchema<{ q: string }>({
          type: 'object',
          properties: { q: { type: 'string' } },
          required: ['q'],
        }),
        execute,
      }),
    },
    stopWhen: stepCountIs(5),
  });

  expect(await result.text).toBe('Groq en el paso 2');
  expect(execute).toHaveBeenCalledTimes(1);
  expect(gemini.doStreamCalls).toHaveLength(1);
  expect(groq.doStreamCalls).toHaveLength(2);
});

test('una instancia nueva después de caer prueba Gemini primero', async () => {
  const gemini = new MockLanguageModelV3({
    provider: 'google',
    doStream: async () => {
      if (gemini.doStreamCalls.length === 1) throw apiError(503);
      return textStream('Gemini otra vez');
    },
  });
  install(gemini, answering('groq', 'Groq'));
  const createFailoverModel = await loadFactory();

  expect((await streamOutcome(createFailoverModel())).text).toBe('Groq');
  expect((await streamOutcome(createFailoverModel())).text).toBe('Gemini otra vez');
});

test('si fallan los dos, sale el último error y Groq tuvo un reintento', async () => {
  const groqError = apiError(502, 'Groq caído');
  const groq = failing('groq', groqError);
  install(failing('google', apiError(503)), groq);
  const createFailoverModel = await loadFactory();

  const failure = await generateObject({ model: createFailoverModel(), schema, prompt: 'x' }).catch(
    (e: unknown) => e
  );

  expect(failure).toBeInstanceOf(APICallError);
  expect((failure as APICallError).message).toBe('Groq caído');
  expect((failure as APICallError).statusCode).toBe(502);
  expect(groq.doGenerateCalls).toHaveLength(2);
});

test('Groq contesta con el razonamiento oculto', async () => {
  const groq = answering('groq', 'ok');
  install(failing('google', apiError(503)), groq);
  const createFailoverModel = await loadFactory();

  await streamOutcome(createFailoverModel());

  const [call] = groq.doStreamCalls as LanguageModelV3CallOptions[];
  expect(call.providerOptions?.groq).toMatchObject({ reasoningFormat: 'hidden' });
});

test('a Groq se le pide JSON sin esquema, y su respuesta se valida igual', async () => {
  // Con el esquema, Groq lo rechaza en modo estricto (dos propiedades
  // opcionales) y en el no estricto nunca llena `newDeliveryWeeks`. En modo
  // JSON acierta. La validación contra el esquema la sigue haciendo el SDK.
  const gemini = failing('google', apiError(503));
  const groq = new MockLanguageModelV3({
    provider: 'groq',
    doGenerate: async () => objectResult({ answer: 7 }),
  });
  install(gemini, groq);
  const createFailoverModel = await loadFactory();

  const failure = await generateObject({
    model: createFailoverModel(),
    // Zod, como el intérprete: `jsonSchema` a secas no valida nada.
    schema: z.object({ answer: z.string() }),
    prompt: 'x',
  }).catch((e: unknown) => e);

  const [groqCall] = groq.doGenerateCalls as LanguageModelV3CallOptions[];
  const [geminiCall] = gemini.doGenerateCalls as LanguageModelV3CallOptions[];
  expect(groqCall.responseFormat).toEqual({ type: 'json' });
  expect(geminiCall.responseFormat).toMatchObject({ type: 'json', schema: expect.any(Object) });
  expect(NoObjectGeneratedError.isInstance(failure)).toBe(true);
});

describe('una regla sólo para Groq', () => {
  /** El sistema que recibió un proveedor, tal cual. */
  function systemOf(model: Mock) {
    const [call] = model.doGenerateCalls as LanguageModelV3CallOptions[];
    return call.prompt.filter((m) => m.role === 'system').map((m) => m.content);
  }

  test('Groq la recibe al final de su prompt de sistema', async () => {
    const groq = answering('groq', 'Groq');
    install(failing('google', apiError(503)), groq);
    const createFailoverModel = await loadFactory();

    await generateObject({
      model: createFailoverModel({ groqRule: 'Regla de Groq.' }),
      schema,
      system: 'Sistema.',
      prompt: 'x',
    });

    expect(systemOf(groq)).toEqual(['Sistema.\n\nRegla de Groq.']);
  });

  test('Gemini recibe su prompt de sistema byte por byte', async () => {
    const gemini = answering('google', 'Gemini');
    install(gemini, answering('groq', 'Groq'));
    const createFailoverModel = await loadFactory();

    await generateObject({
      model: createFailoverModel({ groqRule: 'Regla de Groq.' }),
      schema,
      system: 'Sistema.',
      prompt: 'x',
    });

    expect(systemOf(gemini)).toEqual(['Sistema.']);
  });

  test('sin regla, Groq recibe el mismo sistema que Gemini (el chat)', async () => {
    const groq = answering('groq', 'Groq');
    install(failing('google', apiError(503)), groq);
    const createFailoverModel = await loadFactory();

    await generateObject({
      model: createFailoverModel(),
      schema,
      system: 'Sistema.',
      prompt: 'x',
    });

    expect(systemOf(groq)).toEqual(['Sistema.']);
  });
});

describe('AI_PROVIDER_ORDER', () => {
  test('sin valor, Gemini primero', async () => {
    const gemini = answering('google', 'Gemini');
    install(gemini, answering('groq', 'Groq'));
    const createFailoverModel = await loadFactory();

    expect((await streamOutcome(createFailoverModel())).text).toBe('Gemini');
  });

  test('`groq` sola: sólo Groq, y si falla no hay Gemini detrás', async () => {
    vi.stubEnv('AI_PROVIDER_ORDER', 'groq');
    const gemini = answering('google', 'Gemini');
    install(gemini, failing('groq', apiError(503)));
    const createFailoverModel = await loadFactory();

    const { errors } = await streamOutcome(createFailoverModel());

    expect(errors).toHaveLength(1);
    expect(gemini.doStreamCalls).toHaveLength(0);
  });

  test('`groq` sola contesta Groq', async () => {
    vi.stubEnv('AI_PROVIDER_ORDER', 'groq');
    const gemini = answering('google', 'Gemini');
    install(gemini, answering('groq', 'Groq'));
    const createFailoverModel = await loadFactory();

    expect((await streamOutcome(createFailoverModel())).text).toBe('Groq');
    expect(gemini.doStreamCalls).toHaveLength(0);
  });

  test('`groq,gemini`: Groq primero y Gemini de respaldo', async () => {
    vi.stubEnv('AI_PROVIDER_ORDER', ' groq , gemini ');
    install(answering('google', 'Gemini'), failing('groq', apiError(503)));
    const createFailoverModel = await loadFactory();

    expect((await streamOutcome(createFailoverModel())).text).toBe('Gemini');
  });

  test.each(['openai', 'gemini,openai', ',', 'gemini,gemini'])(
    'un valor inválido (%s) usa el orden por defecto y lo registra',
    async (value) => {
      vi.stubEnv('AI_PROVIDER_ORDER', value);
      const gemini = failing('google', apiError(503));
      install(gemini, answering('groq', 'Groq'));
      const createFailoverModel = await loadFactory();

      expect((await streamOutcome(createFailoverModel())).text).toBe('Groq');
      expect(gemini.doStreamCalls).toHaveLength(1);
      expect(consoleError.mock.calls.flat().join(' ')).toMatch(/AI_PROVIDER_ORDER/);
    }
  );
});

describe('sin GROQ_API_KEY', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', '');
  });

  test('construir no lanza y con Gemini sano todo sigue igual', async () => {
    install(answering('google', 'Gemini'), answering('groq', 'Groq'));
    const createFailoverModel = await loadFactory();

    expect((await streamOutcome(createFailoverModel())).text).toBe('Gemini');
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('un fallo de Gemini que cambiaría se registra nombrando la clave y sale tal cual', async () => {
    const geminiError = apiError(503, 'Gemini saturado');
    const groq = answering('groq', 'Groq');
    install(failing('google', geminiError), groq);
    const createFailoverModel = await loadFactory();

    const failure = await generateObject({
      model: createFailoverModel(),
      schema,
      prompt: 'x',
    }).catch((e: unknown) => e);

    expect((failure as APICallError).message).toBe('Gemini saturado');
    expect((failure as APICallError).statusCode).toBe(503);
    expect(groq.doGenerateCalls).toHaveLength(0);
    expect(consoleError.mock.calls.flat().join(' ')).toMatch(/GROQ_API_KEY/);
  });

  test('`groq` sola sin clave cae a Gemini y lo registra', async () => {
    vi.stubEnv('AI_PROVIDER_ORDER', 'groq');
    install(answering('google', 'Gemini'), answering('groq', 'Groq'));
    const createFailoverModel = await loadFactory();

    expect((await streamOutcome(createFailoverModel())).text).toBe('Gemini');
    expect(consoleError.mock.calls.flat().join(' ')).toMatch(/GROQ_API_KEY/);
  });
});
