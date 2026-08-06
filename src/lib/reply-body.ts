/**
 * Qué parte de un correo recibido es la respuesta del Approver.
 *
 * Un cliente de correo devuelve lo que el Approver escribió más todo lo que
 * arrastra: la cadena citada, el encabezado que la introduce, y el relleno de
 * caracteres de ancho cero que la plantilla mete en el preheader — 955 de los
 * 3117 caracteres de `REQ-BVR06L`. Nada de eso es la respuesta, y todo eso
 * entra al modelo como dato a clasificar.
 *
 * Recortarlo sólo es seguro desde el ticket 28: hasta entonces la cita era la
 * única fuente del vocabulario que el modelo necesitaba para entender un
 * «Aprobado» pelado. Ahora ese vocabulario está en el prompt de sistema
 * (`reply-vocabulary.ts`), la cita no sostiene nada, y quitarla reduce la
 * superficie de inyección que el ticket 09 existe para defender: menos texto
 * heredado es menos texto sobre el que equivocarse.
 */

/**
 * Caracteres invisibles: anchos cero, marcas de dirección, juntador de palabras,
 * BOM y guion suave. Son relleno de plantilla, y diluyen la única frase que
 * lleva la decisión.
 */
const INVISIBLE = /[\u200b-\u200f\u2060\ufeff\u00ad]/g;

/**
 * Dónde empieza la cita. Cada patrón se ancla a principio de línea, y se busca
 * la aparición más temprana de cualquiera de ellos.
 *
 * Sólo formas que un cliente de correo genera por su cuenta: una línea de cita
 * `>`, un encabezado «… escribió:» / «… wrote:», un separador de mensaje
 * original, o la cabecera reenviada `De:` / `From:` seguida de la fecha. Nada
 * de esto lo escribe un Approver al responder.
 */
const QUOTE_MARKERS: readonly RegExp[] = [
  /^>/m,
  // Gmail / Apple Mail, en los dos idiomas. La fecha varía tanto entre clientes
  // que lo que se ancla es el verbo final y los dos puntos.
  /^\s*El .*\bescribi[óo]:\s*$/m,
  /^\s*On .*\bwrote:\s*$/m,
  /^\s*-{2,}\s*(Mensaje original|Original Message|Forwarded message|Mensaje reenviado)\s*-{2,}/im,
  // Outlook: bloque de cabeceras reenviadas. Se exige que la línea siguiente sea
  // otra cabecera, para no cortar en un «De:» que alguien escribió a mano.
  /^\s*(De|From):\s.*\n\s*(Enviado|Sent|Fecha|Date|Para|To):\s/m,
  /^\s*_{10,}\s*$/m,
];

/**
 * La firma sólo se recorta en su forma canónica (`-- ` en su propia línea), que
 * es la que el estándar define y los clientes generan. Cualquier heurística más
 * amplia se come texto que el Approver sí escribió.
 */
const SIGNATURE_MARKER = /^-- \s*$/m;

/**
 * El texto que el modelo debe ver: lo que el Approver escribió, sin la cadena
 * citada, sin firma canónica y sin caracteres invisibles.
 *
 * Si el recorte no deja nada legible se devuelve el cuerpo entero limpio de
 * invisibles. Una respuesta que sólo existe dentro de lo que parecía una cita
 * es rara, pero clasificar de más siempre es mejor que mandarle al modelo una
 * cadena vacía: eso es una decisión perdida en silencio, que es el fallo que
 * este ticket arregla.
 */
export function replyBodyForInterpretation(textBody: string): string {
  const clean = textBody.replace(INVISIBLE, '');

  const cut = earliestMatch(clean, QUOTE_MARKERS);
  const withoutQuote = cut === undefined ? clean : clean.slice(0, cut);

  const signature = withoutQuote.search(SIGNATURE_MARKER);
  const withoutSignature = signature === -1 ? withoutQuote : withoutQuote.slice(0, signature);

  const trimmed = withoutSignature.trim();
  return trimmed === '' ? clean.trim() : trimmed;
}

/** El índice del primer marcador que aparezca, o `undefined` si no hay ninguno. */
function earliestMatch(text: string, patterns: readonly RegExp[]): number | undefined {
  const indices = patterns.map((p) => text.search(p)).filter((i) => i !== -1);
  return indices.length === 0 ? undefined : Math.min(...indices);
}
