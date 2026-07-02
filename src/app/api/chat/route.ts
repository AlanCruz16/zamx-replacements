import { streamText, tool, convertToModelMessages, type UIMessage, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { Resend } from 'resend';
import { QuoteRequestTemplate } from '@/emails/QuoteRequestTemplate';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const resend = new Resend(process.env.RESEND_API_KEY);

// Configura el tiempo máximo de espera para la API (útil en Edge)
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, data } = await req.json();
  const userName = data?.userName || 'Cliente';
  const language = data?.language || 'es';
  const clerkId = data?.clerkId;

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
- Cuando tengas TODOS los datos de al menos un producto (validados), y el cliente confirme explícitamente que no agregará más, DEBES invocar "submit_quote_request" con todos los productos y despedirte indicando que la solicitud está siendo procesada.
  `;

  // Convert incoming UIMessages to ModelMessages using the SDK's built-in converter.
  // This properly handles parts-based messages, tool calls, and all message types.
  const coreMessages = await convertToModelMessages(messages as UIMessage[]);

  const result = streamText({
    model: google('gemini-3.1-flash-lite'),
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
            // 1. Guardar la cotización en Convex
            const result = await convex.mutation(api.quotes.create, {
              clerkId,
              products,
            });

            // 2. Enviar el email con Resend
            try {
              await resend.emails.send({
                from: 'ZAMX Soporte <soporte@za.idcn.com.mx>',
                to: [process.env.ADMIN_EMAIL as string], // Enviar al correo del administrador configurado en entorno
                replyTo: process.env.IMAP_USER as string,
                subject: `Nueva solicitud de cotización: [${result.requestId}]`,
                react: QuoteRequestTemplate({
                  requestId: result.requestId,
                  userName,
                  products: result.products || products,
                  subtotalUSD: result.subtotalUSD,
                  taxUSD: result.taxUSD,
                  totalUSD: result.totalUSD,
                }) as React.ReactElement,
              });
              console.log('Email sent successfully via Resend');
            } catch (emailError) {
              console.error('Error enviando el email con Resend:', emailError);
              // We don't fail the chat if the email fails
            }

            return {
              success: true,
              message: 'Datos recibidos y cotización generada exitosamente.',
              quoteId: result.quoteId,
              requestId: result.requestId,
              totalUSD: result.totalUSD,
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
  return result.toUIMessageStreamResponse();
}
