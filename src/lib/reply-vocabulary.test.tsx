import { describe, expect, test } from 'vitest';
import * as React from 'react';
import { renderEmail } from '@/test/render-email';
import { QuoteRequestTemplate } from '@/emails/QuoteRequestTemplate';
import { interpreterSystemPrompt } from './gemini-parser';
import { REPLY_VOCABULARY, quoteWords, vocabularyFor } from './reply-vocabulary';
import { NOTIFIABLE_OUTCOMES } from '../../convex/lib/outcome';

/**
 * La prueba que faltaba: que lo que el correo le enseña al Approver y lo que el
 * intérprete sabe leer sean lo mismo.
 *
 * Las dos mitades son un solo protocolo, y estuvieron escritas a mano en dos
 * ficheros que se separaron sin que nada avisara: el correo pedía «Aprobado» y
 * el prompt no nombraba esa palabra por ningún lado, así que una respuesta de
 * una palabra sólo clasificaba si el cliente de correo citaba el original y el
 * modelo leía el vocabulario de la cita. No hace red y corre en CI — es la
 * prueba que habría cazado esto antes de desplegarlo.
 */

const REQUEST = {
  products: [
    {
      partNumber: '162562',
      model: 'FN050-VDK.4I.V7P1',
      quantity: 2,
      deliveryLocation: 'Monterrey, NL',
      suggestedPriceUSD: 3100.5,
      suggestedDeliveryWeeksMin: 25,
      suggestedDeliveryWeeksMax: 30,
    },
  ],
};

/** Una pieza sin Suggested Price: enciende el bloque de aviso, que también cita palabras. */
const UNPRICEABLE_PRODUCT = {
  partNumber: '999999',
  model: 'ZZ999-NADA',
  quantity: 1,
  deliveryLocation: 'CDMX',
  suggestedDeliveryWeeksMin: 25,
  suggestedDeliveryWeeksMax: 30,
};

async function renderedApproverEmail(
  products: Parameters<typeof QuoteRequestTemplate>[0]['products'] = REQUEST.products
): Promise<string> {
  const { text } = await renderEmail(
    React.createElement(QuoteRequestTemplate, {
      requestId: 'REQ-V59X9B',
      customer: {
        fullName: 'Ana Márquez',
        companyName: 'Refrigeración del Norte',
        email: 'ana@refrinorte.mx',
        phone: '+52 81 1234 5678',
      },
      products,
      subtotalUSD: 6201,
      taxUSD: 992.16,
      totalUSD: 7193.16,
    })
  );

  return text;
}

describe('el vocabulario que el correo enseña y el que el intérprete lee', () => {
  test('la tabla cubre los cinco Outcomes, sin repetir ninguno', () => {
    const covered = REPLY_VOCABULARY.map((entry) => entry.outcome);

    expect(new Set(covered).size).toBe(covered.length);
    expect(new Set(covered)).toEqual(
      new Set(['priced_as_suggested', 'priced_differently', ...NOTIFIABLE_OUTCOMES])
    );
  });

  test.each(REPLY_VOCABULARY.map((entry) => [entry.outcome, entry] as const))(
    'el correo imprime tal cual las palabras que la tabla enseña para %s',
    async (_outcome, entry) => {
      const email = await renderedApproverEmail();

      for (const word of entry.taught) {
        expect(email).toContain(word);
      }
    }
  );

  test.each(REPLY_VOCABULARY.map((entry) => [entry.outcome, entry] as const))(
    'el prompt de sistema declara el vocabulario de %s y su Outcome',
    (outcome, entry) => {
      const system = interpreterSystemPrompt(REQUEST);

      for (const word of [...entry.taught, ...entry.alsoAccepted]) {
        expect(system).toContain(word);
      }
      expect(system).toContain(outcome);
    }
  );

  test('el correo no le enseña al Approver ni una palabra que la tabla no tenga', async () => {
    // La otra dirección, y la que de verdad ataja la separación: comprobar sólo
    // que lo de la tabla se imprime deja verde un correo al que alguien le
    // añadió a mano una instrucción nueva — que es exactamente cómo empezó esto.
    // Todo lo que el correo entrecomilla como respuesta sale de la tabla, salvo
    // la línea de ejemplo de precio, que se construye con la pieza de la propia
    // solicitud (ticket 12) y por eso no puede vivir en una constante.
    // Con la pieza sin precio incluida, para que el bloque de aviso —que también
    // cita palabras— entre en la comprobación.
    const email = await renderedApproverEmail([...REQUEST.products, UNPRICEABLE_PRODUCT]);

    const quotedInEmail = [...email.matchAll(/«([^»]+)»/g)].map((m) => m[1]);
    const taught = new Set(REPLY_VOCABULARY.flatMap((entry) => entry.taught));

    expect(quotedInEmail.length).toBeGreaterThan(0);
    expect(quotedInEmail.filter((quoted) => !taught.has(quoted))).toEqual([
      '162562: $3,100.50 USD',
    ]);
  });

  test('lo que el correo enseña, el intérprete lo lee', async () => {
    const email = await renderedApproverEmail();
    const system = interpreterSystemPrompt(REQUEST);

    for (const entry of REPLY_VOCABULARY) {
      for (const word of entry.taught) {
        expect(email).toContain(word);
        expect(system).toContain(word);
      }
    }
  });

  test('el prompt dice explícitamente que una respuesta de una sola palabra basta', () => {
    // El fallo medido no fue que el modelo desconociera las palabras: fue que un
    // imperativo pelado, sin la cita alrededor, no le parecía respuesta a nada.
    const system = interpreterSystemPrompt(REQUEST);

    expect(system).toMatch(/aunque venga sola/i);
  });
});

describe('cómo se le citan las palabras al Approver', () => {
  test('una sola palabra va entre comillas angulares, sin conjunción', () => {
    expect(quoteWords(['Aprobado'])).toBe('«Aprobado»');
  });

  test('varias palabras se enumeran con «o» antes de la última', () => {
    expect(quoteWords(['OEM', 'No disponible al público'])).toBe(
      '«OEM» o «No disponible al público»'
    );
    expect(quoteWords(['A', 'B', 'C'])).toBe('«A», «B» o «C»');
  });
});

describe('la búsqueda por Outcome', () => {
  test('devuelve la entrada del Outcome pedido', () => {
    expect(vocabularyFor('discontinued').taught).toContain('Descontinuado');
  });
});
