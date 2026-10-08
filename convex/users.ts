import { v, type Infer } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';

/** Lo que se sabe de un Customer al darlo de alta, venga de donde venga. */
const newCustomer = v.object({
  clerkId: v.string(),
  fullName: v.string(),
  email: v.string(),
});

/**
 * La fila de un Customer recién llegado. Sale de aquí tanto si la trae el
 * webhook de Clerk como si la pide la propia pantalla (`ensureCurrent`), para
 * que las dos puertas no acaben creando Customers distintos.
 *
 * La empresa queda en «Pendiente», que es lo que manda al onboarding. El idioma
 * empieza en español porque es ZIEHL-ABEGG México.
 */
function insertCustomer(ctx: MutationCtx, customer: Infer<typeof newCustomer>) {
  return ctx.db.insert('users', {
    ...customer,
    companyName: 'Pendiente',
    preferredLanguage: 'es',
  });
}

export const upsertFromClerk = internalMutation({
  args: newCustomer.fields,
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

    return await insertCustomer(ctx, args);
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

/**
 * Que un Customer con sesión tenga su fila aunque el webhook no la haya traído
 * (missing-user-row, ticket 01).
 *
 * El webhook sigue siendo quien la mantiene al día, pero ya no es el único que
 * la crea: si su entrega falla, si el secreto está mal, o si el despliegue es
 * un preview al que el webhook no apunta, la pantalla de chat se quedaba
 * esperando una fila que nunca llegaba. La construye con lo que dice el token
 * de Clerk, y si la fila ya existe no la toca —lo que el Customer dijo en el
 * onboarding no lo pisa el token—.
 */
export const ensureCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Unauthenticated');
    }

    const existing = await ctx.db
      .query('users')
      .withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (existing) {
      return existing._id;
    }

    return await insertCustomer(ctx, {
      clerkId: identity.subject,
      fullName: identity.name ?? '',
      email: identity.email ?? '',
    });
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
