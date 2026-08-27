import { describe, expect, test } from 'vitest';
import {
  LANGUAGES,
  MESSAGES,
  DEFAULT_LANGUAGE,
  formatAmount,
  formatCurrency,
  formatDate,
  localeOf,
  messagesFor,
  resolveLanguage,
  type Language,
} from './messages';

/**
 * La falla que este módulo existe para impedir es la traducción a medias: una
 * superficie donde la mitad de las frases cambian de idioma y la otra mitad no.
 * El Customer no puede distinguir qué partes puede creerse, así que es peor que
 * no traducir nada.
 *
 * Por eso el test recorre el árbol entero en vez de comprobar frases sueltas:
 * una frase nueva sólo en español —o una rama con distinta forma— se cae aquí
 * sin que nadie tenga que acordarse de venir a añadirle un caso.
 */

/** Las rutas de todas las hojas del árbol, en orden, con el tipo de cada una. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return [`${prefix}: array(${value.length})`];
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value)
      .sort()
      .flatMap((key) =>
        leafPaths((value as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key)
      );
  }
  return [`${prefix}: ${typeof value}`];
}

/** Las hojas que son texto, para poder afirmar sobre lo que se lee. */
function textLeaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(textLeaves);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(textLeaves);
  return [];
}

describe('el módulo de mensajes', () => {
  test('los dos idiomas tienen exactamente las mismas claves y la misma forma', () => {
    expect(leafPaths(MESSAGES.en)).toEqual(leafPaths(MESSAGES.es));
  });

  test('ninguna frase se quedó vacía', () => {
    for (const language of LANGUAGES) {
      for (const text of textLeaves(MESSAGES[language])) {
        expect(text.trim()).not.toBe('');
      }
    }
  });

  test('las funciones de frase producen texto en los dos idiomas', () => {
    // Las hojas que son funciones no las alcanza el recorrido de texto: se
    // invocan aquí para que una plantilla que devolviera vacío no pasara.
    for (const language of LANGUAGES) {
      const m = messagesFor(language);
      expect(m.chatErrors.tooManyRequests(3)).toContain('3');
      expect(m.quoteDocument.greeting('Ana Cliente')).toContain('Ana Cliente');
      expect(m.quoteDocument.deliveryShared(10, 14)).toMatch(/10.*14/);
      expect(m.quoteDocument.deliveryPerPart('P-001', 10, 14)).toContain('P-001');
      expect(m.quoteDocument.footerHowToOrder('ventas@example.com')).toContain(
        'ventas@example.com'
      );
      expect(m.clientQuoteEmail.subject('REQ-A7F3K2')).toContain('REQ-A7F3K2');
      expect(m.clientQuoteEmail.preview('REQ-A7F3K2')).toContain('REQ-A7F3K2');
      expect(m.clientQuoteEmail.greeting('Ana Cliente')).toContain('Ana Cliente');
      expect(m.rejectedQuoteEmail.subject('REQ-A7F3K2')).toContain('REQ-A7F3K2');
    }
  });

  test('el singular y el plural del minuto se redactan en los dos idiomas', () => {
    expect(messagesFor('es').chatErrors.tooManyRequests(1)).toContain('1 minuto.');
    expect(messagesFor('es').chatErrors.tooManyRequests(2)).toContain('2 minutos.');
    expect(messagesFor('en').chatErrors.tooManyRequests(1)).toContain('1 minute.');
    expect(messagesFor('en').chatErrors.tooManyRequests(2)).toContain('2 minutes.');
  });
});

describe('el idioma que llega de fuera', () => {
  test.each(LANGUAGES)('%s se reconoce tal cual', (language) => {
    expect(resolveLanguage(language)).toBe(language);
  });

  test.each([undefined, null, '', 'fr', 'ES', 'es-MX'])(
    'un valor que no reconocemos (%s) cae al español',
    (value) => {
      // El español por defecto no es una casualidad: es ZIEHL-ABEGG México, y es
      // lo mismo que hace el alta del Customer en `convex/users.ts`.
      expect(resolveLanguage(value)).toBe('es');
      expect(DEFAULT_LANGUAGE).toBe('es');
    }
  );
});

describe('el formato de fechas y números', () => {
  test('la fecha sigue al idioma', () => {
    const timestamp = Date.UTC(2026, 6, 30, 12);

    expect(formatDate(timestamp, 'es')).not.toBe(formatDate(timestamp, 'en'));
    expect(localeOf('es')).toBe('es-MX');
    expect(localeOf('en')).toBe('en-US');
  });

  test('la divisa no sigue al idioma: los precios de ZAMX son en USD', () => {
    // Lo que cambia es la puntuación, no la moneda. Un Quote Document en inglés
    // que cotizara en otra divisa mentiría sobre el precio.
    for (const language of LANGUAGES as readonly Language[]) {
      expect(formatCurrency(1234.5, language)).toContain('1,234.50');
      expect(formatAmount(1234.5, language)).toBe('1,234.50');
    }
  });
});
