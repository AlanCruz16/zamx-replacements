import { v } from 'convex/values';
import { internalMutation, mutation, query, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { findSubmission, toTranscriptMessages } from './lib/chat';

/**
 * Dónde vive una conversación del chat entre una pestaña y la siguiente
 * (ticket 21).
 *
 * Antes vivía entera en la memoria del navegador, dentro de `useChat`: cerrar
 * la pestaña le costaba al Customer los números de parte y los Modelos que ya
 * había tecleado y que ya se le habían validado.
 *
 * Las dos reglas de autorización del ticket 06, cada una donde corresponde:
 *
 * - **Leer** es una superficie del Customer, así que `currentConversation`
 *   autoriza sobre la identidad de Clerk y sólo puede devolver lo suyo: no
 *   acepta ningún identificador de sesión, de modo que no existe la petición
 *   con la que pedir la conversación de otro.
 * - **Escribir** es camino máquina a máquina. No por desconfiar del Customer
 *   con sus propios datos, sino porque quien sabe qué dijo el modelo y si la
 *   herramienta disparó de verdad es el servidor. Si el navegador fuera el que
 *   reporta el envío, bastaría con que no lo reportara para que la conversación
 *   siguiera abierta y `submit_quote_request` pudiera disparar por segunda vez
 *   sobre las mismas piezas.
 */

/**
 * Un mensaje tal y como se guarda: el `parts[]` del AI SDK v6 —no un `content`
 * aplanado— bajo el `id` con el que el SDK lo nombra.
 */
const messageValidator = v.object({
  messageId: v.string(),
  role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
  /**
   * `v.any()` a propósito: las parts son del AI SDK, no nuestras. Un validador
   * que las enumerara se quedaría corto en cuanto el SDK añadiera un tipo de
   * part, y el turno se perdería entero por no saber describir un trozo que
   * sólo teníamos que devolver tal cual.
   */
  parts: v.array(v.any()),
});

/** La última conversación de un Customer, esté abierta o ya enviada. */
async function latestSession(
  ctx: QueryCtx,
  userId: Id<'users'>
): Promise<Doc<'chat_sessions'> | null> {
  const [latest] = await ctx.db
    .query('chat_sessions')
    .withIndex('by_user_id', (q) => q.eq('userId', userId))
    .order('desc')
    .take(1);

  return latest ?? null;
}

/** Una conversación que ya envió su Replacement Request no admite más mensajes. */
function isSubmitted(session: Doc<'chat_sessions'>): boolean {
  return session.submittedAt !== undefined;
}

/** Una conversación de la que el Customer se salió sin enviar nada. */
function isAbandoned(session: Doc<'chat_sessions'>): boolean {
  return session.abandonedAt !== undefined;
}

/**
 * La conversación que el Customer tiene a medias: ni enviada ni abandonada. Es
 * la única a la que se le añaden mensajes, y no haberla es lo que hace que el
 * turno siguiente abra una nueva.
 */
function openSession(session: Doc<'chat_sessions'> | null): Doc<'chat_sessions'> | null {
  if (session === null) return null;
  return isSubmitted(session) || isAbandoned(session) ? null : session;
}

/**
 * Si un transcript continúa una conversación concreta: alguno de sus mensajes
 * ya está guardado ahí. Es lo que distingue el turno que se quedó en vuelo de
 * uno nuevo y legítimo, sin que el navegador tenga que decir a cuál pertenece.
 */
async function continues(
  ctx: QueryCtx,
  sessionId: Id<'chat_sessions'>,
  messages: { messageId: string }[]
): Promise<boolean> {
  const saved = new Set((await messagesOf(ctx, sessionId)).map((m) => m.messageId));
  return messages.some((m) => saved.has(m.messageId));
}

/** Los mensajes de una conversación, en el orden en que se dijeron. */
async function messagesOf(ctx: QueryCtx, sessionId: Id<'chat_sessions'>) {
  return await ctx.db
    .query('chat_messages')
    .withIndex('by_session_id', (q) => q.eq('sessionId', sessionId))
    .collect();
}

/** El Customer que hay detrás de una identidad de Clerk. */
async function userByClerkId(ctx: QueryCtx, clerkId: string) {
  return await ctx.db
    .query('users')
    .withIndex('by_clerk_id', (q) => q.eq('clerkId', clerkId))
    .unique();
}

/**
 * La última conversación del Customer, con sus mensajes en el orden en que se
 * dijeron. Devuelve `null` si nunca habló —y también en los dos instantes fríos
 * que se explican más abajo.
 *
 * Una conversación ya enviada se devuelve igual: es de **solo lectura**, no
 * invisible. Dentro de ella va la tool part con la que se le confirmó su folio,
 * y esconderla haría que un refresco le costara justo la confirmación que el
 * ticket existe para que no se pierda. Que ya no admite mensajes se ve en el
 * propio transcript —lo mira `findSubmission`, igual que el servidor—, así que
 * no hace falta que viaje aparte.
 *
 * También devuelve `null` mientras no haya todavía a quién contestarle: sin
 * identidad de Clerk, o con una identidad cuyo Customer aún no aterrizó por el
 * webhook. Antes lanzaba en esos dos instantes, y lanzar era el defecto: la
 * pantalla monta esta consulta con el handshake de Clerk en vuelo, así que la
 * excepción salía dentro de un render de React —que no la lee como una negativa
 * sino como una caída— y el Customer acababa en una página de error de la que
 * no volvía. La regla de acceso no se ha aflojado: quien no se ha identificado
 * sigue sin ver ninguna conversación, y no ver nada no revela nada que lanzar
 * ocultara. Lo que cambia es sólo el mecanismo, y así queda igual al de su
 * vecina `users.current` en la misma pantalla: la espera se dice contestando
 * nada, que es un estado que la pantalla ya sabe pintar.
 *
 * Sólo la lectura. Escribir sigue rechazando a una identidad desconocida —ahí
 * negarse no le cuesta nada al Customer y protege lo que se guarda.
 */
export const currentConversation = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await userByClerkId(ctx, identity.subject);
    if (!user) return null;

    const session = await latestSession(ctx, user._id);
    if (session === null) return null;

    // Abandonada: sigue guardada, pero ya no es la conversación de nadie. Sin
    // esto «Inicio» no llevaría a ningún sitio —la pantalla la resembraría
    // igual— y el Customer seguiría atrapado dentro de ella.
    if (isAbandoned(session)) return null;

    return { messages: toTranscriptMessages(await messagesOf(ctx, session._id)) };
  },
});

