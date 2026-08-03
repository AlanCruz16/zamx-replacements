import { query, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { computeTotals } from './lib/totals';
import { isPricedOutcome } from './lib/outcome';
import { outcomeValidator } from './schema';
import { drawSuggestedPrice, matchPricingRule } from './lib/pricing';
import { SUGGESTED_DELIVERY_WEEKS } from './lib/delivery';
import { allocateRequestId } from './lib/request_id';
import { customerView } from './lib/customer_view';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

type Product = Doc<'quotes'>['products'][number];

/**
 * Camino máquina a máquina: es `internalMutation`, así que no existe en la API
 * pública y ningún navegador puede alcanzarla, mande lo que mande. El secreto
 * interno se comprueba una sola vez, en la frontera HTTP (`convex/http.ts`), y
 * nunca viaja como argumento de una función.
 */
export const create = internalMutation({
  args: {
    clerkId: v.string(),
    products: v.array(
      v.object({
        partNumber: v.string(),
        model: v.string(),
        quantity: v.number(),
        deliveryLocation: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // 1. Get the user from clerkId
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (!user) {
      throw new Error('Usuario no encontrado en la base de datos.');
    }

    // 2. Leer la configuración: la tabla es pequeña y cabe en memoria.
    const pricingRules = await ctx.db.query('pricing_rules').collect();

    // 3. Aplicar las reglas. Un Model Prefix sin rango configurado no recibe
    // Suggested Price: se deja ausente para que el Approver lo cotice a mano.
    const processedProducts: Product[] = args.products.map((product) => {
      const suggestedPriceUSD = drawSuggestedPrice(matchPricingRule(product.model, pricingRules));

      return {
        partNumber: product.partNumber,
        model: product.model,
        quantity: product.quantity,
        deliveryLocation: product.deliveryLocation,
        ...(suggestedPriceUSD === undefined ? {} : { suggestedPriceUSD }),
        suggestedDeliveryWeeksMin: SUGGESTED_DELIVERY_WEEKS.min,
        suggestedDeliveryWeeksMax: SUGGESTED_DELIVERY_WEEKS.max,
      };
    });

    const requestId = await allocateRequestId(requestIdIsTaken(ctx));
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 days from now

    // 4. Save to database. Sin `outcome`: la Replacement Request nace en revisión.
    const quoteId = await ctx.db.insert('quotes', {
      userId: user._id,
      requestId,
      products: processedProducts,
      expiresAt,
    });

    return {
      quoteId,
      requestId,
      products: processedProducts,
      // Derivados, no almacenados. Son los totales sugeridos, sólo para el
      // Approver: los productos sin Suggested Price no suman nada.
      ...suggestedTotals(processedProducts),
    };
  },
});

/**
 * Si el código ya pertenece a una Replacement Request.
 *
 * La consulta y la inserción viven en la misma mutación, que en Convex es una
 * transacción: si otra mutación insertara ese mismo código entre medias, el
 * conjunto de lectura entraría en conflicto y ésta se reintentaría entera.
 */
function requestIdIsTaken(ctx: MutationCtx) {
  return async (requestId: string) => {
    const taken = await ctx.db
      .query('quotes')
      .withIndex('by_request_id', (q) => q.eq('requestId', requestId))
      .first();

    return taken !== null;
  };
}

/** Totales sobre los Suggested Prices que existen. Vista del Approver. */
function suggestedTotals(products: readonly Product[]) {
  return computeTotals(
    products
      .filter((p) => p.suggestedPriceUSD !== undefined)
      .map((p) => ({ priceUSD: p.suggestedPriceUSD!, quantity: p.quantity }))
  );
}

export const processEmployeeResponse = internalMutation({
  args: {
    requestId: v.string(),
    /**
     * El Outcome que produjo el veredicto, ya en el vocabulario del glosario.
     * Ausente => no se llegó a una decisión y la Request sigue en revisión. El
     * validador es el mismo del esquema, así que un valor que no sea un Outcome
     * no llega hasta aquí en vez de traducirse a la callada.
     */
    outcome: v.optional(outcomeValidator),
    explanation: v.string(),
    newPricesUSD: v.optional(
      v.array(
        v.object({
          partNumber: v.string(),
          price: v.number(),
        })
      )
    ),
    newDeliveryWeeks: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1. Find the quote by requestId using index
    const quote = await ctx.db
      .query('quotes')
      .withIndex('by_request_id', (q) => q.eq('requestId', args.requestId))
      .first();

    if (!quote) {
      throw new Error(`Cotización no encontrada para el request: ${args.requestId}`);
    }

    const outcome = args.outcome;

    // 2. Confirmar precios y entregas. El Suggested Price nunca se toca: la
    // distancia entre lo propuesto y lo confirmado es la única evidencia de si
    // los rangos configurados sirven de algo.
    let products = quote.products;

    if (isPricedOutcome(outcome)) {
      // `priced_as_suggested` significa exactamente eso: el Confirmed Price es el
      // Suggested Price. Aplicar overrides aquí dejaría el registro afirmando que
      // se cotizó como se sugirió mientras lleva un precio distinto — la misma
      // confusión que separar los dos precios existe para evitar.
      const overrides = outcome === 'priced_differently' ? args.newPricesUSD : undefined;
      const newDeliveryWeeks = outcome === 'priced_differently' ? args.newDeliveryWeeks : undefined;

      products = quote.products.map((p) => {
        const override = overrides?.find((np) => np.partNumber === p.partNumber);
        const confirmedPriceUSD = override ? override.price : p.suggestedPriceUSD;

        const confirmedDelivery =
          newDeliveryWeeks === undefined
            ? { min: p.suggestedDeliveryWeeksMin, max: p.suggestedDeliveryWeeksMax }
            : { min: newDeliveryWeeks, max: newDeliveryWeeks };

        return {
          ...p,
          // Ausente sigue significando "no hay precio": un producto sin Suggested
          // Price y sin override no gana un cero por aprobarse en bloque.
          ...(confirmedPriceUSD === undefined ? {} : { confirmedPriceUSD }),
          confirmedDeliveryWeeksMin: confirmedDelivery.min,
          confirmedDeliveryWeeksMax: confirmedDelivery.max,
        };
      });
    }

    // 3. Escribir. `outcome` sólo se toca si la clasificación produjo uno, y
    // `customerNotifiedAt` no se toca nunca aquí: son dos hechos independientes.
    await ctx.db.patch(quote._id, {
      products,
      ...(outcome === undefined ? {} : { outcome }),
      approverExplanation: args.explanation,
    });

    return { success: true, quoteId: quote._id, outcome };
  },
});

/**
 * Lectura interna por folio. La usa el poller de correo, que ya corre dentro de
 * Convex; ninguna superficie del Customer pasa por aquí.
 */
export const getByRequestId = internalQuery({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('quotes')
      .withIndex('by_request_id', (q) => q.eq('requestId', args.requestId))
      .first();
  },
});

/**
 * Registra que se le envió el Quote Document al Customer. Independiente del
 * Outcome: no lo lee ni lo escribe.
 *
 * Es una mutación distinta de `markRejectionExplained` a propósito: son dos
 * hechos distintos del recorrido, y compartir una sola mutación es lo que hacía
 * que un camino registrara el hecho del otro.
 */
export const markQuoteDocumentSent = internalMutation({
  args: { quoteId: v.id('quotes') },
  handler: async (ctx, args) => {
    await recordCustomerNotified(ctx, args.quoteId, 'quoteDocumentSentAt');
  },
});

/** Registra que al Customer se le explicó por qué no hay Quote Document. */
export const markRejectionExplained = internalMutation({
  args: { quoteId: v.id('quotes') },
  handler: async (ctx, args) => {
    await recordCustomerNotified(ctx, args.quoteId, 'rejectionExplainedAt');
  },
});

/**
 * Deja constancia del hecho concreto y, además, de que al Customer se le dijo
 * algo. Cada hecho tiene su propio campo: registrar uno no puede borrar el otro.
 */
async function recordCustomerNotified(
  ctx: MutationCtx,
  quoteId: Doc<'quotes'>['_id'],
  fact: 'quoteDocumentSentAt' | 'rejectionExplainedAt'
) {
  const quote = await ctx.db.get(quoteId);
  if (!quote) throw new Error('Replacement Request no encontrada');

  const now = Date.now();
  await ctx.db.patch(quoteId, {
    customerNotifiedAt: now,
    [fact]: now,
  });
}

/**
 * Lectura interna completa — Replacement Request más el Customer dueño — para
 * los caminos que redactan correo o Quote Document. Devuelve el Suggested Price
 * junto al Confirmed, así que nunca puede ser pública: quien la consuma decide
 * qué le muestra al Customer.
 */
export const getFullQuoteDetails = internalQuery({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    const quote = await ctx.db
      .query('quotes')
      .withIndex('by_request_id', (q) => q.eq('requestId', args.requestId))
      .first();

    if (!quote) return null;

    const user = await ctx.db.get(quote.userId);
    if (!user) return null;

    return { quote, user };
  },
});

/**
 * La única superficie pública: las Replacement Requests del Customer que
 * pregunta. Devuelve una proyección, no el registro — ver `lib/customer_view.ts`.
 */
export const getUserQuotes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('No autenticado');
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
      .unique();

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const quotes = await ctx.db
      .query('quotes')
      .withIndex('by_user_id', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect();

    return quotes.map(customerView);
  },
});
