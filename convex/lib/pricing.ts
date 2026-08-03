/**
 * Las reglas de precios, fuera de la mutación. Leer cómo se cotiza un Model no
 * debería exigir leer una mutación de base de datos, así que este módulo es
 * puro: no conoce Convex, ni `ctx`, ni la tabla de donde salen las reglas.
 */

import { toCents } from './totals';

/** Una regla configurada, reducida a lo que el emparejamiento necesita. */
export interface PricingRule {
  prefix: string;
  minPriceUSD: number;
  maxPriceUSD: number;
  isActive: boolean;
}

/**
 * Los prefijos se comparan sin distinguir mayúsculas y tolerando los espacios
 * que arrastran los valores almacenados: `'  ck  '` tiene que emparejar con
 * `' ck900-2ez '`.
 */
function normalise(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * La regla activa cuyo Model Prefix es el más largo de los que encajan, o nada
 * si ninguno encaja. El más largo gana porque es el más específico: `MK137`
 * describe mejor el Model que `MK`.
 */
export function matchPricingRule(
  model: string,
  rules: readonly PricingRule[]
): PricingRule | undefined {
  const target = normalise(model);

  return rules
    .filter((rule) => rule.isActive && target.startsWith(normalise(rule.prefix)))
    .sort((a, b) => normalise(b.prefix).length - normalise(a.prefix).length)
    .at(0);
}

/**
 * Un Suggested Price sorteado dentro del rango de la regla, al centavo.
 *
 * Sin regla no hay precio: devolver nada es lo que distingue "no cotizable" de
 * "gratis", y es lo que impide que un número inventado se presente como una
 * propuesta del sistema.
 */
export function drawSuggestedPrice(rule: PricingRule | undefined): number | undefined {
  if (rule === undefined) return undefined;

  // Los extremos se llevan al centavo hacia dentro del rango. Redondear sólo el
  // resultado del sorteo dejaría que un máximo configurado con fracciones de
  // centavo (1234.567) produjera un precio por encima de él (1234.57).
  const min = Math.ceil(rule.minPriceUSD * 100) / 100;
  const max = Math.floor(rule.maxPriceUSD * 100) / 100;

  // Un rango más estrecho que un centavo no contiene ningún precio cotizable;
  // se cotiza su extremo inferior.
  if (max < min) return toCents(rule.minPriceUSD);

  return toCents(min + Math.random() * (max - min));
}
