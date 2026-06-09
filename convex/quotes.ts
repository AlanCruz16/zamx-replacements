import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

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
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) {
      throw new Error("Usuario no encontrado en la base de datos.");
    }

    // 2. Fetch all pricing rules and delivery seasons to memory (small tables)
    const pricingRules = await ctx.db.query("pricing_rules").collect();
    const deliverySeasons = await ctx.db.query("delivery_seasons").collect();

    // Determine current month (1-12)
    const currentMonth = new Date().getMonth() + 1;
    let currentDeliveryWeeks = 6; // Default fallback

    const currentSeason = deliverySeasons.find(
      (s) => currentMonth >= s.startMonth && currentMonth <= s.endMonth && s.isActive
    );
    if (currentSeason) {
      currentDeliveryWeeks = currentSeason.deliveryWeeks;
    }

    // 3. Process each product to calculate price and delivery
    let subtotalUSD = 0;
    const processedProducts = args.products.map((product) => {
      // Find matching pricing rule by prefix (e.g. MK, ZN, RH)
      let pricePerUnitUSD = 0;
      
      const rule = pricingRules.find((r) => product.model.toUpperCase().startsWith(r.prefix.toUpperCase()) && r.isActive);
      
      if (rule) {
        // Random price between min and max for simulation purposes
        pricePerUnitUSD = Math.floor(Math.random() * (rule.maxPriceUSD - rule.minPriceUSD + 1)) + rule.minPriceUSD;
      } else {
        // Fallback price if no rule matches
        pricePerUnitUSD = 1000;
      }

      subtotalUSD += pricePerUnitUSD * product.quantity;

      return {
        partNumber: product.partNumber,
        model: product.model,
        quantity: product.quantity,
        deliveryLocation: product.deliveryLocation,
        pricePerUnitUSD,
        deliveryWeeks: currentDeliveryWeeks,
      };
    });

    const taxUSD = subtotalUSD * 0.16; // 16% IVA in Mexico
    const totalUSD = subtotalUSD + taxUSD;
    
    // Generate a friendly Request ID
    const requestId = `REQ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 days from now

    // 4. Save to database
    const quoteId = await ctx.db.insert("quotes", {
      userId: user._id,
      requestId,
      products: processedProducts,
      subtotalUSD,
      taxUSD,
      totalUSD,
      status: "pending_review",
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
