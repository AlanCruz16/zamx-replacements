import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { montar } from '@/test/render-component';
import { LANGUAGES, messagesFor, type Language } from '@/lib/messages';
import { distinctivePhrases, otherLanguage } from '@/test/languages';

/**
 * El alta del Customer, en los dos idiomas.
 *
 * Es la primera pantalla que ve, y hasta el ticket 20 la única que no miraba su
 * idioma en absoluto: quien llegaba con la cuenta ya en inglés rellenaba un
 * formulario entero en español antes de ver el chat.
 *
 * La mitad de esta pantalla son `placeholder` y `label`, que no salen en
 * `textContent`: por eso se lee también el HTML.
 */

const { useQuery, useMutation, push } = vi.hoisted(() => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => vi.fn()),
  push: vi.fn(),
}));

vi.mock('convex/react', () => ({ useQuery, useMutation }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

async function render(language: Language) {
  // `companyName: 'Pendiente'` es lo que significa "todavía no se ha dado de
  // alta": con cualquier otro valor la pantalla redirige y no pinta nada.
  useQuery.mockReturnValue({
    fullName: 'Ana Cliente',
    companyName: 'Pendiente',
    preferredLanguage: language,
  });
  const { default: OnboardingPage } = await import('./page');
  return montar(<OnboardingPage />);
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('el alta del Customer', () => {
  test.each(LANGUAGES)('en %s lleva sus propias frases, etiquetas incluidas', async (language) => {
    const html = (await render(language)).innerHTML;

    for (const phrase of distinctivePhrases('onboarding', language)) {
      expect(html).toContain(phrase);
    }
  });

  test.each(LANGUAGES)('en %s no sobrevive ninguna frase del otro idioma', async (language) => {
    const otro = otherLanguage(language);
    const html = (await render(language)).innerHTML;

    for (const phrase of distinctivePhrases('onboarding', otro)) {
      expect(html).not.toContain(phrase);
    }
  });

  test.each(LANGUAGES)('los campos del formulario se piden en %s', async (language) => {
    const container = await render(language);
    const t = messagesFor(language).onboarding;

    const placeholders = [...container.querySelectorAll('input')].map((input) =>
      input.getAttribute('placeholder')
    );

    expect(placeholders).toEqual([t.fullNamePlaceholder, t.companyPlaceholder, t.phonePlaceholder]);
    expect(container.querySelector('button[type="submit"]')?.textContent).toContain(t.submit);
  });
});
