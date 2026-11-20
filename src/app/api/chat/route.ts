import {
  streamText,
  tool,
  convertToModelMessages,
  createIdGenerator,
  type UIMessage,
  stepCountIs,
} from 'ai';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { QuoteRequestTemplate } from '@/emails/QuoteRequestTemplate';
import {
  consumeChatRateLimit,
  continuesSubmittedConversation,
  createReplacementRequest,
  persistChatTurn,
  saveCustomerMessages,
} from '@/lib/internal-api';
import { SUPPORT_SENDER } from '@/lib/addresses';
import { createFailoverModel } from '@/lib/model-failover';
import { messagesFor, resolveLanguage, type Language } from '@/lib/messages';
import { findSubmission, toStoredMessages } from '../../../../convex/lib/chat';

const resend = new Resend(process.env.RESEND_API_KEY);

/** El `id` de cada respuesta del modelo, que es el que se guarda y el que recibe el navegador. */
const generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

// Configura el tiempo máximo de espera para la API (útil en Edge)
export const maxDuration = 30;

/**
 * Lo que se le dice al Customer que llamó demasiado deprisa, en su idioma y con
 * el tiempo que le queda. `DefaultChatTransport` convierte el cuerpo de una
 * respuesta no-2xx en el `message` del error que recibe `useChat`, así que este
 * texto es literalmente lo que se pinta en el chat: tiene que ser una frase
 * para una persona, no un código.
 */
function tooManyRequests(retryAfterMs: number, language: Language): Response {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));

  return new Response(messagesFor(language).chatErrors.tooManyRequests(minutes), {
    status: 429,
    headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
  });
}

/**
 * Lo que se le dice al Customer que sigue escribiendo en una conversación que
 * ya produjo su Replacement Request. Como el 429 de arriba, este texto es
 * literalmente lo que se pinta en el chat, así que es una frase para una
 * persona y le dice qué hacer.
 */
function conversationAlreadySubmitted(language: Language): Response {
  return new Response(messagesFor(language).chatErrors.alreadySubmitted, { status: 409 });
}

