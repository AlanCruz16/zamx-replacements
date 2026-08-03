import { internalMutation } from './_generated/server';

export const seedData = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Clear existing pricing rules to allow reseeding with new precise prefixes
    const existingRules = await ctx.db.query('pricing_rules').collect();
    for (const rule of existingRules) {
      await ctx.db.delete(rule._id);
    }

    const rules = [
      {
        prefix: 'MK',
        minPriceUSD: 2500,
        maxPriceUSD: 3500,
        description: 'Motores EC con controlador integrado',
        isActive: true,
      },
      // QK & DN Prefixes
      {
        prefix: 'QK',
        minPriceUSD: 1800,
        maxPriceUSD: 2800,
        description: 'Ventiladores QK',
        isActive: true,
      },
      {
        prefix: 'DN',
        minPriceUSD: 2900,
        maxPriceUSD: 3800,
        description: 'Ventiladores DN',
        isActive: true,
      },
      // GR Prefixes
      {
        prefix: 'GR31',
        minPriceUSD: 1700,
        maxPriceUSD: 1900,
        description: 'Módulos centrífugos EC',
        isActive: true,
      },
      {
        prefix: 'GR35',
        minPriceUSD: 1750,
        maxPriceUSD: 2000,
        description: 'Módulos centrífugos EC',
        isActive: true,
      },
      {
        prefix: 'GR40',
        minPriceUSD: 1900,
        maxPriceUSD: 2200,
        description: 'Módulos centrífugos EC',
        isActive: true,
      },
      {
        prefix: 'GR45',
        minPriceUSD: 2200,
        maxPriceUSD: 2500,
        description: 'Módulos centrífugos EC',
        isActive: true,
      },
      {
        prefix: 'GR50',
        minPriceUSD: 2200,
        maxPriceUSD: 2600,
        description: 'Módulos centrífugos EC',
        isActive: true,
      },
      {
        prefix: 'GR56',
        minPriceUSD: 2400,
        maxPriceUSD: 2700,
        description: 'Módulos centrífugos EC',
        isActive: true,
      },
      {
        prefix: 'GR63',
        minPriceUSD: 2500,
        maxPriceUSD: 2900,
        description: 'Módulos centrífugos EC',
        isActive: true,
      },
      // RH Prefixes
      {
        prefix: 'RH31',
        minPriceUSD: 1700,
        maxPriceUSD: 1900,
        description: 'Rodetes centrífugos',
        isActive: true,
      },
      {
        prefix: 'RH35',
        minPriceUSD: 1750,
        maxPriceUSD: 2000,
        description: 'Rodetes centrífugos',
        isActive: true,
      },
      {
        prefix: 'RH40',
        minPriceUSD: 1900,
        maxPriceUSD: 2200,
        description: 'Rodetes centrífugos',
        isActive: true,
      },
      {
        prefix: 'RH45',
        minPriceUSD: 2200,
        maxPriceUSD: 2500,
        description: 'Rodetes centrífugos',
        isActive: true,
      },
      {
        prefix: 'RH50',
        minPriceUSD: 2200,
        maxPriceUSD: 2600,
        description: 'Rodetes centrífugos',
        isActive: true,
      },
      {
        prefix: 'RH56',
        minPriceUSD: 2400,
        maxPriceUSD: 2700,
        description: 'Rodetes centrífugos',
        isActive: true,
      },
      {
        prefix: 'RH63',
        minPriceUSD: 2500,
        maxPriceUSD: 2900,
        description: 'Rodetes centrífugos',
        isActive: true,
      },
      // ZN Prefixes
      {
        prefix: 'ZN045',
        minPriceUSD: 1500,
        maxPriceUSD: 1800,
        description: 'Ventiladores axiales de alta eficiencia',
        isActive: true,
      },
      {
        prefix: 'ZN050',
        minPriceUSD: 1600,
        maxPriceUSD: 1900,
        description: 'Ventiladores axiales de alta eficiencia',
        isActive: true,
      },
      {
        prefix: 'ZN063',
        minPriceUSD: 1700,
        maxPriceUSD: 1950,
        description: 'Ventiladores axiales de alta eficiencia',
        isActive: true,
      },
      {
        prefix: 'ZN071',
        minPriceUSD: 1750,
        maxPriceUSD: 2000,
        description: 'Ventiladores axiales de alta eficiencia',
        isActive: true,
      },
      {
        prefix: 'ZN080',
        minPriceUSD: 2000,
        maxPriceUSD: 2400,
        description: 'Ventiladores axiales de alta eficiencia',
        isActive: true,
      },
      {
        prefix: 'ZN091',
        minPriceUSD: 2200,
        maxPriceUSD: 2600,
        description: 'Ventiladores axiales de alta eficiencia',
        isActive: true,
      },
      // FN Prefixes
      {
        prefix: 'FN025',
        minPriceUSD: 1000,
        maxPriceUSD: 1200,
        description: 'Ventiladores axiales estándar',
        isActive: true,
      },
      {
        prefix: 'FN035',
        minPriceUSD: 1200,
        maxPriceUSD: 1300,
        description: 'Ventiladores axiales estándar',
        isActive: true,
      },
      {
        prefix: 'FN040',
        minPriceUSD: 1400,
        maxPriceUSD: 1600,
        description: 'Ventiladores axiales estándar',
        isActive: true,
      },
      {
        prefix: 'FN045',
        minPriceUSD: 1450,
        maxPriceUSD: 1650,
        description: 'Ventiladores axiales estándar',
        isActive: true,
      },
      {
        prefix: 'FN050',
        minPriceUSD: 1650,
        maxPriceUSD: 1800,
        description: 'Ventiladores axiales estándar',
        isActive: true,
      },
      {
        prefix: 'FN056',
        minPriceUSD: 1700,
        maxPriceUSD: 1850,
        description: 'Ventiladores axiales estándar',
        isActive: true,
      },
      {
        prefix: 'FN063',
        minPriceUSD: 1800,
        maxPriceUSD: 1900,
        description: 'Ventiladores axiales estándar',
        isActive: true,
      },
      {
        prefix: 'FN071',
        minPriceUSD: 1850,
        maxPriceUSD: 1950,
        description: 'Ventiladores axiales estándar',
        isActive: true,
      },
      {
        prefix: 'FN080',
        minPriceUSD: 1950,
        maxPriceUSD: 2300,
        description: 'Ventiladores axiales estándar',
        isActive: true,
      },
      {
        prefix: 'FN091',
        minPriceUSD: 2300,
        maxPriceUSD: 2500,
        description: 'Ventiladores axiales estándar',
        isActive: true,
      },
    ];

    for (const rule of rules) {
      await ctx.db.insert('pricing_rules', rule);
    }
    console.log('Pricing rules seeded successfully with specific prefixes.');
  },
});

/**
 * Borra todas las Replacement Requests.
 *
 * El cambio de forma del esquema (dos precios, dos rangos de entrega, Outcome
 * separado de la notificación) es incompatible con los registros antiguos. Todos
 * ellos son datos de prueba en un deployment de desarrollo, así que se limpian en
 * vez de migrarse — no hay deployment de producción.
 *
 * Si `npx convex dev` rechaza el push por validación de esquema, limpia la tabla
 * `quotes` desde el dashboard y vuelve a intentarlo; esta mutación existe para
 * repetir la limpieza sin salir de la terminal.
 */
export const clearQuotes = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Por lotes, no `.collect()`: la tabla no tiene cota conocida.
    let deleted = 0;
    for (;;) {
      const batch = await ctx.db.query('quotes').take(100);
      if (batch.length === 0) break;
      for (const quote of batch) {
        await ctx.db.delete(quote._id);
      }
      deleted += batch.length;
    }
    console.log(`Deleted ${deleted} quotes.`);
  },
});
