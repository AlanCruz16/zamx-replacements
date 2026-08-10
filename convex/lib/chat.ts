/**
 * Lo que hay que saber de una conversación del chat para poder guardarla y
 * reanudarla, sin base de datos ni red delante.
 *
 * Vive aquí, en un módulo sin dependencias, porque las mismas dos preguntas se
 * hacen desde tres sitios que no comparten runtime: el route handler de Next
 * antes de llamar al modelo, la mutación de Convex que escribe el turno, y el
 * navegador al pintar la conversación reanudada. Escrita tres veces, la
 * respuesta a «¿esta conversación ya envió una Replacement Request?» acabaría
 * divergiendo, y de esa pregunta depende que no se envíe dos veces.
 *
 * El formato de los mensajes es el del AI SDK v6: `parts[]`, no `content`. Ver
 * `AI_SDK_V6_GUIDE.md` — el texto, las llamadas a herramienta y su estado viven
 * todos como parts, y aplanarlos pierde justo la part con la que se le confirma
 * al Customer su folio.
 */

/** La herramienta cuyo disparo cierra una conversación. */
export const SUBMIT_QUOTE_TOOL = 'submit_quote_request';

/** Los roles que se guardan, que son los del `UIMessage` del AI SDK. */
export type StoredRole = 'user' | 'assistant' | 'system';

const STORED_ROLES: readonly string[] = ['user', 'assistant', 'system'];

/** Una fila de `chat_messages`. */
export type StoredMessage = {
  messageId: string;
  role: StoredRole;
  parts: unknown[];
};

/**
 * Un mensaje tal y como llega del AI SDK. Se tipa flojo a propósito: lo que
 * entra viene de la red o del propio SDK, y estrecharlo aquí sólo obligaría a
 * castearlo en cada llamador.
 */
export type TranscriptMessage = {
  id?: string;
  role?: string;
  parts?: readonly unknown[];
};

/**
 * De qué herramienta es una part, mirando los dos sitios donde v6 pone el
 * nombre: el propio tipo (`tool-${nombre}`) en una herramienta estática, y
 * `toolName` cuando la part es dinámica. El `part.toolInvocation` de v4/v5 ya
 * no existe.
 */
export function toolNameOfPart(part: unknown): string | undefined {
  if (part === null || typeof part !== 'object') return undefined;

  const { type, toolName } = part as { type?: unknown; toolName?: unknown };

  if (type === 'dynamic-tool') {
    return typeof toolName === 'string' ? toolName : undefined;
  }

  if (typeof type === 'string' && type.startsWith('tool-')) {
    return type.slice('tool-'.length);
  }

  return undefined;
}

/**
 * El envío que esta conversación ya produjo.
 *
 * `quoteId` puede faltar: que hubo envío y *cuál* Replacement Request salió de
 * él son dos hechos, y el segundo depende de que la salida de la herramienta lo
 * traiga. `messageId` nombra el mensaje que lo lleva, que es lo que permite
 * reconocer el mismo envío cuando el transcript vuelve a llegar.
 */
export type Submission = { quoteId?: string; messageId?: string };

/**
 * El envío que esta conversación ya produjo, o `undefined` si no produjo
 * ninguno.
 *
 * Se lee del propio transcript y no de un argumento aparte para que el registro
 * y el estado no puedan contradecirse: lo que cierra la conversación es
 * exactamente la part que se guarda en ella. Es además la única respuesta a esa
 * pregunta, y la comparten la pantalla, el route handler y Convex — dos copias
 * que se separaran harían que discreparan sobre si el Customer ya envió.
 *
 * Exige salida **y** éxito. Un `success: false` es un envío que Convex rechazó,
 * y no existe ninguna Replacement Request detrás: cerrar la conversación ahí
 * dejaría al Customer sin poder reintentar lo que nunca llegó a registrarse.
 */
export function findSubmission(messages: readonly TranscriptMessage[]): Submission | undefined {
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (toolNameOfPart(part) !== SUBMIT_QUOTE_TOOL) continue;

      const { state, output } = part as { state?: unknown; output?: unknown };
      if (state !== 'output-available') continue;
      if (output === null || typeof output !== 'object') continue;

      const { success, quoteId } = output as { success?: unknown; quoteId?: unknown };
      if (success !== true) continue;

      return {
        ...(typeof quoteId === 'string' ? { quoteId } : {}),
        ...(typeof message.id === 'string' ? { messageId: message.id } : {}),
      };
    }
  }

  return undefined;
}

/**
 * Los mensajes que se guardan, con sus `parts[]` intactas.
 *
 * Un mensaje sin `id` se descarta: el `id` es lo que permite reescribir un
 * mensaje ya guardado en vez de duplicarlo, y sin él cada reenvío del mismo
 * turno dejaría otra copia en la tabla.
 */
/**
 * El camino de vuelta: lo guardado, con la forma que entiende el AI SDK. El
 * identificador pasa de `messageId` a `id`, que es donde lo lee `useChat` —y
 * donde lo buscan las funciones de este módulo.
 */
export function toTranscriptMessages(
  stored: readonly StoredMessage[]
): { id: string; role: StoredRole; parts: unknown[] }[] {
  return stored.map((m) => ({ id: m.messageId, role: m.role, parts: m.parts }));
}

export function toStoredMessages(messages: readonly TranscriptMessage[]): StoredMessage[] {
  const stored: StoredMessage[] = [];

  for (const message of messages) {
    if (typeof message.id !== 'string' || message.id === '') continue;
    if (typeof message.role !== 'string' || !STORED_ROLES.includes(message.role)) continue;

    stored.push({
      messageId: message.id,
      role: message.role as StoredRole,
      parts: [...(message.parts ?? [])],
    });
  }

  return stored;
}