/**
 * El Customer se sale de la conversación que tiene a medias.
 *
 * Hasta aquí la única salida de una conversación era enviar la Replacement
 * Request. La pantalla resiembra siempre la última (ticket 21), así que quien
 * abría una y se arrepentía se quedaba dentro: «Inicio» recargaba la misma
 * pantalla y la misma conversación volvía a aparecer.
 *
 * No borra nada. Lo que se dijo ahí es del Customer y se queda guardado; lo que
 * cambia es que deja de ser la actual, de modo que la pantalla ya no la
 * resiembra y el mensaje siguiente abre otra.
 *
 * Sólo toca la que está a medias. Una conversación ya enviada no se reescribe:
 * ahí hay una Replacement Request y su folio, y taparlos con un abandono
 * perdería justo la confirmación que el Customer podría estar buscando. No
 * haber conversación abierta tampoco es un error —tocar «Inicio» dos veces, o
 * tocarlo sin haber dicho nada, no es nada que reportar—, así que no pasa nada
 * y no se dice nada.
 *
 * Escribe, y por eso exige identidad, como todo lo que escribe aquí: sin ella
 * rechaza. Es lo contrario que la lectura de al lado, y a propósito —negarse a
 * escribir para quien no se ha identificado no le cuesta nada al Customer,
 * mientras que negarse a leer le costaba la pantalla entera (ticket 01)—. Y sólo
 * alcanza lo suyo: no acepta ningún identificador de sesión, así que no existe
 * la petición con la que abandonar la conversación de otro.
 */
export const abandonCurrentConversation = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('No autenticado');
    }

    const user = await userByClerkId(ctx, identity.subject);
    if (!user) {
      throw new Error('Usuario no encontrado en la base de datos.');
    }

    const open = openSession(await latestSession(ctx, user._id));
    if (open === null) return null;

    await ctx.db.patch(open._id, { abandonedAt: Date.now() });
    return null;
  },
});

