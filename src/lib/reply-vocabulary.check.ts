import { describe, expect, test } from 'vitest';
import { CONFIDENCE_THRESHOLD } from '../../convex/lib/reply_verdict';
import { interpretApproverReply, type ReplacementRequestContext } from './gemini-parser';
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
 * Córrela cuando cambie el prompt o el correo al Approver:
 *
 *     npm run check:vocabulary
 *
 * Necesita `GOOGLE_GENERATIVE_AI_API_KEY` en `.env.local`.
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
 * El nivel gratuito del modelo admite 15 peticiones por minuto, y esta
 * comprobación hace unas cuarenta: sin espaciarlas, lo que falla es la cuota y
 * no se llega a saber nada de la clasificación. Las llamadas se encolan a una
 * cada 4,5 s, así que la tanda entera tarda unos tres minutos.
 */
const MIN_INTERVAL_MS = 4_500;

let queue: Promise<unknown> = Promise.resolve();

function throttled<T>(call: () => Promise<T>): Promise<T> {
  const turn = queue.then(() => call());
  queue = turn.then(
    () => new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS)),
    () => new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS))
  );
  return turn;
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

describe('el modelo obedece el vocabulario que el correo enseña', () => {
  for (const entry of REPLY_VOCABULARY) {
    for (const body of bodiesFor(entry)) {
      test(`«${body}» => ${entry.outcome}`, async () => {
        const results = await Promise.all(
          Array.from({ length: RUNS }, () => throttled(() => interpretApproverReply(REQUEST, body)))
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
    const result = await throttled(() => interpretApproverReply(REQUEST, 'Mismos precios'));

    expect(result.classification).toBe('priced_as_suggested');
  }, 120_000);

  test('un plazo nuevo a secas sí es un cambio', async () => {
    const result = await throttled(() => interpretApproverReply(REQUEST, 'Entrega: 20 semanas'));

    expect(result.classification).toBe('priced_differently');
    expect(result.newDeliveryWeeks).toBe(20);
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
      throttled(() => interpretApproverReply(REQUEST, QUOTED)),
      throttled(() => interpretApproverReply(REQUEST, 'Aprobado')),
    ]);

    expect(conCita.classification).toBe('priced_as_suggested');
    expect(pelado.classification).toBe('priced_as_suggested');
    expect(conCita.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    expect(pelado.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  }, 120_000);
});
