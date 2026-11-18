import { google } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { APICallError } from '@ai-sdk/provider';
import type { LanguageModelV3, LanguageModelV3CallOptions } from '@ai-sdk/provider';

/**
 * Gemini contesta primero; Groq contesta sólo cuando Gemini falla por algo que
 * el tiempo arregla (ADR-0003). Quien llama recibe un modelo de AI SDK como
 * cualquier otro y lo pasa como `model:`; toda la política vive aquí.
 *
 * - **Instancia nueva por petición.** La instancia recuerda si ya cayó, y eso es
 *   lo que hace que un turno del chat se quede en Groq: un paso de Gemini
 *   después de una tool call de Groq no traería la thought signature de Gemini
 *   y volvería con un 400. La petición siguiente estrena instancia y prueba
 *   Gemini otra vez.
 * - **Sólo antes del primer chunk.** Se captura lo que falla al abrir la llamada
 *   (`doGenerate`, o `doStream` antes de devolver su stream). Lo que falla dentro
 *   de un stream ya devuelto sale tal cual: reabrirlo en Groq podría ejecutar
 *   `submit_quote_request` dos veces.
 * - **Los reintentos son de aquí, no del SDK.** Gemini, ninguno; Groq, uno.
 *   Ningún `APICallError` sale de aquí reintentable, así que el reintento por
 *   defecto de `streamText`/`generateObject` no vuelve a llamar a nadie, y quien
 *   llama no tiene que acordarse de pasar `maxRetries: 0`.
 */

const GEMINI_MODEL_ID = 'gemini-3.5-flash-lite';
const GROQ_MODEL_ID = 'qwen/qwen3.8-27b';

type ProviderName = 'gemini' | 'groq';

const PROVIDER_NAMES: readonly ProviderName[] = ['gemini', 'groq'];
const DEFAULT_ORDER: readonly ProviderName[] = ['gemini', 'groq'];

/** Cuántas llamadas recibe cada proveedor antes de pasar al siguiente. */
const ATTEMPTS: Record<ProviderName, number> = { gemini: 1, groq: 2 };

/** La espera antes del reintento de Groq. */
const RETRY_DELAY_MS = 1000;

type Candidate = { name: ProviderName; model: LanguageModelV3 };

/**
 * `AI_PROVIDER_ORDER`, coma-separado. Lo inválido (un nombre desconocido, uno
 * repetido o una lista vacía) no tumba el chat por una errata: se registra y se
 * usa el orden por defecto. Sin valor, el orden por defecto en silencio.
 */
function providerOrder(raw: string | undefined): readonly ProviderName[] {
  if (raw === undefined || raw.trim() === '') return DEFAULT_ORDER;

  const names = raw.split(',').map((name) => name.trim().toLowerCase());
  const valid =
    names.every((name): name is ProviderName => PROVIDER_NAMES.includes(name as ProviderName)) &&
    new Set(names).size === names.length;

  if (!valid) {
    console.error(
      `AI_PROVIDER_ORDER inválido («${raw}»); se usa ${DEFAULT_ORDER.join(',')}. ` +
        `Valores admitidos: ${PROVIDER_NAMES.join(', ')}, separados por comas y sin repetir.`
    );
    return DEFAULT_ORDER;
  }
  return names as ProviderName[];
}

function groqKey(): string | undefined {
  const key = process.env.GROQ_API_KEY;
  return key === undefined || key.trim() === '' ? undefined : key;
}

function build(name: ProviderName, key: string | undefined): LanguageModelV3 {
  if (name === 'gemini') return google(GEMINI_MODEL_ID);
  return createGroq({ apiKey: key })(GROQ_MODEL_ID);
}

function candidates(): Candidate[] {
  const order = providerOrder(process.env.AI_PROVIDER_ORDER);
  const key = groqKey();

  // Sin clave, Groq sale del orden sin lanzar: un preview sin ella tiene que
  // seguir funcionando mientras Gemini funcione.
  let names = key === undefined ? order.filter((name) => name !== 'groq') : [...order];
  if (names.length === 0) {
    console.error(
      'AI_PROVIDER_ORDER sólo nombra a groq y falta GROQ_API_KEY; se usa gemini en su lugar.'
    );
    names = ['gemini'];
  }

  return names.map((name) => ({ name, model: build(name, key) }));
}

