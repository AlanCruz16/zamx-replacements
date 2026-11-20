import { v } from 'convex/values';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { findSubmission, toTranscriptMessages, type Submission } from './lib/chat';

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

/** Cuántas filas con el mismo `messageId` se miran como mucho. */
const ROWS_PER_MESSAGE_ID = 8;

/**
 * Si un transcript continúa alguna conversación **enviada** de este Customer:
 * alguno de sus mensajes ya está guardado en una conversación con
 * `submittedAt`.
 *
 * Es la regla de solo lectura leída de lo guardado, no de la copia que trae el
 * navegador, que puede ser vieja (una pestaña que no vio el envío), estar
 * editada (sin la respuesta que envió) o haberse cargado antes de que el turno
 * que envía terminara de guardarse (si el envío ya quedó guardado cuando llega
 * el mensaje siguiente; antes no hay nada guardado que lo diga). La aplican igual la ruta, antes de llamar al
 * modelo, y `persistTurn`, antes de escribir, para que no puedan discrepar
 * sobre si una conversación está cerrada.
 *
 * Cuenta cualquier conversación enviada, no sólo la última: con otra ya
 * abierta, la pestaña vieja sigue continuando la enviada, y `persistTurn`
 * metería sus mensajes en la nueva por ser la abierta.
 *
 * Sólo cuenta lo de este Customer. Un id que está guardado en la conversación
 * de otro contesta lo mismo que uno que no existe, así que preguntar no revela
 * nada de nadie.
 */
async function continuesAnySubmitted(
  ctx: QueryCtx,
  userId: Id<'users'>,
  messageIds: readonly string[]
): Promise<boolean> {
  return (await conversationsContinuedBy(ctx, userId, messageIds)).some(isSubmitted);
}

/**
 * Las conversaciones de este Customer que un transcript continúa: las que ya
 * guardan alguno de sus mensajes. Lo de otro Customer no aparece, así que un id
 * guardado en una conversación ajena cuenta igual que uno que no existe.
 */
async function conversationsContinuedBy(
  ctx: QueryCtx,
  userId: Id<'users'>,
  messageIds: readonly string[]
): Promise<Doc<'chat_sessions'>[]> {
  const found = new Map<Id<'chat_sessions'>, Doc<'chat_sessions'> | null>();

  for (const messageId of new Set(messageIds)) {
    const rows = await ctx.db
      .query('chat_messages')
      .withIndex('by_message_id', (q) => q.eq('messageId', messageId))
      // Un id vive en una sola conversación; el margen cubre las filas que la
      // pestaña vieja copió en otra antes de esta regla.
      .take(ROWS_PER_MESSAGE_ID);

    for (const { sessionId } of rows) {
      if (found.has(sessionId)) continue;
      const session = await ctx.db.get(sessionId);
      found.set(sessionId, session !== null && session.userId === userId ? session : null);
    }
  }

  return [...found.values()].filter((s): s is Doc<'chat_sessions'> => s !== null);
}

/**
 * Ticket 03: la conversación que se cierra con la Replacement Request que se
 * está creando, en la misma transacción que la crea.
 *
 * Antes la conversación sólo contaba como enviada cuando `persistTurn` guardaba
 * el turno, al acabar el stream. Un mensaje que llegaba en ese hueco —una
 * recarga temprana, una segunda pestaña, un doble envío— pasaba el 409, y el
 * modelo podía crear otra Request y mandar otro correo al Approver. Ahora
 * `quotes.create` la pide antes de insertar y la cierra después: como Convex
 * corre cada mutación como una transacción serializable, de dos envíos que
 * compiten sólo el primero crea la Request, y el segundo encuentra la
 * conversación cerrada.
 *
 * Lanza si los ids continúan una conversación ya enviada de este Customer —la
 * misma regla del ticket 02—. Si no, devuelve la conversación a la que
 * pertenecen esos ids, o `null` si todavía no hay ninguna guardada: un envío en
 * el primer turno, que `persistTurn` cierra al crearla. Se cierra la de los ids
 * y no «la abierta», porque dos envíos que compiten verían los dos la misma
 * abierta, y en el primer turno no hay ninguna.
 */
export async function conversationToClose(
  ctx: QueryCtx,
  userId: Id<'users'>,
  messageIds: readonly string[]
): Promise<Doc<'chat_sessions'> | null> {
  const continued = await conversationsContinuedBy(ctx, userId, messageIds);
  if (continued.some(isSubmitted)) {
    throw new Error(ALREADY_SUBMITTED);
  }

  // Un id vive en una sola conversación; si una pestaña vieja los repartió en
  // varias, la más reciente es la que el Customer tiene delante.
  return continued.reduce<Doc<'chat_sessions'> | null>(
    (latest, s) => (latest === null || s._creationTime > latest._creationTime ? s : latest),
    null
  );
}

