import { messagesFor, type Language, type Messages } from '@/lib/messages';

/**
 * Lo que necesita cualquier prueba de idioma, en un solo sitio.
 *
 * Las seis superficies del ticket 20 se comprueban igual —renderizar en un
 * idioma y exigir que no sobreviva ninguna frase del otro—, así que las dos
 * piezas de esa comprobación iban por su sexta copia: el volteo de idioma y el
 * cálculo de qué frases distinguen de verdad un idioma del otro.
 */

/** El idioma en el que la superficie **no** se pintó. */
export function otherLanguage(language: Language): Language {
  return language === 'es' ? 'en' : 'es';
}

/**
 * Las frases de una sección que distinguen un idioma del otro.
 *
 * Las que coinciden —`MEX`, `Total`, `pos`— no dicen nada sobre el idioma, y
 * exigir que no aparezcan produciría fallos falsos en lugar de encontrar
 * traducciones a medias.
 *
 * Sólo mira las hojas de texto: las plantillas que son funciones se comprueban
 * con sus argumentos, en la prueba que sabe con cuáles se llaman.
 */
export function distinctivePhrases<K extends keyof Messages>(
  section: K,
  language: Language
): string[] {
  const flatten = (lang: Language) =>
    Object.values(messagesFor(lang)[section] as Record<string, unknown>).flatMap((value) =>
      typeof value === 'string' ? [value] : Array.isArray(value) ? (value as string[]) : []
    );

  const otras = new Set(flatten(otherLanguage(language)));
  return flatten(language).filter((phrase) => !otras.has(phrase));
}
