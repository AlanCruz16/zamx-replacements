/**
 * Qué mensajes del buzón se marcan leídos, y cuáles no.
 *
 * La bandera `\Seen` es lo único que hace recuperable un apagón del sondeo. El
 * 5 de agosto de 2026 el buzón estuvo más de un día sin abrirse y la respuesta
 * que un Approver mandó en mitad del apagón se aplicó igual, en el primer
 * sondeo sano, porque nadie la había marcado leída: un mensaje se marca leído
 * **sólo cuando ya se hizo algo con él**. Un mensaje que no se pudo descargar,
 * uno cuyo Approver no está autorizado o uno cuyo procesamiento reventó siguen
 * sin leer, y el siguiente sondeo los vuelve a ver.
 *
 * La regla vive aquí y no dentro de la acción de IMAP para que se pueda pinchar
 * con una prueba: cambiarla por descuido —marcar leído nada más descargar, que
 * es lo cómodo— convertiría el próximo apagón en pérdida de respuestas.
 */

/** Qué acabó pasando con un mensaje descargado en un sondeo. */
export type ReplyDisposition =
  /** Se aplicó: hay Outcome, o se le contestó al Approver lo que no se pudo aplicar. */
  | 'applied'
  /** Otra respuesta al mismo folio llegó antes; gana la primera. */
  | 'superseded'
  /** La Replacement Request ya tenía Outcome; se le contesta al Approver. */
  | 'already_settled'
  /** El folio del asunto no corresponde a ninguna Replacement Request. */
  | 'request_not_found'
  /** El intérprete o la mutación fallaron. Se reintenta en el siguiente sondeo. */
  | 'apply_failed'
  /** El remitente no está en la lista de Approvers. */
  | 'sender_refused'
  /** No menciona ninguna Replacement Request: no es para esta tubería. */
  | 'not_ours';

/**
 * Marcar leído es afirmar que el mensaje ya no hace falta. Sólo lo es cuando el
 * sondeo llegó a una decisión sobre él —aplicarlo, descartarlo por duplicado o
 * contestarle que la Request ya estaba resuelta—; dejarlo leído en cualquier
 * otro caso pierde una respuesta de un Approver sin que nadie se entere.
 */
export function marksMessageSeen(disposition: ReplyDisposition): boolean {
  switch (disposition) {
    case 'applied':
    case 'superseded':
    case 'already_settled':
      return true;
    case 'request_not_found':
    case 'apply_failed':
    case 'sender_refused':
    case 'not_ours':
      return false;
  }
}
