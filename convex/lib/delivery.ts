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
 *
 * Vive aquí y no en una tabla, a diferencia de `pricing_rules`. Una tabla añade
 * siembra y una superficie para editarla, y la siembra es precisamente lo que
 * dejó la capacidad equivocada durante meses: sólo escribía si la tabla estaba
 * vacía, así que corregir los datos sembrados no arreglaba ningún deployment ya
 * existente. Un valor único que cambia una vez por año no lo justifica; cambiarlo
 * es editar esta línea y desplegar, que deja el cambio en el historial de git.
 */
export const SUGGESTED_DELIVERY_WEEKS = { min: 25, max: 30 } as const;
