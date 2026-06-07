import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    fullName: v.string(),
    companyName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    preferredLanguage: v.union(v.literal('es'), v.literal('en')),
  }).index('by_clerk_id', ['clerkId']),

  pricing_rules: defineTable({
    prefix: v.string(),
    minPriceUSD: v.number(),
    maxPriceUSD: v.number(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
  }).index('by_prefix', ['prefix']),

  delivery_seasons: defineTable({
    seasonName: v.string(),
    startMonth: v.number(),
    endMonth: v.number(),
    deliveryWeeks: v.number(),
    isActive: v.boolean(),
  }),

  quotes: defineTable({
    userId: v.id('users'),
    requestId: v.string(),
    products: v.array(
      v.object({
        partNumber: v.string(),
        model: v.string(),
        quantity: v.number(),
        deliveryLocation: v.string(),
        pricePerUnitUSD: v.number(),
        deliveryWeeks: v.number(),
      })
    ),
    subtotalUSD: v.number(),
    taxUSD: v.number(),
    totalUSD: v.number(),
    status: v.union(
      v.literal('pending_review'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('sent_to_customer')
    ),
    pdfStorageId: v.optional(v.id('_storage')),
    expiresAt: v.number(),
  })
    .index('by_user_id', ['userId'])
    .index('by_request_id', ['requestId']),
});
