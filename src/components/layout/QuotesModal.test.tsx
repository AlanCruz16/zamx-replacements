import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { montar } from '@/test/render-component';
import { LANGUAGES, messagesFor, type Language } from '@/lib/messages';
import { distinctivePhrases, otherLanguage } from '@/test/languages';

/**
 * La lista de Replacement Requests del Customer, en los dos idiomas.
 *
 * El corte va en `convex/react`: lo que se prueba es lo que el Customer lee, y
 * de dónde salen las Replacement Requests ya lo prueban las funciones de Convex.
 * Antes del ticket 20 esta pantalla no miraba el idioma en absoluto — insignias,
 * totales y fechas iban en español fijo, con `es-MX` escrito a mano.
 */

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock('convex/react', () => ({ useQuery }));

const QUOTE = {
  _id: 'quote_1',
  _creationTime: Date.UTC(2026, 6, 30, 15, 45),
  requestId: 'REQ-V59X9B',
  outcome: 'priced_differently',
  customerNotifiedAt: Date.UTC(2026, 6, 31),
  products: [
    {
      partNumber: 'P-001',
      model: 'MK137-4DZ.07.U',
      quantity: 2,
      deliveryLocation: 'Monterrey',
      confirmedPriceUSD: 3125,
      suggestedDeliveryWeeksMin: 25,
      suggestedDeliveryWeeksMax: 30,
    },
  ],
};

/**
 * Las dos consultas que hace la pantalla se distinguen por el orden en que las
 * pide: primero las Replacement Requests, después el Customer.
 */
function stubQueries(language: Language, quotes: unknown[] | undefined) {
  let call = 0;
  useQuery.mockImplementation(() => {
    call += 1;
    return call % 2 === 1 ? quotes : { preferredLanguage: language };
  });
}

/**
 * El texto que el Customer lee, con la modal abierta. `'en-vuelo'` es lo que
 * devuelve Convex mientras la consulta no ha vuelto — un `undefined` a secas no
 * serviría aquí, porque el valor por defecto lo taparía.
 */
async function render(language: Language, quotes: unknown[] | 'en-vuelo' = [QUOTE]) {
  stubQueries(language, quotes === 'en-vuelo' ? undefined : quotes);
  const { default: QuotesModal } = await import('./QuotesModal');
  return montar(<QuotesModal isOpen onClose={() => {}} />).textContent ?? '';
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('la lista de Replacement Requests', () => {
  test.each(LANGUAGES)('en %s no sobrevive ninguna frase del otro idioma', async (language) => {
    const otro = otherLanguage(language);
    const text = await render(language);

    expect(text).toContain(messagesFor(language).quotes.title);
    expect(text).toContain(messagesFor(language).quotes.totalLabel);
    expect(text).toContain(messagesFor(language).quotes.viewPdf);

    for (const phrase of distinctivePhrases('quotes', otro)) {
      expect(text).not.toContain(phrase);
    }
  });

  test.each(LANGUAGES)('la lista vacía se explica en %s y sólo en %s', async (language) => {
    const otro = otherLanguage(language);
    const text = await render(language, []);

    expect(text).toContain(messagesFor(language).quotes.emptyTitle);
    expect(text).toContain(messagesFor(language).quotes.emptyBody);
    expect(text).not.toContain(messagesFor(otro).quotes.emptyTitle);
    expect(text).not.toContain(messagesFor(otro).quotes.emptyBody);
  });

  test.each(LANGUAGES)('la espera se anuncia en %s', async (language) => {
    const otro = otherLanguage(language);
    const text = await render(language, 'en-vuelo');

    expect(text).toContain(messagesFor(language).quotes.loading);
    expect(text).not.toContain(messagesFor(otro).quotes.loading);
  });

  test('la insignia va en el idioma del Customer', async () => {
    // La Replacement Request del fixture tiene precio y ya se notificó, así que
    // la insignia es la de "enviada". Que la regla no dependa del idioma ya lo
    // prueba `outcome-badge.test.ts`; aquí se comprueba que la pantalla usa la
    // etiqueta traducida en vez de una constante suya.
    expect(await render('en')).toContain(messagesFor('en').quotes.badgeSent);
    expect(await render('es')).toContain(messagesFor('es').quotes.badgeSent);
  });

  test('la fecha sigue al idioma, y la divisa no', async () => {
    const spanish = await render('es');
    const english = await render('en');

    // El mismo importe en las dos: los precios de ZAMX son en USD lea quien lea
    // la lista. Lo único que cambia es cómo se escribe la fecha.
    expect(spanish).toContain('6,250');
    expect(english).toContain('6,250');
    expect(spanish).toContain('2026');
    expect(english).toContain('2026');
    expect(spanish).not.toBe(english);
  });
});
