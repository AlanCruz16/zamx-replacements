import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { montar } from '@/test/render-component';
import { LANGUAGES, messagesFor, type Language } from '@/lib/messages';
import { otherLanguage } from '@/test/languages';
import type { TabItem } from '@/components/ui/expandable-tabs';

/**
 * La barra de navegación, en los dos idiomas.
 *
 * Es la superficie donde el Customer *elige* su idioma, y hasta el ticket 20 era
 * la única parte de ella que lo miraba: «Inicio» y «Mis Cotizaciones» iban en
 * español fijo, así que el control lo cambiaba todo menos la barra que lo
 * contiene.
 *
 * `ExpandableTabs` se sustituye por una lista de títulos porque de verdad sólo
 * pinta el título de la pestaña desplegada — su comportamiento ya lo prueba
 * `expandable-tabs.test.tsx`. Lo que se comprueba aquí es qué etiquetas le
 * entrega la barra, que es lo que decide el ticket 20.
 */

const { useQuery, useMutation } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => vi.fn()),
}));

vi.mock('convex/react', () => ({ useQuery, useMutation }));
vi.mock('@clerk/nextjs', () => ({ UserButton: () => null }));
vi.mock('@/components/ui/expandable-tabs', () => ({
  ExpandableTabs: ({ tabs }: { tabs: TabItem[] }) => (
    <div>
      {tabs.map((tab, index) => (
        <span key={index}>{tab.title ?? ''} </span>
      ))}
    </div>
  ),
}));

async function render(language: Language) {
  useQuery.mockReturnValue({ preferredLanguage: language });
  const { default: Navbar } = await import('./Navbar');
  return montar(<Navbar />);
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('la barra de navegación', () => {
  test.each(LANGUAGES)('en %s no sobrevive ninguna frase del otro idioma', async (language) => {
    const otro = otherLanguage(language);
    const text = (await render(language)).textContent ?? '';

    expect(text).toContain(messagesFor(language).nav.home);
    expect(text).toContain(messagesFor(language).nav.quotes);

    expect(text).not.toContain(messagesFor(otro).nav.home);
    expect(text).not.toContain(messagesFor(otro).nav.quotes);
  });

  test('el control de idioma pone en mayúscula el idioma activo', async () => {
    // Dice a la vez dónde estás y a dónde te lleva, así que la etiqueta es
    // justamente la que **no** puede ser la misma en los dos idiomas.
    expect((await render('es')).textContent).toContain('ES / en');
    expect((await render('en')).textContent).toContain('es / EN');
  });

  test.each(LANGUAGES)('lo que no es texto visible también va en %s', async (language) => {
    const otro = otherLanguage(language);
    const container = await render(language);
    const t = messagesFor(language).nav;

    // El texto alternativo del logo y el título de la bandera sólo los lee quien
    // más los necesita, así que quedarse en el idioma equivocado ahí es peor.
    expect(container.querySelector('img')?.getAttribute('alt')).toBe(t.logoAlt);
    expect(container.querySelector('[title]')?.getAttribute('title')).toBe(t.countryTitle);
    expect(container.innerHTML).not.toContain(messagesFor(otro).nav.logoAlt);
  });
});
