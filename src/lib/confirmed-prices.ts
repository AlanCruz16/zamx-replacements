import { computeTotals, type Totals } from '../../convex/lib/totals';
import type { Doc } from '../../convex/_generated/dataModel';

/**
 * La regla que hacía falta en un solo sitio: **la ausencia de un Confirmed Price
 * significa que no hay precio, nunca cero**.
 *
 * Antes, `src/app/api/send-client-quote/route.ts` y
 * `src/app/api/download-quote/route.ts` hacían `p.pricePerUnitUSD || 0` cada uno
 * por su cuenta, así que una Replacement Request sin precios producía un Quote
 * Document que cotizaba las piezas a cero dólares.
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

export interface ConfirmedQuoteLines {
  products: QuoteDocumentLine[];
  totals: Totals;
}

/**
 * Convierte los productos almacenados en las líneas del Quote Document.
 *
 * Devuelve `null` si **alguna** pieza no tiene Confirmed Price: un Quote Document
 * es un compromiso, y no existe hasta que todas las piezas tienen precio.
 */
export function confirmedQuoteLines(
  products: readonly StoredProduct[]
): ConfirmedQuoteLines | null {
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
