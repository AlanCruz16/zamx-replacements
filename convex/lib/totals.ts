/**
 * Totales derivados. No se almacenan: con dos precios por producto, guardar
 * subtotal, IVA y total obligaría a recalcular seis campos redundantes en cada
 * override, y hoy sólo una de las rutas lo hace.
 *
 * Módulo puro, sin dependencia de Convex ni de la base de datos, para que tanto
 * las mutaciones como los route handlers lo compartan.
 */

/** IVA mexicano. */
export const IVA_RATE = 0.16;

export interface LineItem {
  priceUSD: number;
  quantity: number;
}

export interface Totals {
  subtotalUSD: number;
  taxUSD: number;
  totalUSD: number;
}

/**
 * Redondea a centavos, que es la unidad en la que se cotiza. Vive aquí y no en
 * el módulo de precios porque los totales se derivan de precios ya redondeados:
 * dos definiciones distintas del centavo descuadrarían contra una orden de
 * compra.
 */
export function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Subtotal, IVA (16%) y total a partir de los precios en juego — Suggested
 * Prices para la vista del Approver, Confirmed Prices para el Quote Document.
 */
export function computeTotals(items: readonly LineItem[]): Totals {
  const subtotalUSD = toCents(items.reduce((sum, item) => sum + item.priceUSD * item.quantity, 0));
  const taxUSD = toCents(subtotalUSD * IVA_RATE);
  return { subtotalUSD, taxUSD, totalUSD: toCents(subtotalUSD + taxUSD) };
}
