import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

export const create = mutation({
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

    // 2. Fetch all pricing rules and delivery seasons to memory (small tables)
    const pricingRules = await ctx.db.query('pricing_rules').collect();
    const deliverySeasons = await ctx.db.query('delivery_seasons').collect();

    // Determine current month (1-12)
    const currentMonth = new Date().getMonth() + 1;
    let currentDeliveryWeeks = 6; // Default fallback

    const currentSeason = deliverySeasons.find(
      (s) => currentMonth >= s.startMonth && currentMonth <= s.endMonth && s.isActive
    );
    if (currentSeason) {
      currentDeliveryWeeks = currentSeason.deliveryWeeks;
    }

    // Sort rules by prefix length descending so more specific prefixes match first
    const sortedRules = [...pricingRules].sort(
      (a, b) => b.prefix.trim().length - a.prefix.trim().length
    );

    // 3. Process each product to calculate price and delivery
    let subtotalUSD = 0;
    const processedProducts = args.products.map((product) => {
      // Find matching pricing rule by prefix (e.g. MK, ZN, RH)
      let pricePerUnitUSD = 0;

      let isUnknownPrefix = false;

      const rule = sortedRules.find(
        (r) =>
          product.model.trim().toUpperCase().startsWith(r.prefix.trim().toUpperCase()) && r.isActive
      );

      if (rule) {
        // Random price between min and max for simulation purposes
        pricePerUnitUSD =
          Math.floor(Math.random() * (rule.maxPriceUSD - rule.minPriceUSD + 1)) + rule.minPriceUSD;
      } else {
        // Fallback price if no rule matches: 2500 to 3000 USD
        pricePerUnitUSD = Math.floor(Math.random() * (3000 - 2500 + 1)) + 2500;
        isUnknownPrefix = true;
      }

      subtotalUSD += pricePerUnitUSD * product.quantity;

      return {
        partNumber: product.partNumber,
        model: product.model,
        quantity: product.quantity,
        deliveryLocation: product.deliveryLocation,
        pricePerUnitUSD,
        deliveryWeeks: currentDeliveryWeeks,
        isUnknownPrefix,
      };
    });

    const taxUSD = subtotalUSD * 0.16; // 16% IVA in Mexico
    const totalUSD = subtotalUSD + taxUSD;

    // Generate a friendly Request ID
    const requestId = `REQ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 days from now

    // 4. Save to database
    const quoteId = await ctx.db.insert('quotes', {
      userId: user._id,
      requestId,
      products: processedProducts,
      subtotalUSD,
      taxUSD,
      totalUSD,
      status: 'pending_review',
      expiresAt,
    });

    return {
      quoteId,
      requestId,
      products: processedProducts,
      subtotalUSD,
      taxUSD,
      totalUSD,
    };
  },
});

export const processEmployeeResponse = mutation({
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
    // 1. Find the quote by requestId
    const quote = await ctx.db
      .query('quotes')
      .filter((q) => q.eq(q.field('requestId'), args.requestId))
      .first();

    if (!quote) {
      throw new Error(`Cotización no encontrada para el request: ${args.requestId}`);
    }

    // 2. Update products if modified
    let updatedProducts = quote.products;
    let newSubtotal = quote.subtotalUSD;
    let newTax = quote.taxUSD;
    let newTotal = quote.totalUSD;

    if (args.classification === 'modified') {
      newSubtotal = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updatedProducts = quote.products.map((p: any) => {
        let finalPrice = p.pricePerUnitUSD;
        let finalWeeks = p.deliveryWeeks;

        // Apply new price if provided
        if (args.newPricesUSD) {
          const match = args.newPricesUSD.find((np) => np.partNumber === p.partNumber);
          if (match) {
            finalPrice = match.price;
          }
        }

        // Apply new delivery weeks if provided
        if (args.newDeliveryWeeks !== undefined) {
          finalWeeks = args.newDeliveryWeeks;
        }

        newSubtotal += finalPrice * p.quantity;

        return {
          ...p,
          pricePerUnitUSD: finalPrice,
          deliveryWeeks: finalWeeks,
        };
      });

      newTax = newSubtotal * 0.16;
      newTotal = newSubtotal + newTax;
    }

    // 3. Determine the final status based on classification
    let newStatus = quote.status;
    switch (args.classification) {
      case 'approved':
        newStatus = 'employee_approved';
        break;
      case 'modified':
        newStatus = 'employee_modified';
        break;
      case 'oem_exclusive':
        newStatus = 'oem_exclusive';
        break;
      case 'obsolete':
        newStatus = 'obsolete';
        break;
      case 'needs_info':
        newStatus = 'needs_info';
        break;
      default:
        newStatus = 'pending_review';
        break;
    }

    // 4. Update the quote
    await ctx.db.patch(quote._id, {
      status: newStatus,
      products: updatedProducts,
      subtotalUSD: newSubtotal,
      taxUSD: newTax,
      totalUSD: newTotal,
      // We store the explanation in a new field so the dashboard can display it
      employeeExplanation: args.explanation,
    });

    return { success: true, quoteId: quote._id, status: newStatus };
  },
});

export const getByRequestId = query({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('quotes')
      .withIndex('by_request_id', (q) => q.eq('requestId', args.requestId))
      .first();
  },
});

export const markAsSentToClient = mutation({
  args: { quoteId: v.id('quotes') },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) throw new Error('Cotización no encontrada');

    await ctx.db.patch(args.quoteId, {
      sentToClientAt: Date.now(),
    });
  },
});
export const getFullQuoteDetails = query({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    const quote = await ctx.db
      .query('quotes')
      .withIndex('by_request_id', (q) => q.eq('requestId', args.requestId))
      .first();

    if (!quote) return null;

    const user = await ctx.db.get(quote.userId);
    if (!user) return null;

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