export async function POST(req: Request) {
  const { messages, data } = await req.json();
  const userName = data?.userName || 'Cliente';
  // El idioma llega del navegador, así que se valida en vez de creerse: lo que
  // no reconocemos cae al español, igual que el alta del Customer.
  const language = resolveLanguage(data?.language);
  const { userId } = await auth();

  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }
  const clerkId = userId;

  // El techo de gasto, antes de cualquier llamada al modelo. La cuenta vive en
  // Convex y no aquí: esta ruta es una función serverless, y un contador en su
  // memoria ni sobrevive a la invocación ni se comparte entre instancias.
  let rateLimit;
  try {
    rateLimit = await consumeChatRateLimit(clerkId);
  } catch (error) {
    // Si no se puede contar, no se gasta. Fallar abierto convertiría cualquier
    // tropiezo de Convex en la ausencia del techo, que es justo lo que no puede
    // pasar sin que nadie se entere.
    console.error('No se pudo consultar el límite de peticiones del chat:', error);
    return new Response(messagesFor(language).chatErrors.unavailable, { status: 503 });
  }

  if (!rateLimit.allowed) {
    return tooManyRequests(rateLimit.retryAfterMs, language);
  }

  // Una conversación que ya disparó `submit_quote_request` es de solo lectura
  // (ticket 21): se sigue leyendo, pero no admite más mensajes. El transcript
  // lo manda el navegador, así que es aquí donde eso se hace cumplir — sin esta
  // comprobación, reenviar una conversación enviada haría que la herramienta
  // disparase por segunda vez sobre las mismas piezas.
  if (findSubmission(messages ?? []) !== undefined) {
    return conversationAlreadySubmitted(language);
  }

  // Lo que se guarda de este transcript. Sus ids los usan las dos preguntas a
  // Convex: si continúa una conversación enviada, y cuál cerrar si el modelo
  // envía.
  const incoming = toStoredMessages(messages ?? []);
  const messageIds = incoming.map((m) => m.messageId);

  // `findSubmission` sólo ve la copia del navegador, y esa copia puede no traer el
  // envío: una pestaña que no lo vio, un cuerpo editado, una recarga que llegó
  // antes de que el turno que envía terminara de guardarse. Así que también se
  // le pregunta a Convex si alguno de estos mensajes ya está guardado en una
  // conversación enviada de este Customer. Es la misma regla con la que
  // `persistTurn` se niega a guardar, de modo que no pueden discrepar.
  let continuesSubmitted;
  try {
    continuesSubmitted = await continuesSubmittedConversation(clerkId, messageIds);
  } catch (error) {
    // Como con el límite: si no se puede saber, no se llama al modelo.
    console.error('No se pudo comprobar si la conversación ya se envió:', error);
    return new Response(messagesFor(language).chatErrors.unavailable, { status: 503 });
  }

  if (continuesSubmitted) {
    return conversationAlreadySubmitted(language);
  }

  // Lo que el Customer escribió se guarda antes de que el modelo hable (ticket
  // 05). Así una recarga a media respuesta, o un stream que muere, enseña lo
  // que dijo y no un chat vacío; y en el primer turno la conversación ya existe
  // cuando `quotes.create` la busca para cerrarla. Al acabar el stream,
  // `persistTurn` sólo añade la respuesta.
  let saved;
  try {
    saved = await saveCustomerMessages({ clerkId, messages: incoming });
  } catch (error) {
    // Como arriba: sin la conversación guardada, una recarga la perdería.
    console.error('No se pudo guardar lo que escribió el Customer:', error);
    return new Response(messagesFor(language).chatErrors.unavailable, { status: 503 });
  }

  // Se cerró entre la pregunta de arriba y ésta: otra pestaña envió.
  if (saved.alreadySubmitted) {
    return conversationAlreadySubmitted(language);
  }

  const systemPrompt = `
Eres un asistente experto en ventas y cotizaciones de ZIEHL-ABEGG México.
Tu nombre no importa, representas a ZIEHL-ABEGG.
El cliente se llama ${userName}.
Su idioma preferido es ${language === 'es' ? 'Español' : 'Inglés'}. Responde en este idioma de manera sumamente profesional, amable y corporativa.

OBJETIVO PRINCIPAL:
Debes recopilar EXACTAMENTE 4 datos del cliente para poder generar una cotización de un ventilador de reemplazo. NO aceptes datos que parezcan inválidos o falsos:
1. Número de parte (partNumber): DEBE ser un número de típicamente 6 dígitos (ej: "162562"), a veces incluye un sufijo (ej: "162562/A01"). Si el cliente proporciona algo que no parece un número de parte válido, pídele amablemente que lo verifique.
2. Modelo (model): Alfanumérico, que incluye el prefijo. REGLA ESTRICTA: Debe comenzar invariablemente con 2 letras seguidas de números (ej: "FN050-VDK.4I.V7P1", "GR31-something"). Si el cliente ingresa algo distinto, infórmale que el modelo parece estar mal estructurado y pídele que lo verifique en su placa de datos.
3. Cantidad (quantity): Número de piezas requeridas. Debe ser un número lógico y mayor a 0.
4. Lugar de entrega (deliveryLocation): Ciudad, estado o dirección aproximada en México. Si el lugar no parece un destino válido en México, pide aclaración.

INSTRUCCIONES CLAVE Y MANEJO DE ERRORES:
- VALIDACIÓN ESTRICTA: Eres el filtro principal. Si el usuario ingresa texto sin sentido (ej. "asdfg"), responde de forma inteligente indicando que no has entendido y vuelve a pedir la información de la cotización.
- RESPUESTAS EVASIVAS: Si el cliente intenta cambiar de tema, hace preguntas técnicas fuera de tu conocimiento, o se niega a dar información, reitera cortésmente que tu función es generar solicitudes de cotización y que para ello requieres los 4 datos mencionados.
- INFORMACIÓN INCOMPLETA: Si el cliente da información a medias (ej. solo el número de parte), confirma lo que recibiste y solicita específicamente lo que falta.
- ASISTENCIA AL CLIENTE: Si el cliente no sabe dónde encontrar el número de parte o el modelo, o pide ayuda con la placa de datos, TIENES PROHIBIDO intentar explicarlo con texto. ES OBLIGATORIO que invoques la herramienta "show_dataplate_guide". SOLO invoca la herramienta y NO escribas explicaciones sobre la placa.
- Pide los datos de forma conversacional, no como un interrogatorio policial, pero mantén el control de la conversación hacia tu objetivo.
- REGLA CRÍTICA: NO proporciones precios, costos ni tiempos de entrega aproximados bajo NINGUNA circunstancia, incluso si el cliente insiste.
- Cuando tengas TODOS los datos de al menos un producto (validados), y el cliente confirme explícitamente que no agregará más, DEBES invocar "submit_quote_request" con todos los productos.
- DESPUÉS DE "submit_quote_request": la interfaz ya le muestra al cliente una tarjeta con su folio y con el aviso de que un vendedor revisará su solicitud. NO repitas el folio, ni el aviso, ni el resumen de los productos. Despídete en UNA sola frase breve y cortés, y nada más.
  `;

  // Convert incoming UIMessages to ModelMessages using the SDK's built-in converter.
  // This properly handles parts-based messages, tool calls, and all message types.
  const coreMessages = await convertToModelMessages(messages as UIMessage[]);

  const result = streamText({
    // Uno nuevo por petición: si este turno cae a Groq, sus pasos siguientes se
    // quedan en Groq, y el mensaje siguiente vuelve a probar Gemini (ADR-0003).
    model: createFailoverModel(),
    system: systemPrompt,
    messages: coreMessages,
    tools: {
      submit_quote_request: tool({
        description:
          'Utiliza esta herramienta EXCLUSIVAMENTE cuando el cliente haya confirmado TODOS los datos de los productos que desea cotizar y haya indicado explícitamente que NO agregará más equipos.',
        inputSchema: z.object({
          products: z
            .array(
              z.object({
                partNumber: z
                  .string()
                  .describe('El número de parte exacto extraído, ej: "162562" o "162562/A01"'),
                model: z.string().describe('El modelo alfanumérico exacto, ej: "MK137-4DZ.07.U"'),
                quantity: z.number().int().positive().describe('La cantidad de piezas solicitadas'),
                deliveryLocation: z.string().describe('El lugar de entrega acordado'),
              })
            )
            .min(1),
        }),
        execute: async ({ products }) => {
          console.log('=== EJECUTANDO TOOL submit_quote_request ===');
          console.log('CLERK ID:', clerkId);
          console.log('PRODUCTS:', products);

          if (!clerkId) {
            console.log('ERROR: clerkId is undefined');
            return {
              success: false,
              message: 'Error: No se encontró la sesión del usuario (clerkId faltante).',
            };
          }

          try {
            // 1. Guardar la cotización en Convex. Con los ids, Convex cierra en
            // la misma transacción la conversación que continúan, y se niega
            // si ya está cerrada: de dos envíos que compiten —una recarga
            // temprana, otra pestaña— sólo uno crea la Request (ticket 03). La
            // negativa lanza, y cae en el `success: false` de abajo, sin correo.
            const result = await createReplacementRequest({ clerkId, products, messageIds });

            // 2. Enviar el email con Resend. Resend no lanza cuando rechaza un
            // envío: devuelve `{ error }`. Sin mirarlo, un dominio sin verificar
            // o un `ADMIN_EMAIL` vacío se registraban como "enviado" y la
            // Request esperaba a un Approver que nunca se enteró.
            try {
              const adminEmail = process.env.ADMIN_EMAIL;
              if (!adminEmail) {
                throw new Error('ADMIN_EMAIL no está configurado: nadie recibe la solicitud.');
              }

              const { error: sendError } = await resend.emails.send({
                from: SUPPORT_SENDER,
                to: [adminEmail],
                replyTo: process.env.IMAP_USER as string,
                subject: `Nueva solicitud de cotización: [${result.requestId}]`,
                react: QuoteRequestTemplate({
                  requestId: result.requestId,
                  // Del registro, no de `data.userName`: al Approver le hace
                  // falta con quién hablar, y el nombre que llega del navegador
                  // no trae empresa, correo ni teléfono.
                  customer: result.customer,
                  products: result.products,
                  subtotalUSD: result.subtotalUSD,
                  taxUSD: result.taxUSD,
                  totalUSD: result.totalUSD,
                }) as React.ReactElement,
              });

              if (sendError)
                throw new Error(`Resend rechazó el envío: ${JSON.stringify(sendError)}`);
              console.log('Email sent successfully via Resend');
            } catch (emailError) {
              console.error(
                `Error enviando al Approver la solicitud ${result.requestId}:`,
                emailError
              );
              // We don't fail the chat if the email fails
            }

            // Sin cifras: los totales de arriba son Suggested Prices, que el
            // Customer no debe ver nunca. Sólo se le confirma el folio.
            return {
              success: true,
              message: 'Datos recibidos y cotización generada exitosamente.',
              quoteId: result.quoteId,
              requestId: result.requestId,
            };
          } catch (error) {
            console.error('Error al procesar la cotización en Convex:', error);
            return {
              success: false,
              message:
                'Hubo un error al procesar tu solicitud en nuestro sistema. Por favor intenta de nuevo.',
            };
          }
        },
      }),
      show_dataplate_guide: tool({
        description:
          'Utiliza esta herramienta SIEMPRE que el cliente pregunte cómo o dónde encontrar el número de parte o el modelo en su equipo.',
        inputSchema: z.object({}),
        execute: async () => {
          return {
            success: true,
            message: 'Guía de placa de datos mostrada al cliente.',
          };
        },
      }),
    },
    onFinish: (event) => {
      console.log('streamText finished:', event.finishReason);
    },
    stopWhen: stepCountIs(5), // Allow the model to execute tools and generate a final text response
  });

  // Return a UI Message Stream response (SSE/data protocol).
  // This is required for useChat's DefaultChatTransport to parse the stream correctly.
  return result.toUIMessageStreamResponse({
    // Con los mensajes originales, `onFinish` recibe el transcript entero. El
    // `id` de la respuesta lo pone `generateMessageId`: sin él llega vacío y
    // `toStoredMessages` la descarta, así que el turno que crea la Replacement
    // Request no se guardaría nunca. El mismo `id` viaja al navegador en el
    // chunk `start`, y cuando `useChat` reenvía esta respuesta el turno
    // siguiente, Convex reescribe su fila en vez de copiarla.
    originalMessages: messages as UIMessage[],
    generateMessageId,
    onFinish: async ({ messages: transcript }) => {
      try {
        await persistChatTurn({ clerkId, messages: toStoredMessages(transcript) });
      } catch (error) {
        // El stream ya se le entregó al Customer: aquí no queda respuesta que
        // cambiar. Perder el transcript es malo, pero reventar rompería un chat
        // que para él sí funcionó.
        console.error('No se pudo guardar la conversación del chat:', error);
      }
    },
  });
}
