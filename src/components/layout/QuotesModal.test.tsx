import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, useState } from 'react';
import { montar } from '@/test/render-component';
import { LANGUAGES, messagesFor, type Language } from '@/lib/messages';
import { distinctivePhrases, otherLanguage } from '@/test/languages';
import { TOUCH_TARGET } from '@/lib/touch-target';

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

/**
 * El panel como diálogo (ticket 09 de «usable-on-a-phone»).
 *
 * Un anfitrión con estado, en vez de montar el panel ya abierto: abrir y cerrar
 * es justo lo que hay que probar, y el botón que lo abre es también el sitio al
 * que el foco tiene que volver. Nada de esto mira dentro del componente —se
 * pulsa, se teclea y se lee lo que el navegador dice después.
 */

function pulsar(elemento: HTMLElement) {
  act(() => {
    elemento.click();
  });
}

/** Teclear donde está el foco, que es por donde llega la tecla de verdad. */
function teclear(key: string) {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true })
    );
  });
}

function buscar<T extends HTMLElement>(raiz: ParentNode, selector: string, queEs: string): T {
  const encontrado = raiz.querySelector<T>(selector);
  if (!encontrado) throw new Error(`No hay ${queEs} en la pantalla`);
  return encontrado;
}

function hayDialogo(container: HTMLElement): boolean {
  return container.querySelector('[role="dialog"]') !== null;
}

function dialogo(container: HTMLElement): HTMLElement {
  return buscar(container, '[role="dialog"]', 'ningún diálogo');
}

/** El botón que abre el panel, que es también de dónde viene el foco. */
function abridor(container: HTMLElement): HTMLButtonElement {
  return buscar<HTMLButtonElement>(container, '[data-testid="abrir"]', 'ningún botón que abra');
}

/**
 * El velo de detrás del panel. Se reconoce por lo que declara de sí mismo —que
 * no hay nada que leer en él— y no por una marca puesta para la prueba. Que sea
 * además el hermano del diálogo se comprueba aquí: sin eso, cualquier envoltorio
 * decorativo futuro se llevaría en silencio la prueba de «tocar fuera».
 */
function velo(container: HTMLElement): HTMLElement {
  const encontrado = buscar(container, 'div[aria-hidden="true"]', 'ningún velo');
  if (encontrado.nextElementSibling !== dialogo(container)) {
    throw new Error('El primer elemento oculto de la pantalla no es el velo del diálogo');
  }
  return encontrado;
}

async function montarAnfitrion() {
  stubQueries('es', [QUOTE]);
  const { default: QuotesModal } = await import('./QuotesModal');

  function Anfitrion() {
    const [abierto, setAbierto] = useState(false);
    return (
      <>
        <button data-testid="abrir" onClick={() => setAbierto(true)}>
          Abrir
        </button>
        <QuotesModal isOpen={abierto} onClose={() => setAbierto(false)} />
      </>
    );
  }

  const container = montar(<Anfitrion />);
  return { container, abrir: () => pulsar(abridor(container)) };
}

describe('el panel de Replacement Requests como diálogo', () => {
  test('se anuncia como diálogo y dice cómo se llama', async () => {
    const { container, abrir } = await montarAnfitrion();
    abrir();

    const panel = dialogo(container);
    expect(panel.getAttribute('aria-modal')).toBe('true');

    const nombre = document.getElementById(panel.getAttribute('aria-labelledby') ?? '');
    expect(nombre?.textContent).toBe(messagesFor('es').quotes.title);
  });

  test('Escape lo cierra', async () => {
    const { container, abrir } = await montarAnfitrion();
    abrir();
    expect(hayDialogo(container)).toBe(true);

    teclear('Escape');
    expect(hayDialogo(container)).toBe(false);
  });

  test('el botón de cerrar lo cierra', async () => {
    const { container, abrir } = await montarAnfitrion();
    abrir();

    pulsar(
      buscar(
        container,
        `[aria-label="${messagesFor('es').quotes.close}"]`,
        'ningún botón de cerrar'
      )
    );
    expect(hayDialogo(container)).toBe(false);
  });

  test('tocar fuera lo cierra', async () => {
    const { container, abrir } = await montarAnfitrion();
    abrir();

    pulsar(velo(container));
    expect(hayDialogo(container)).toBe(false);
  });

  test('el foco entra al abrirse y vuelve a donde estaba al cerrarse', async () => {
    const { container, abrir } = await montarAnfitrion();
    abridor(container).focus();
    abrir();

    expect(dialogo(container).contains(document.activeElement)).toBe(true);

    teclear('Escape');
    expect(document.activeElement).toBe(abridor(container));
  });

  /**
   * La única de estas pruebas que mira un estilo, y a propósito: jsdom no
   * desplaza nada, así que «la página de detrás está quieta» no se puede
   * observar de otro modo. Es el mismo trato que las medidas de la guía de la
   * placa en el ticket 08 —ahí el atributo *es* el contrato, y aquí el estilo
   * del `body` es lo que el panel promete a la pantalla que deja detrás—. Si
   * mañana el bloqueo se hace con `position: fixed`, esta prueba hay que
   * reescribirla; se prefiere eso a no tener ninguna.
   */
  test('la página de detrás no se desplaza mientras está abierto', async () => {
    const { abrir } = await montarAnfitrion();
    const antes = document.body.style.overflow;

    abrir();
    expect(document.body.style.overflow).toBe('hidden');

    teclear('Escape');
    expect(document.body.style.overflow).toBe(antes);
  });
});

/**
 * Los dos controles del panel que se pulsan con el pulgar (ticket 10 de
 * «usable-on-a-phone»). Se miden después del ticket 09 porque es ése el que les
 * dio su forma final: el de cerrar se dibujaba a 36×36 y el enlace al Quote
 * Document a 32px de alto.
 *
 * Lo que se afirma es que el control lleva la clase que agranda su área. Cuánto
 * agranda —y que no mueve el dibujo— lo vigila `touch-target.test.ts`, que lee
 * la hoja de estilos; jsdom no aplica Tailwind y no hay aquí ninguna medida que
 * leer.
 */
describe('los controles del panel se aciertan con el pulgar', () => {
  test('el botón de cerrar', async () => {
    const { container, abrir } = await montarAnfitrion();
    abrir();

    const cerrar = buscar(
      container,
      `[aria-label="${messagesFor('es').quotes.close}"]`,
      'ningún botón de cerrar'
    );
    expect(cerrar.classList.contains(TOUCH_TARGET)).toBe(true);
  });

  test('el enlace al Quote Document', async () => {
    const { container, abrir } = await montarAnfitrion();
    abrir();

    const enlace = buscar(container, 'a[href^="/api/download-quote"]', 'ningún enlace al PDF');
    expect(enlace.classList.contains(TOUCH_TARGET)).toBe(true);
  });
});