/**
 * Por qué se puede cambiar de proveedor, o `undefined` si no se puede. Sólo lo
 * que el tiempo arregla: 429, 5xx, timeout, red. Cualquier otro 4xx es un bug o
 * una petición rechazada, y otro proveedor fallaría igual o lo escondería.
 */
function switchReason(error: unknown): string | undefined {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    // Sin status: la petición no llegó a tener respuesta (fetch falló).
    if (status === undefined) return 'red';
    // 408 es el timeout dicho por el servidor.
    if (status === 408) return 'timeout';
    if (status === 429 || status >= 500) return String(status);
    return undefined;
  }
  if (error instanceof Error || error instanceof DOMException) {
    if (error.name === 'TimeoutError') return 'timeout';
    if (error instanceof TypeError) return 'red';
  }
  return undefined;
}

/**
 * El error tal cual, salvo que ya no es reintentable: el SDK reintenta todo
 * `APICallError` con `isRetryable` (incluidos 408 y 409, que no cambian de
 * proveedor), y eso volvería a llamar a Gemini.
 */
function asNonRetryable(error: unknown): unknown {
  if (!APICallError.isInstance(error) || !error.isRetryable) return error;
  return new APICallError({
    message: error.message,
    url: error.url,
    requestBodyValues: error.requestBodyValues,
    statusCode: error.statusCode,
    responseHeaders: error.responseHeaders,
    responseBody: error.responseBody,
    cause: error.cause,
    data: error.data,
    isRetryable: false,
  });
}

/** Groq con el razonamiento oculto: nada de él llega al transcript del Customer. */
function optionsFor(name: ProviderName, options: LanguageModelV3CallOptions) {
  if (name !== 'groq') return options;
  return {
    ...options,
    providerOptions: {
      ...options.providerOptions,
      groq: { ...options.providerOptions?.groq, reasoningFormat: 'hidden' },
    },
  };
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Un modelo nuevo con el orden configurado. Se llama una vez por petición del
 * chat, nunca se comparte entre peticiones. (El intérprete de respuestas del
 * Approver sigue en Gemini solo hasta que Groq pase `check:vocabulary`: ticket 04.)
 */
export function createFailoverModel(): LanguageModelV3 {
  const providers = candidates();
  const missingGroqKey = groqKey() === undefined;
  let current = 0;

  async function attempt<T>(
    options: LanguageModelV3CallOptions,
    call: (model: LanguageModelV3, options: LanguageModelV3CallOptions) => PromiseLike<T>
  ): Promise<T> {
    for (;;) {
      const { name, model } = providers[current];
      let reason: string | undefined;
      let lastError: unknown;

      for (let tries = 1; ; tries++) {
        try {
          return await call(model, optionsFor(name, options));
        } catch (error) {
          lastError = error;
          reason = switchReason(error);
          // Un abort de quien llama no se arregla en otro proveedor: su señal
          // también estaría abortada allí.
          if (reason === undefined || options.abortSignal?.aborted) throw asNonRetryable(error);
          if (tries >= ATTEMPTS[name]) break;
          await wait(RETRY_DELAY_MS, options.abortSignal);
        }
      }

      const next = providers[current + 1];
      if (next === undefined) {
        if (name === 'gemini') {
          console.error(
            `gemini falló (${reason}) y no hay respaldo` +
              (missingGroqKey ? ': falta GROQ_API_KEY.' : ' en AI_PROVIDER_ORDER.')
          );
        }
        throw asNonRetryable(lastError);
      }

      console.warn(`Failover del modelo: ${name} falló (${reason}); contesta ${next.name}.`);
      current += 1;
    }
  }

  return {
    specificationVersion: 'v3',
    provider: 'failover',
    modelId: providers[0].model.modelId,
    get supportedUrls() {
      return providers[current].model.supportedUrls;
    },
    doGenerate: (options) => attempt(options, (model, opts) => model.doGenerate(opts)),
    doStream: (options) => attempt(options, (model, opts) => model.doStream(opts)),
  };
}
