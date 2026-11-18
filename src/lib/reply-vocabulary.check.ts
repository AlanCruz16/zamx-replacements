import { describe, expect, test } from 'vitest';
import { CONFIDENCE_THRESHOLD } from '../../convex/lib/reply_verdict';
import {
  interpretApproverReply,
  interpreterFailoverModel,
  type ReplacementRequestContext,
} from './gemini-parser';
import { GEMINI_MODEL_ID, GROQ_MODEL_ID } from './model-failover';
import { REPLY_VOCABULARY, type ReplyVocabularyEntry } from './reply-vocabulary';

/**
 * ¿Entiende el intérprete las palabras que le decimos al Approver que escriba?
 *
 * Esa pregunta no es una regla —las reglas viven en `reply_verdict.ts` y se
 * prueban sin red— sino una propiedad del prompt frente al modelo de verdad, y
 * la única forma de contestarla es preguntándoselo. Por eso esto no está en la
 * suite por defecto: es lento, cuesta dinero y necesita red. La prueba rápida
 * que sí corre en CI (`reply-vocabulary.test.tsx`) comprueba que las dos mitades
 * declaran el mismo vocabulario; ésta comprueba que el modelo lo obedece.
 *
 * El mismo juego se corre una vez por proveedor, forzando `AI_PROVIDER_ORDER`
 * a cada uno, porque cada modelo tiene que entender el vocabulario por su
 * cuenta: Groq no interpreta respuestas hasta pasarlo (ADR-0003, «Gates»).
 * Cada prueba lleva el proveedor en el nombre, así que un fallo dice cuál.
 *
 * Córrela cuando cambie el prompt, el esquema o el correo al Approver, o el
 * modelo de cualquiera de los dos proveedores:
 *
 *     npm run check:vocabulary              # los dos, Gemini primero
 *     npm run check:vocabulary -- -t groq   # uno solo
 *
 * Necesita `GOOGLE_GENERATIVE_AI_API_KEY` y `GROQ_API_KEY` en `.env.local`.
 */

const REQUEST: ReplacementRequestContext = {
  products: [
    {
      partNumber: '116175/A01',
      model: 'GR45C-ZID.GQ.CR',
      quantity: 3,
      suggestedPriceUSD: 2296.49,
      suggestedDeliveryWeeksMin: 25,
      suggestedDeliveryWeeksMax: 30,
    },
  ],
};

/** Corridas por cuerpo. Con `temperature: 0` deberían coincidir; si no, es el hallazgo. */
const RUNS = 2;

/**
 * Cada proveedor con el modelo que se espera medir y el espacio entre llamadas
 * que admite su plan gratuito. Sin espaciarlas, lo que falla es la cuota y no
 * se llega a saber nada de la clasificación.
 *
 * - **Gemini**: 15 peticiones por minuto; una cada 4,5 s.
 * - **Groq**: dos límites, y el que aprieta es el segundo. 8.000 tokens por
 *   minuto en total, pero sólo **1.000 de salida por minuto**, y el
 *   razonamiento oculto cuenta como salida. Groq reserva por petición lo que
 *   calcula que va a generar (se le vieron 539, y una vez 1.840, más que el
 *   límite entero: esa petición se rechaza por mucho que se espere). Una cada
 *   30 s deja pasar casi todas; con 9 s, dos de dieciséis pruebas fallaron por
 *   cuota (2026-11-18). La cuota es de la organización: compártela con el
 *   respaldo de producción sólo fuera de una caída.
 *
 * Son unas treinta llamadas por proveedor: unos tres minutos con Gemini y
 * unos quince con Groq.
 */
const PROVIDERS = [
  { name: 'gemini', modelId: GEMINI_MODEL_ID, minIntervalMs: 4_500 },
  { name: 'groq', modelId: GROQ_MODEL_ID, minIntervalMs: 30_000 },
] as const;

type Provider = (typeof PROVIDERS)[number];

/** Una cola por proveedor: las llamadas salen de una en una, espaciadas. */
function throttler(minIntervalMs: number) {
  let queue: Promise<unknown> = Promise.resolve();
  const pause = () => new Promise((resolve) => setTimeout(resolve, minIntervalMs));

  return function throttled<T>(call: () => Promise<T>): Promise<T> {
    const turn = queue.then(() => call());
    queue = turn.then(pause, pause);
    return turn;
  };
}

/**
 * El modelo de failover con el orden forzado a un solo proveedor, como lo
 * forzaría el owner con la variable. Sin `GROQ_API_KEY`, el failover cambia
 * `groq` por `gemini` sin lanzar; aquí eso mediría a Gemini dos veces y lo
 * llamaría Groq, así que se comprueba qué modelo quedó.
 */
