import { computeTotals, type Totals } from '../../convex/lib/totals';
import { isPricedOutcome, type Outcome } from '../../convex/lib/outcome';
import type { Doc } from '../../convex/_generated/dataModel';

/**
 * Cuándo existe un Quote Document, y qué lleva dentro. Las dos condiciones del
 * glosario, en un solo sitio:
 *
 * 1. El Approver llegó a un Outcome con precio. Una pieza descontinuada o
 *    exclusiva del fabricante no se puede vender, así que nunca tiene Quote
 *    Document — aunque lleve precios encima y aunque ya se le haya avisado al
 *    Customer. Que se le haya avisado no dice **qué** se le avisó.
 * 2. **Todas** las piezas tienen Confirmed Price. Su ausencia significa que no
 *    hay precio, nunca cero: antes las dos rutas de PDF hacían
 *    `precio || 0` cada una por su cuenta —sobre el campo único que el
 *    ticket 03 partió en dos—, y una Replacement Request sin precios producía
 *    un Quote Document que cotizaba las piezas a cero dólares.
 */

/** La forma almacenada, tomada del esquema para que no haya dos fuentes de verdad. */
type StoredProduct = Doc<'quotes'>['products'][number];

export interface QuoteDocumentLine {
  partNumber: string;
  model: string;
  quantity: number;
  priceUSD: number;
  subtotalUSD: number;
  deliveryWeeksMin: number;
  deliveryWeeksMax: number;
}

export interface QuoteDocumentContents {
  products: QuoteDocumentLine[];
  totals: Totals;
}

/**
 * La Replacement Request tal y como la necesita esta regla: su Outcome y sus
 * piezas. Encaja igual con el registro almacenado que con la proyección que ve
 * el Customer, para que la regla no se duplique por superficie.
 */
interface ReplacementRequest {
  outcome?: Outcome;
  products: readonly StoredProduct[];
}

/**
 * El Quote Document de una Replacement Request, o `null` si no tiene ninguno.
 *
 * Es el único punto de entrada del módulo a propósito: quien pida las líneas
 * pasa por el Outcome, así que no hay forma de renderizar el PDF de una pieza
 * que no se puede vender por olvidarse de comprobarlo.
 */
export function quoteDocumentLines(request: ReplacementRequest): QuoteDocumentContents | null {
  if (!isPricedOutcome(request.outcome)) return null;
  return confirmedQuoteLines(request.products);
}

/**
 * Convierte los productos almacenados en las líneas del Quote Document.
 *
 * Devuelve `null` si **alguna** pieza no tiene Confirmed Price: un Quote Document
 * es un compromiso, y no existe hasta que todas las piezas tienen precio.
 */
function confirmedQuoteLines(products: readonly StoredProduct[]): QuoteDocumentContents | null {
  if (products.length === 0) return null;
  if (products.some((p) => p.confirmedPriceUSD === undefined)) return null;

  const lines = products.map((p) => {
    const priceUSD = p.confirmedPriceUSD!;
    return {
      partNumber: p.partNumber,
      model: p.model,
      quantity: p.quantity,
      priceUSD,
      subtotalUSD: priceUSD * p.quantity,
      // Sin Delivery Estimate confirmada, la sugerida es la que se ofreció.
      deliveryWeeksMin: p.confirmedDeliveryWeeksMin ?? p.suggestedDeliveryWeeksMin,
      deliveryWeeksMax: p.confirmedDeliveryWeeksMax ?? p.suggestedDeliveryWeeksMax,
    };
  });

  return { products: lines, totals: computeTotals(lines) };
}
