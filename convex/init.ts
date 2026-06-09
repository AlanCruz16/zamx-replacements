import { mutation } from "./_generated/server";

export const seedData = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if we already seeded pricing rules
    const existingRules = await ctx.db.query("pricing_rules").take(1);
    if (existingRules.length === 0) {
      const rules = [
        { prefix: "MK", minPriceUSD: 500, maxPriceUSD: 1200, description: "Motores EC con controlador integrado", isActive: true },
        { prefix: "ZN", minPriceUSD: 800, maxPriceUSD: 2500, description: "Ventiladores axiales de alta eficiencia", isActive: true },
        { prefix: "RH", minPriceUSD: 400, maxPriceUSD: 1800, description: "Rodetes centrífugos", isActive: true },
        { prefix: "GR", minPriceUSD: 900, maxPriceUSD: 3000, description: "Módulos centrífugos EC", isActive: true },
        { prefix: "FN", minPriceUSD: 300, maxPriceUSD: 900, description: "Ventiladores axiales estándar", isActive: true },
      ];
      
      for (const rule of rules) {
        await ctx.db.insert("pricing_rules", rule);
      }
      console.log("Pricing rules seeded successfully.");
    } else {
      console.log("Pricing rules already seeded.");
    }

    // Check if we already seeded delivery seasons
    const existingSeasons = await ctx.db.query("delivery_seasons").take(1);
    if (existingSeasons.length === 0) {
      const seasons = [
        { seasonName: "Temporada Alta (Verano)", startMonth: 5, endMonth: 8, deliveryWeeks: 8, isActive: true },
        { seasonName: "Temporada Regular", startMonth: 9, endMonth: 12, deliveryWeeks: 5, isActive: true },
        { seasonName: "Temporada Baja (Invierno/Primavera)", startMonth: 1, endMonth: 4, deliveryWeeks: 4, isActive: true },
      ];

      for (const season of seasons) {
        await ctx.db.insert("delivery_seasons", season);
      }
      console.log("Delivery seasons seeded successfully.");
    } else {
      console.log("Delivery seasons already seeded.");
    }
  },
});
