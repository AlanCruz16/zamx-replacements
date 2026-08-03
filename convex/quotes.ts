import { mutation, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { computeTotals } from './lib/totals';
import { isPricedOutcome, type Outcome } from './lib/outcome';
import type { Doc } from './_generated/dataModel';

type Product = Doc<'quotes'>['products'][number];

/**
 * Delivery Estimate sugerida por defecto, en semanas. La capacidad de fábrica la
 * gobierna, no el calendario: la tabla de temporadas se eliminó porque
 * contradecía la realidad por unas veinte semanas.
 *
 * El ticket 05 la mueve a configuración; aquí vive como constante para que la
 * eliminación de `delivery_seasons` no deje el camino de precios sin estimación.
 */
const SUGGESTED_DELIVERY_WEEKS = { min: 25, max: 30 };

/**
 * Devuelve el secreto interno configurado. Lanza si no está configurado, para que
 * una variable ausente nunca deje pasar a un llamador (undefined === undefined).
 */
function requireInternalSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error('INTERNAL_API_SECRET no está configurado');
  }
  return secret;
}

export const create = mutation({
  args: {
    clerkId: v.string(),
    secret: v.string(),
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
    if (args.secret !== process.env.INTERNAL_API_SECRET) {
      throw new Error('No autorizado');
    }

    // 1. Get the user from clerkId
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (!user) {
      throw new Error('Usuario no encontrado en la base de datos.');
    }

    // 2. Fetch all pricing rules to memory (small table)
    const pricingRules = await ctx.db.query('pricing_rules').collect();

    // Sort rules by prefix length descending so more specific prefixes match first
    const sortedRules = [...pricingRules].sort(
      (a, b) => b.prefix.trim().length - a.prefix.trim().length
    );

    // 3. Process each product: a Suggested Price only where a Model Prefix matched
    const processedProducts: Product[] = args.products.map((product) => {
      const rule = sortedRules.find(
        (r) =>
          product.model.trim().toUpperCase().startsWith(r.prefix.trim().toUpperCase()) && r.isActive
      );

      // Un Model Prefix sin rango configurado no tiene Suggested Price: se deja
      // ausente para que el Approver lo cotice a mano. Inventar un número lo
      // presentaría como una propuesta del sistema.
      const suggestedPriceUSD = rule
        ? Math.floor(Math.random() * (rule.maxPriceUSD - rule.minPriceUSD + 1)) + rule.minPriceUSD
        : undefined;

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

    // Generate a friendly Request ID
    const requestId = `REQ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
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

/** Totales sobre los Suggested Prices que existen. Vista del Approver. */
function suggestedTotals(products: readonly Product[]) {
  return computeTotals(
    products
      .filter((p) => p.suggestedPriceUSD !== undefined)
      .map((p) => ({ priceUSD: p.suggestedPriceUSD!, quantity: p.quantity }))
  );
}

/**
 * Traduce la clasificación que devuelve el intérprete al Outcome del glosario.
 * Una clasificación desconocida no produce Outcome: la Replacement Request se
 * queda en revisión, que es exactamente lo que significa su ausencia.
 */
function outcomeFor(classification: string): Outcome | undefined {
  switch (classification) {
    case 'approved':
      return 'priced_as_suggested';
    case 'modified':
      return 'priced_differently';
    case 'oem_exclusive':
      return 'oem_restricted';
    case 'obsolete':
      return 'discontinued';
    case 'needs_info':
      return 'blocked_pending_info';
    default:
      return undefined;
  }
}

export const processEmployeeResponse = internalMutation({
  args: {
    requestId: v.string(),
    classification: v.string(),
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

    const outcome = outcomeFor(args.classification);

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

export const getByRequestId = query({
  args: { requestId: v.string(), secret: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const quote = await ctx.db
      .query('quotes')
      .withIndex('by_request_id', (q) => q.eq('requestId', args.requestId))
      .first();

    if (!quote) return null;

    const internalSecret = requireInternalSecret();
    if (args.secret === internalSecret) {
      return quote;
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('No autenticado');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
      .unique();

    if (!user || user._id !== quote.userId) {
      throw new Error('No autorizado');
    }

    return quote;
  },
});

/**
 * Registra que al Customer se le dijo algo. Independiente del Outcome: no lo lee
 * ni lo escribe.
 */
export const markAsSentToClient = mutation({
  args: { quoteId: v.id('quotes') },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error('Cotización no encontrada');

    await ctx.db.patch(args.quoteId, {
      customerNotifiedAt: Date.now(),
    });
  },
});
export const getFullQuoteDetails = query({
  args: { requestId: v.string(), secret: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const quote = await ctx.db
      .query('quotes')
      .withIndex('by_request_id', (q) => q.eq('requestId', args.requestId))
      .first();

    if (!quote) return null;

    const user = await ctx.db.get(quote.userId);
    if (!user) return null;

    const internalSecret = requireInternalSecret();
    if (args.secret !== internalSecret) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity || identity.subject !== user.clerkId) {
        throw new Error('No autorizado');
      }
    }

    // ... previous content ...
    return { quote, user };
  },
});

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

    return quotes;
  },
});