function modelFor(provider: Provider) {
  const previous = process.env.AI_PROVIDER_ORDER;
  process.env.AI_PROVIDER_ORDER = provider.name;
  try {
    const model = interpreterFailoverModel();
    if (model.modelId !== provider.modelId) {
      throw new Error(
        `Se pidió ${provider.name} (${provider.modelId}) y el failover dio ${model.modelId}. ` +
          (provider.name === 'groq' ? '¿Falta GROQ_API_KEY en .env.local?' : '')
      );
    }
    return model;
  } finally {
    if (previous === undefined) delete process.env.AI_PROVIDER_ORDER;
    else process.env.AI_PROVIDER_ORDER = previous;
  }
}

/**
 * De cada entrada del vocabulario a los correos que un Approver mandaría con
 * ella: pelados, que es el caso que se rompió.
 *
 * Dos entradas no se prueban con la cadena tal cual. `blocked_pending_info`
 * enseña un prefijo —«Falta info:»— que sin lo que sigue no dice nada, y
 * `priced_differently` es una forma antes que una palabra, así que además de la
 * línea de plazo se prueba la de precio, que es la otra mitad de esa forma.
 */
function bodiesFor(entry: ReplyVocabularyEntry): string[] {
  const words = [...entry.taught, ...entry.alsoAccepted];

  switch (entry.outcome) {
    case 'blocked_pending_info':
      return words.map((word) => `${word} mándame la foto de la placa del motor`);
    case 'priced_differently':
      return [...words, '116175/A01: $2,500.00 USD'];
    default:
      return words;
  }
}

for (const provider of PROVIDERS) {
  describe(provider.name, () => {
    const throttled = throttler(provider.minIntervalMs);
    /** Un modelo nuevo por interpretación, como en producción. */
    const interpret = (body: string) => interpretApproverReply(REQUEST, body, modelFor(provider));

    describe('el modelo obedece el vocabulario que el correo enseña', () => {
      for (const entry of REPLY_VOCABULARY) {
        for (const body of bodiesFor(entry)) {
          test(`«${body}» => ${entry.outcome}`, async () => {
            const results = await Promise.all(
              Array.from({ length: RUNS }, () => throttled(() => interpret(body)))
            );

            for (const result of results) {
              expect({
                classification: result.classification,
                applicable: result.confidence >= CONFIDENCE_THRESHOLD,
              }).toEqual({ classification: entry.outcome, applicable: true });
            }
          }, 120_000);
        }
      }
    });

    describe('lo que separa un cambio de precio de una aprobación', () => {
      // La línea que el correo enseña para cambiar el plazo empieza por «Mismos
      // precios», y con eso solo en el prompt el modelo daba "priced_differently"
      // con 0.95 a un mensaje que no cambiaba nada — una aprobación registrada como
      // cambio de precio. Lo que decide es que haya una cifra nueva.
      test('«Mismos precios» sin plazo ni cifra nueva es una aprobación', async () => {
        const result = await throttled(() => interpret('Mismos precios'));

        expect(result.classification).toBe('priced_as_suggested');
      }, 120_000);

      test('un plazo nuevo a secas sí es un cambio', async () => {
        const result = await throttled(() => interpret('Entrega: 20 semanas'));

        expect(result.classification).toBe('priced_differently');
        expect(result.newDeliveryWeeks).toEqual({ min: 20, max: 20 });
      }, 120_000);

      test('un plazo dado como rango conserva los dos extremos', async () => {
        const result = await throttled(() =>
          interpret('Va, mismos precios y entrega de 18 a 22 semanas')
        );

        expect(result.classification).toBe('priced_differently');
        expect(result.newDeliveryWeeks).toEqual({ min: 18, max: 22 });
      }, 120_000);
    });

    describe('la cadena citada ya no sostiene la clasificación', () => {
      // Antes del ticket 28 esto era al revés: con la cita clasificaba 6/6 y sin
      // ella 0/6. Las dos formas tienen que dar lo mismo ahora.
      const QUOTED = [
        'Aprobado',
        '',
        'El mar, 5 ago 2026 a las 10:14, ZIEHL-ABEGG <no-reply@zamx.mx> escribió:',
        '> Hola equipo de ventas,',
        '> El cliente Ana Márquez ha generado una nueva solicitud de cotización.',
      ].join('\n');

      test('un «Aprobado» con cadena citada y otro pelado clasifican igual', async () => {
        const [conCita, pelado] = await Promise.all([
          throttled(() => interpret(QUOTED)),
          throttled(() => interpret('Aprobado')),
        ]);

        expect(conCita.classification).toBe('priced_as_suggested');
        expect(pelado.classification).toBe('priced_as_suggested');
        expect(conCita.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
        expect(pelado.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
      }, 120_000);
    });
  });
}
