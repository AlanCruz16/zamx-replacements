import type { Outcome } from '../../convex/lib/outcome';

/**
 * El protocolo de respuesta del Approver, definido una sola vez.
 *
 * Son dos mitades de la misma cosa: el correo de solicitud le enseña al Approver
 * qué escribir (`src/emails/QuoteRequestTemplate.tsx`) y el prompt del intérprete
 * lee lo que escribió (`src/lib/gemini-parser.ts`). Vivían en dos ficheros y se
 * separaron: el correo decía «Aprobado» y el prompt no nombraba ni una de esas
 * palabras, así que una respuesta de una sola palabra —exactamente la que el
 * correo pide— sólo clasificaba cuando el cliente de correo citaba el mensaje
 * original y el modelo leía el vocabulario de la cita. El sistema funcionaba de
 * rebote (ticket 28).
 *
 * De aquí en adelante los dos leen de esta tabla, y hay una prueba que comprueba
 * que lo que el correo imprime es lo que el prompt declara.
 */

export type ReplyVocabularyEntry = {
  outcome: Outcome;
  /**
   * Lo que el correo le enseña al Approver a escribir. Cada cadena aparece tal
   * cual en el correo renderizado y tal cual en el prompt de sistema — es lo
   * único que las dos mitades tienen que compartir palabra por palabra.
   *
   * Casi siempre es una palabra suelta. Para `priced_differently` no la hay: lo
   * que se enseña es una forma, y lo que va aquí es la línea de ejemplo entera.
   */
  taught: readonly string[];
  /**
   * Lo que el intérprete reconoce además, sin que el correo lo pida. No es una
   * lista blanca —el modelo sigue clasificando por lo que la respuesta significa—
   * sino el puñado de formas medidas: `REQ-BVR06L` decía «Adelante» donde el
   * correo pedía «Aprobado», y perder una aprobación real por eso es lo que este
   * ticket arregla. Nada entra aquí sin haberse comprobado contra el modelo en
   * `reply-vocabulary.check.ts`.
   */
  alsoAccepted: readonly string[];
  /** Cómo se le nombra al modelo lo que significa esa respuesta. */
  meaning: string;
};

/**
 * `Record<Outcome, …>` y no una lista: así olvidar un Outcome es un error de
 * compilación, no una prueba que alguien tiene que acordarse de escribir.
 */
const ENTRIES = {
  priced_as_suggested: {
    taught: ['Aprobado'],
    alsoAccepted: ['Adelante', 'Ok'],
    meaning: 'autoriza los Suggested Prices y los plazos sin cambios',
  },
  priced_differently: {
    // La línea entera, no sus palabras sueltas: «Mismos precios» a secas
    // significa lo contrario —que los precios no cambian— y enseñárselo al
    // modelo como disparador de este Outcome convertiría una aprobación en un
    // cambio de precio.
    taught: ['Mismos precios, Entrega: 20 semanas'],
    alsoAccepted: [],
    meaning:
      'da un precio nuevo para alguna pieza —una línea por pieza, con su número de parte y la cifra en USD— o un plazo de entrega nuevo para toda la solicitud',
  },
  oem_restricted: {
    taught: ['OEM', 'No disponible al público'],
    alsoAccepted: [],
    meaning: 'la pieza es exclusiva de su fabricante original y no se puede vender directo',
  },
  discontinued: {
    // Sólo las flexiones de género de lo que ya se enseña: el Approver escribe
    // de la pieza, que es femenina.
    taught: ['Descontinuado', 'Obsoleto'],
    alsoAccepted: ['Descontinuada', 'Obsoleta'],
    meaning: 'la pieza está descontinuada y no tiene reemplazo directo',
  },
  blocked_pending_info: {
    taught: ['Falta info:'],
    alsoAccepted: [],
    meaning: 'pide más información al Customer (por ejemplo, fotos de la placa)',
  },
} satisfies Record<Outcome, Omit<ReplyVocabularyEntry, 'outcome'>>;

/** La entrada de un Outcome. Los cinco están, y el tipo lo garantiza. */
export function vocabularyFor(outcome: Outcome): ReplyVocabularyEntry {
  return { outcome, ...ENTRIES[outcome] };
}

/** La tabla entera, en el orden en que el correo presenta las salidas. */
export const REPLY_VOCABULARY: readonly ReplyVocabularyEntry[] = (
  Object.keys(ENTRIES) as Outcome[]
).map(vocabularyFor);

/**
 * «A» o «B» — la forma en que el correo cita una palabra al Approver. La
 * conjunción es «u» cuando la palabra que sigue empieza por o- (u ho-), como en
 * «Descontinuado» u «Obsoleto»: es el correo que lee una persona, y ahí la
 * ortografía cuenta.
 */
export function quoteWords(words: readonly string[]): string {
  const quoted = words.map((w) => `«${w}»`);
  if (quoted.length <= 1) return quoted.join('');

  const last = quoted[quoted.length - 1];
  const conjunction = /^«h?o/i.test(last) ? 'u' : 'o';
  return `${quoted.slice(0, -1).join(', ')} ${conjunction} ${last}`;
}

/**
 * El bloque que el prompt de sistema lleva dentro. Va explícito en que una
 * respuesta de una sola palabra basta: el fallo medido no era que el modelo no
 * conociera las palabras, era que un imperativo pelado y sin contexto no le
 * parecía una respuesta a nada.
 */
export function vocabularyPromptBlock(): string {
  const lines = REPLY_VOCABULARY.map((entry) => {
    const also =
      entry.alsoAccepted.length === 0 ? '' : ` (también ${quoteWords(entry.alsoAccepted)})`;
    return `- ${quoteWords(entry.taught)}${also} => "${entry.outcome}" — ${entry.meaning}.`;
  });

  return [
    'El correo que recibió el Approver le enseñó estas palabras para contestar, y cada una con lo',
    'que significa. Cuando el mensaje traiga una de ellas —o encaje en lo que la línea describe— es',
    'una respuesta explícita a esta Replacement Request y la clasificación es la que aquí se indica,',
    'con confianza alta: aunque venga sola, sin saludo, sin explicación y sin citar el correo',
    'original. Un «Aprobado» de una sola palabra es una aprobación, no un mensaje incompleto ni un',
    'reenvío.',
    '',
    ...lines,
    '',
    // Medido: «Mismos precios» a secas daba "priced_differently" con 0.95 de
    // confianza, y la propia explicación del modelo decía que los precios no
    // cambiaban. La línea que se le enseña al Approver lleva esas palabras
    // dentro, así que hay que decir de qué depende el Outcome: de que haya una
    // cifra nueva, no de que se nombren los precios.
    'Lo que separa "priced_differently" de "priced_as_suggested" es que la respuesta traiga una',
    'cifra nueva o un plazo nuevo. Una que no cambia ninguna de las dos es "priced_as_suggested",',
    'aunque hable de los precios o diga «mismos precios».',
  ].join('\n');
}