/**
 * Guarda el turno recién terminado y, si en él disparó `submit_quote_request`,
 * cierra la conversación.
 *
 * Recibe el transcript entero, no sólo lo nuevo: es lo que el AI SDK entrega al
 * acabar el stream, y reconciliar por el `id` del mensaje sale más barato que
 * hacer que el servidor lleve la cuenta de por dónde iba. Un mensaje que ya
 * está se reescribe en su sitio, que es además lo que hace que un turno
 * reenviado no deje copias.
 *
 * Que la conversación se cierre se **deduce del propio transcript** en vez de
 * recibirse como argumento, para que el registro y el estado no puedan
 * contradecirse: lo que la cierra es exactamente la part que se guarda en ella.
 */
export const persistTurn = internalMutation({
  args: {
    clerkId: v.string(),
    messages: v.array(messageValidator),
  },
  handler: async (ctx, args) => {
    const user = await userByClerkId(ctx, args.clerkId);
    if (!user) {
      throw new Error('Usuario no encontrado en la base de datos.');
    }

    const submission = findSubmission(toTranscriptMessages(args.messages));
    const now = Date.now();
    const latest = await latestSession(ctx, user._id);

    // El reenvío de una conversación ya cerrada: el mismo mensaje de envío que
    // ella guarda vuelve a llegar. Guardarlo abriría otra conversación con las
    // mismas piezas y la cerraría en el acto, una copia por reenvío. Se
    // reconoce por el mensaje y no por «hay envío y la última está cerrada»,
    // porque eso confundiría el reenvío con un envío nuevo y legítimo en el
    // primer turno de la conversación siguiente.
    //
    // No es alcanzable desde la pantalla —el route handler rechaza ese
    // transcript antes de llegar aquí—, y por eso mismo llegar aquí es un
    // error, no un caso que haya que absorber en silencio.
    if (latest !== null && isSubmitted(latest) && submission?.messageId !== undefined) {
      const before = await messagesOf(ctx, latest._id);
      if (before.some((m) => m.messageId === submission.messageId)) {
        throw new Error('La conversación ya envió su Replacement Request.');
      }
    }

    const open = openSession(latest);

    // El turno que terminó después de que el Customer se saliera. El stream
    // seguía en vuelo cuando «Inicio» abandonó la conversación, así que este
    // transcript llega cuando ya no hay ninguna abierta donde ponerlo.
    //
    // Sin esto abría una conversación nueva y le copiaba dentro todo lo dicho
    // en la abandonada, que pasaba a ser la actual: la pantalla resembraba en
    // la carga siguiente justo la conversación de la que el Customer acababa de
    // salirse —el ticket 21 otra vez—, y además con los mensajes duplicados en
    // dos sesiones. Lo mismo ocurría con dos pestañas abiertas.
    //
    // Va a su conversación de origen, que se reconoce por los mensajes que ya
    // guarda y no por ser la última. Guardarlo ahí no la resucita: abandonada
    // sigue, y `currentConversation` no devuelve una abandonada. Lo dicho en
    // ella se conserva —también la respuesta que el modelo alcanzó a dar— sin
    // que vuelva a ser la conversación de nadie.
    const abandoned =
      open === null && latest !== null && isAbandoned(latest) && !isSubmitted(latest)
        ? latest
        : null;
    const inFlight =
      abandoned !== null && (await continues(ctx, abandoned._id, args.messages)) ? abandoned : null;

    const sessionId =
      open?._id ??
      inFlight?._id ??
      (await ctx.db.insert('chat_sessions', { userId: user._id, lastMessageAt: now }));

    const byMessageId = new Map((await messagesOf(ctx, sessionId)).map((m) => [m.messageId, m]));

    for (const message of args.messages) {
      const already = byMessageId.get(message.messageId);
      if (already === undefined) {
        await ctx.db.insert('chat_messages', { sessionId, ...message });
      } else {
        await ctx.db.patch(already._id, { role: message.role, parts: message.parts });
      }
    }

    await ctx.db.patch(sessionId, { lastMessageAt: now });

    if (submission === undefined) return null;

    // El identificador viene dentro de la salida de una herramienta, es decir
    // de texto que viajó por la red. Se apunta sólo si nombra una Replacement
    // Request de este mismo Customer; si no, la conversación se cierra igual
    // —el envío ocurrió— pero sin apuntar a un registro que no es suyo.
    const quoteId =
      submission.quoteId === undefined ? null : ctx.db.normalizeId('quotes', submission.quoteId);
    const quote = quoteId === null ? null : await ctx.db.get(quoteId);
    const own = quote !== null && quote.userId === user._id;

    await ctx.db.patch(sessionId, {
      submittedAt: now,
      ...(own ? { submittedQuoteId: quote._id } : {}),
    });

    return null;
  },
});
