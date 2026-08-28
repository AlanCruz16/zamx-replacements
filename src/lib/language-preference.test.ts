import { afterEach, describe, expect, test, vi } from 'vitest';
import { LANGUAGES, DEFAULT_LANGUAGE } from '@/lib/messages';
import { lastKnownLanguage, rememberLanguage } from './language-preference';

/**
 * Lo que se afirma es la promesa del módulo: que devuelve un idioma **siempre**,
 * pase lo que pase con el almacenamiento. Quien lo usa lo hace mientras pinta un
 * error; no puede permitirse otro.
 */

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('el último idioma conocido', () => {
  test.each(LANGUAGES)('se recuerda %s entre visitas', (language) => {
    rememberLanguage(language);

    expect(lastKnownLanguage()).toBe(language);
  });

  test('sin nada guardado se usa el idioma por defecto', () => {
    expect(lastKnownLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  test('lo guardado que no es un idioma no se cree', () => {
    window.localStorage.setItem('zamx.language', 'kl');

    expect(lastKnownLanguage()).toBe(DEFAULT_LANGUAGE);
  });

  test('un almacenamiento que lanza no arrastra a quien pregunta', () => {
    vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('el navegador no deja');
    });
    vi.spyOn(window.localStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('el navegador no deja');
    });

    expect(() => rememberLanguage('en')).not.toThrow();
    expect(lastKnownLanguage()).toBe(DEFAULT_LANGUAGE);
  });
});
