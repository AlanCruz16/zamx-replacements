import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import type { Outcome } from './outcome';
import { hasQuoteDocument } from './quote_document';

/**
 * Lo que ve el Supervisor de una Replacement Request.
 *
 * Es una proyección aparte de la del Customer (`customer_view.ts`) a propósito:
 * aquella no tiene dónde poner un Suggested Price, y ésta tiene que llevarlo,
 * porque comparar lo sugerido con lo confirmado es justo lo que el Supervisor
 * viene a ver. Dos tipos distintos para que ninguno se deslice hacia la forma
 * del otro.
 */

/**
 * Una pieza tal y como está almacenada: con su Suggested Price y su Confirmed
 * Price, cada uno ausente cuando no existe. Ausente nunca se lee como cero.
 */
export type SupervisorProduct = Doc<'quotes'>['products'][number];

/** Una fila de la lista: lo justo para leerla sin abrirla. */
export interface SupervisorRequestRow {
  _id: Id<'quotes'>;
  requestId: string;
  receivedAt: number;
  /** Para filtrar la lista por este Customer. */
  customerId: Id<'users'>;
  customerName: string;
  companyName: string;
  partCount: number;
  /** Ausente => en revisión. */
  outcome?: Outcome;
}

export interface SupervisorCustomer {
  /** Para enlazar a su detalle. */
  _id: Id<'users'>;
  fullName: string;
  companyName: string;
  email: string;
  phone?: string;
}

/**
 * Una fila de la lista de Customers: una persona, nunca una empresa. Sólo
 * existe para quien ha enviado al menos una Replacement Request, así que
 * `latestRequestAt` siempre está.
 */
export interface SupervisorCustomerRow extends Pick<
  SupervisorCustomer,
  '_id' | 'fullName' | 'companyName' | 'email'
> {
  requestCount: number;
  latestRequestAt: number;
}

export interface SupervisorCustomerDetail extends SupervisorCustomer {
  preferredLanguage: Doc<'users'>['preferredLanguage'];
  signedUpAt: number;
  /** Las suyas, de la más reciente a la más antigua, con la forma de la lista. */
  requests: SupervisorRequestRow[];
}

export interface SupervisorRequestDetail {
  _id: Id<'quotes'>;
  requestId: string;
  receivedAt: number;
  customer: SupervisorCustomer;
  products: SupervisorProduct[];
  /** Ausente => en revisión. */
  outcome?: Outcome;
  /** Las palabras del propio Approver. */
  approverExplanation?: string;
  /** Tres hechos independientes; ninguno se infiere de otro. */
  customerNotifiedAt?: number;
  quoteDocumentSentAt?: number;
  rejectionExplainedAt?: number;
  /** La misma regla que decide la descarga del Customer. */
  hasQuoteDocument: boolean;
}

/**
 * El Customer de una Replacement Request. Los usuarios no se borran nunca, así
 * que una Replacement Request sin el suyo es un registro roto, no un caso que
 * pintar.
 */
async function customerOf(ctx: QueryCtx, quote: Doc<'quotes'>): Promise<Doc<'users'>> {
  const user = await ctx.db.get(quote.userId);
  if (!user) throw new Error(`La Replacement Request ${quote.requestId} no tiene Customer`);
  return user;
}

export async function supervisorRow(
  ctx: QueryCtx,
  quote: Doc<'quotes'>
): Promise<SupervisorRequestRow> {
  return rowFor(quote, await customerOf(ctx, quote));
}

/** La fila, cuando el Customer ya está a mano. */
function rowFor(quote: Doc<'quotes'>, user: Doc<'users'>): SupervisorRequestRow {
  return {
    _id: quote._id,
    requestId: quote.requestId,
    receivedAt: quote._creationTime,
    customerId: quote.userId,
    customerName: user.fullName,
    companyName: user.companyName,
    partCount: quote.products.length,
    outcome: quote.outcome,
  };
}

export async function supervisorDetail(
  ctx: QueryCtx,
  quote: Doc<'quotes'>
): Promise<SupervisorRequestDetail> {
  const user = await customerOf(ctx, quote);
  return {
    _id: quote._id,
    requestId: quote.requestId,
    receivedAt: quote._creationTime,
    customer: {
      _id: user._id,
      fullName: user.fullName,
      companyName: user.companyName,
      email: user.email,
      phone: user.phone,
    },
    products: quote.products,
    outcome: quote.outcome,
    approverExplanation: quote.approverExplanation,
    customerNotifiedAt: quote.customerNotifiedAt,
    quoteDocumentSentAt: quote.quoteDocumentSentAt,
    rejectionExplainedAt: quote.rejectionExplainedAt,
    hasQuoteDocument: hasQuoteDocument(quote),
  };
}

/** Un Customer con sus Replacement Requests, ya leídas de la más reciente a la más antigua. */
export function supervisorCustomerDetail(
  user: Doc<'users'>,
  quotes: Doc<'quotes'>[]
): SupervisorCustomerDetail {
  return {
    _id: user._id,
    fullName: user.fullName,
    companyName: user.companyName,
    email: user.email,
    phone: user.phone,
    preferredLanguage: user.preferredLanguage,
    signedUpAt: user._creationTime,
    requests: quotes.map((quote) => rowFor(quote, user)),
  };
}

/** Una fila de la lista de Customers, con su actividad ya contada. */
export function supervisorCustomerRow(
  user: Doc<'users'>,
  activity: Pick<SupervisorCustomerRow, 'requestCount' | 'latestRequestAt'>
): SupervisorCustomerRow {
  return {
    _id: user._id,
    fullName: user.fullName,
    companyName: user.companyName,
    email: user.email,
    ...activity,
  };
}
