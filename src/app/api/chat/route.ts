import { streamText, tool, convertToModelMessages, type UIMessage, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

// Configura el tiempo máximo de espera para la API (útil en Edge)
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages, data } = await req.json();
  const userName = data?.userName || 'Cliente';
  const language = data?.language || 'es';

  const systemPrompt = `
Eres un asistente experto en ventas y cotizaciones de ZIEHL-ABEGG México.
Tu nombre no importa, representas a ZIEHL-ABEGG.
El cliente se llama ${userName}.
Su idioma preferido es ${language === 'es' ? 'Español' : 'Inglés'}. Responde en este idioma de manera sumamente profesional, amable y corporativa.

OBJETIVO PRINCIPAL:
Debes recopilar EXACTAMENTE 4 datos del cliente para poder generar una cotización de un ventilador de reemplazo:
1. Número de parte (partNumber): Generalmente es un número de 6 dígitos (ej: "162562"), a veces incluye un sufijo (ej: "162562/A01").
2. Modelo (model): Alfanumérico, que incluye el prefijo (ej: "MK137-4DZ.07.U" o "GR45-something").
3. Cantidad (quantity): Número de piezas requeridas.
4. Lugar de entrega (deliveryLocation): Ciudad, estado o dirección aproximada en México.

INSTRUCCIONES CLAVE:
- Si el cliente no sabe dónde encontrar los datos, explícale que el Número de Parte y el Modelo suelen estar en la etiqueta o placa de datos adherida a la carcasa lateral del ventilador.
- Pide los datos de forma conversacional, no como un interrogatorio policial.
- REGLA CRÍTICA: NO proporciones precios, costos ni tiempos de entrega aproximados bajo NINGUNA circunstancia, incluso si el cliente insiste. Solo dedícate a recolectar los datos.
- Cuando tengas TODOS los datos de al menos un producto, y el cliente te confirme explícitamente que ya no desea agregar más, DEBES invocar la herramienta "submit_quote_request" con la lista de todos los productos y despedirte indicando que la solicitud está siendo procesada por nuestro sistema.
  `;

  // Convert incoming UIMessages to ModelMessages using the SDK's built-in converter.
  // This properly handles parts-based messages, tool calls, and all message types.
  const coreMessages = await convertToModelMessages(messages as UIMessage[]);

  const result = streamText({
    model: google('gemini-2.5-flash'),
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
          // Por ahora (MVP Fase 2), solo simulamos que procesamos la cotización y regresamos un ACK.
          // En la Fase 3, interceptaremos este llamado para calcular precios y guardar en Convex.
          return {
            success: true,
            message: 'Datos recibidos correctamente en el backend. Cotización en proceso.',
            extractedProducts: products,
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
