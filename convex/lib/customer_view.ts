import type { Doc } from '../_generated/dataModel';
import type { Outcome } from './outcome';

/**
 * La proyección que ve el Customer de su propia Replacement Request.
 *
 * El glosario es tajante: un Suggested Price "nunca se le muestra a un Customer
 * y nunca aparece en un Quote Document". Antes eso se cumplía pintando: la
 * consulta pública devolvía el registro entero y el componente decidía no
 * renderizar el número. Seguía estando en el payload de la página, visible en
 * devtools y en cualquier captura de red — una decisión de autorización disfrazada
 * de condición de renderizado.
 *
 * Aquí deja de ser una condición y pasa a ser la forma del tipo: estos tipos no
 * tienen dónde poner un Suggested Price, así que no hay nada que filtrar y nada
 * que se pueda olvidar de filtrar.
 */

type StoredProduct = Doc<'quotes'>['products'][number];

/**
 * Un producto tal y como puede verse desde el navegador.
 *
 * Conserva la Delivery Estimate sugerida — eso es lo que se le ofreció al
 * Customer y lo que se le muestra mientras no exista una confirmada — pero no el
 * Suggested Price, que es material interno del Approver.
 *
 * Los cuatro campos de semanas van planos, con los mismos nombres que en el
 * esquema, para que `confirmedQuoteLines` sirva igual a esta proyección que al
 * registro almacenado: la regla de qué precio se muestra vive en un solo sitio.
 */
export interface CustomerProduct {
  partNumber: string;
  model: string;
  quantity: number;
  deliveryLocation: string;
  /** Ausente => todavía no hay precio. `0` es un precio real, no una ausencia. */
  confirmedPriceUSD?: number;
  suggestedDeliveryWeeksMin: number;
  suggestedDeliveryWeeksMax: number;
  confirmedDeliveryWeeksMin?: number;
  confirmedDeliveryWeeksMax?: number;
}

export interface CustomerReplacementRequest {
  _id: Doc<'quotes'>['_id'];
  _creationTime: number;
  requestId: string;
  products: CustomerProduct[];
  /** Ausente => en revisión. Independiente de `customerNotifiedAt`. */
  outcome?: Outcome;
  customerNotifiedAt?: number;
  expiresAt: number;
}

/** Proyecta un producto almacenado a lo que puede cruzar la red. */
function customerProduct(p: StoredProduct): CustomerProduct {
  return {
    partNumber: p.partNumber,
    model: p.model,
    quantity: p.quantity,
    deliveryLocation: p.deliveryLocation,
    confirmedPriceUSD: p.confirmedPriceUSD,
    suggestedDeliveryWeeksMin: p.suggestedDeliveryWeeksMin,
    suggestedDeliveryWeeksMax: p.suggestedDeliveryWeeksMax,
    confirmedDeliveryWeeksMin: p.confirmedDeliveryWeeksMin,
    confirmedDeliveryWeeksMax: p.confirmedDeliveryWeeksMax,
  };
}

/**
 * Proyecta una Replacement Request almacenada a lo que ve su Customer.
 *
 * Queda fuera todo lo que no le pertenece a esa superficie: el Suggested Price,
 * el `userId` (la consulta ya filtró por él), las palabras del Approver y las
 * marcas de tiempo internas de cada hecho. Lo que sí entra es el Outcome y si ya
 * se le notificó — dos hechos independientes, tal como los lee la insignia.
 */
export function customerView(quote: Doc<'quotes'>): CustomerReplacementRequest {
  return {
    _id: quote._id,
    _creationTime: quote._creationTime,
    requestId: quote.requestId,
    products: quote.products.map(customerProduct),
    outcome: quote.outcome,
    customerNotifiedAt: quote.customerNotifiedAt,
    expiresAt: quote.expiresAt,
  };
}
