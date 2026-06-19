import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';

export const upsertFromClerk = internalMutation({
  args: {
    clerkId: v.string(),
    fullName: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if user already exists
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', args.clerkId))
      .unique();

    if (existingUser) {
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        fullName: args.fullName,
        email: args.email,
      });
      return existingUser._id;
    }

    // Insert new user
    // We default company name to "N/A" for now; the user might update it later in the UI.
    // We default language to Spanish since it's ZIEHL-ABEGG Mexico.
    const newUserId = await ctx.db.insert('users', {
      clerkId: args.clerkId,
      fullName: args.fullName,
      email: args.email,
      companyName: 'Pendiente',
      preferredLanguage: 'es',
    });

    return newUserId;
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    return await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
      .unique();
  },
});

export const updateLanguage = mutation({
  args: {
    language: v.union(v.literal('es'), v.literal('en')),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Unauthenticated');
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
      .unique();

    if (!user) {
      throw new Error('User not found');
    }

    await ctx.db.patch(user._id, {
      preferredLanguage: args.language,
    });
  },
});

export const updateProfile = mutation({
  args: {
    fullName: v.string(),
    companyName: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Unauthenticated');
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
      .unique();

    if (!user) {
      throw new Error('User not found');
    }

    await ctx.db.patch(user._id, {
      fullName: args.fullName,
      companyName: args.companyName,
      phone: args.phone,
    });
  },
});
