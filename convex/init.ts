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

    // Check if we already seeded delivery seasons
    const existingSeasons = await ctx.db.query('delivery_seasons').take(1);
    if (existingSeasons.length === 0) {
      const seasons = [
        {
          seasonName: 'Temporada Alta (Verano)',
          startMonth: 5,
          endMonth: 8,
          deliveryWeeks: 8,
          isActive: true,
        },
        {
          seasonName: 'Temporada Regular',
          startMonth: 9,
          endMonth: 12,
          deliveryWeeks: 5,
          isActive: true,
        },
        {
          seasonName: 'Temporada Baja (Invierno/Primavera)',
          startMonth: 1,
          endMonth: 4,
          deliveryWeeks: 4,
          isActive: true,
        },
      ];

      for (const season of seasons) {
        await ctx.db.insert('delivery_seasons', season);
      }
      console.log('Delivery seasons seeded successfully.');
    } else {
      console.log('Delivery seasons already seeded.');
    }
  },
});