/** Cierra una conversación con la Replacement Request que produjo. */
export async function closeConversation(
  ctx: MutationCtx,
  sessionId: Id<'chat_sessions'>,
  quoteId: Id<'quotes'>
): Promise<void> {
  await ctx.db.patch(sessionId, { submittedAt: Date.now(), submittedQuoteId: quoteId });
}

/** Por qué se niega lo que intenta continuar una conversación ya enviada. */
const ALREADY_SUBMITTED = 'La conversación ya envió su Replacement Request.';

/**
 * La conversación que cerró el turno que se está guardando, si es eso lo que
 * llega.
 *
 * Desde el ticket 03 la conversación se cierra al crearse la Replacement
 * Request, antes de que el turno que la crea termine de guardarse. Ese turno
 * continúa entonces una conversación ya enviada, y la regla del ticket 02 lo
 * rechazaría: la respuesta del modelo se perdería otra vez (ticket 01).
 *
 * Se le deja pasar sólo a él. Lo reconoce el envío que trae: nombra la
 * Replacement Request con la que se cerró la conversación, y el mensaje que lo
 * lleva todavía no está guardado en ella. Un reenvío de la conversación ya
 * guardada trae el mismo envío, pero con ese mensaje ya dentro, y se sigue
 * rechazando; el turno que perdió la carrera no trae ningún envío con éxito, o
 * trae otro.
 */
async function closedByThisTurn(
  ctx: QueryCtx,
  submitted: readonly Doc<'chat_sessions'>[],
  submission: Submission | undefined
): Promise<Doc<'chat_sessions'> | null> {
  if (submitted.length !== 1 || submission === undefined) return null;

  const [session] = submitted;
  if (session.submittedQuoteId === undefined || submission.quoteId !== session.submittedQuoteId) {
    return null;
  }

  const { messageId } = submission;
  if (messageId === undefined) return null;

  const stored = await ctx.db
    .query('chat_messages')
    .withIndex('by_message_id', (q) => q.eq('messageId', messageId))
    .take(ROWS_PER_MESSAGE_ID);

  return stored.some((m) => m.sessionId === session._id) ? null : session;
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
 * Si el transcript que el navegador acaba de mandar continúa una conversación
 * ya enviada de este Customer. La ruta del chat lo pregunta antes de llamar al
 * modelo, y responde 409 si la respuesta es sí.
 *
 * Es interna porque recibe la identidad como argumento: quien la pasa es el
 * servidor de Next, que la saca de Clerk, nunca del cuerpo de la petición. Una
 * identidad sin Customer no tiene conversaciones, así que no continúa ninguna.
 */
export const continuesSubmittedConversation = internalQuery({
  args: {
    clerkId: v.string(),
    messageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await userByClerkId(ctx, args.clerkId);
    if (!user) return false;

    return await continuesAnySubmitted(ctx, user._id, args.messageIds);
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

    // Un transcript que continúa una conversación ya cerrada, traiga o no el
    // envío: el reenvío de la conversación entera, una pestaña que no vio el
    // envío, un cuerpo al que le quitaron la respuesta que envió. Guardarlo
    // metería sus mensajes en la conversación abierta —o abriría otra con las
    // mismas piezas y, con el envío dentro, la cerraría en el acto—. Se
    // reconoce por los mensajes ya guardados y no por «la última está
    // cerrada», porque eso confundiría un envío nuevo y legítimo en el primer
    // turno de la conversación siguiente con un reenvío.
    //
    // La ruta aplica esta misma regla antes de llamar al modelo, así que llegar
    // aquí es un error, no un caso que haya que absorber en silencio.
    //
    // La excepción es el turno que la cerró (ticket 03): `quotes.create` cierra
    // la conversación antes de que ese turno termine de guardarse.
    const submission = findSubmission(toTranscriptMessages(args.messages));
    const submitted = (
      await conversationsContinuedBy(
        ctx,
        user._id,
        args.messages.map((m) => m.messageId)
      )
    ).filter(isSubmitted);
    const closedByTurn = await closedByThisTurn(ctx, submitted, submission);

    if (submitted.length > 0 && closedByTurn === null) {
      throw new Error(ALREADY_SUBMITTED);
    }

    const now = Date.now();
    const latest = await latestSession(ctx, user._id);
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
      closedByTurn?._id ??
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

    // Ya cerrada con su Replacement Request al crearse ésta: no hay nada más
    // que apuntar, y reescribir `submittedAt` movería la hora del envío.
    if (submission === undefined || closedByTurn !== null) return null;

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
