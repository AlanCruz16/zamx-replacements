/**
 * La Delivery Estimate sugerida por defecto, en semanas enteras.
 *
 * La capacidad de fábrica la gobierna, no el calendario: la tabla de temporadas
 * se eliminó porque contradecía la realidad por unas veinte semanas y, además,
 * su búsqueda por rango de meses no podía emparejar un rango que cruzara el fin
 * de año.
 *
 * Se cotiza como rango, nunca como fecha: un número único sacado de un rango es
 * o una promesa que no se puede cumplir o un relleno arbitrario.
 */
export const SUGGESTED_DELIVERY_WEEKS = { min: 25, max: 30 } as const;
