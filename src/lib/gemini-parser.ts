import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export async function parseEmployeeResponse(quote: any, employeeText: string) {
  const systemPrompt = `
Eres un sistema de ZIEHL-ABEGG México. Analiza la respuesta del empleado a una solicitud de cotización de reemplazo.

Solicitud original:
- Productos: ${JSON.stringify(quote.products, null, 2)}
- Tiempo de entrega propuesto: ${quote.products[0]?.deliveryWeeks} semanas

Respuesta del empleado: "${employeeText}"

Debes extraer y clasificar la intención del empleado de acuerdo a las siguientes reglas:
- "approved": El empleado autoriza los precios y tiempos sin cambios.
- "modified": El empleado especifica un nuevo precio para algún producto o un nuevo tiempo de entrega general.
- "oem_exclusive": El empleado indica que la pieza es exclusiva de un fabricante original (OEM) y no se puede vender directo.
- "obsolete": El empleado indica que la pieza está descontinuada y no tiene reemplazo directo.
- "needs_info": El empleado pide más información al cliente (ej. fotos de la placa).

Extrae los nuevos precios y tiempos solo si fueron mencionados explícitamente en la respuesta del empleado.
Si la intención no es clara, la "confidence" debe ser menor a 0.7.
`;

  const { object: interpretation } = await generateObject({
    model: google('gemini-3.1-flash-lite'),
    system: systemPrompt,
    prompt: "Analiza la respuesta del empleado y extrae los datos.",
    schema: z.object({
      classification: z.enum(['approved', 'modified', 'oem_exclusive', 'obsolete', 'needs_info']),
      confidence: z.number().describe('Nivel de confianza del 0 al 1 de la interpretación.'),
      explanation: z.string().describe('Resumen breve de la decisión del empleado en lenguaje interno.'),
      newPricesUSD: z.array(z.object({
        partNumber: z.string(),
        price: z.number()
      })).optional().describe('Lista de nuevos precios si el empleado los modificó.'),
      newDeliveryWeeks: z.number().optional().describe('Nuevo tiempo de entrega en semanas si el empleado lo modificó.')
    })
  });

  return interpretation;
}
