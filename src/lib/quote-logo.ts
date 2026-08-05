import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El logo del Quote Document, incrustado en el propio documento.
 *
 * Antes se pasaba como `${baseUrl}/logo_final.png` y el renderizador salía a la
 * red a buscarlo al directorio público de la propia aplicación. Con
 * `NEXT_PUBLIC_APP_URL` sin configurar ese URL era `http://localhost:3000`, así
 * que el documento salía sin logo en cualquier sitio menos en la máquina de
 * quien lo escribió — donde sí resolvía, y por eso el fallo no se veía.
 *
 * Un logo no es un dato de la Replacement Request: es un archivo que el
 * renderizador ya tiene en disco. Se lee de ahí y se incrusta como data URI, de
 * modo que el documento no depende de que haya un URL base configurado ni de que
 * la aplicación se pueda alcanzar a sí misma.
 *
 * `next.config.ts` mete el archivo en la traza de las dos rutas que renderizan
 * PDF; el trazado sólo sigue los `import`, y `public/` no viaja al servidor por
 * su cuenta.
 */
const LOGO_PATH = join(process.cwd(), 'public', 'logo_final.png');

let cached: string | undefined;

/**
 * Se lee a la primera llamada y no al cargar el módulo, a propósito: leerlo
 * arriba haría que un archivo ausente tumbara la ruta entera antes de ejecutar
 * nada, incluida la puerta que devuelve 409 cuando la Replacement Request no
 * tiene Quote Document. Que falte el logo sólo puede romper los documentos que
 * de verdad llevan logo.
 */
export function quoteLogoSrc(): string {
  if (cached === undefined) {
    try {
      cached = `data:image/png;base64,${readFileSync(LOGO_PATH).toString('base64')}`;
    } catch (cause) {
      // Se nombra el archivo y la razón por la que podría no estar: el modo de
      // fallo es un despliegue que no se llevó el asset, y el mensaje tiene que
      // llevar a `outputFileTracingIncludes` sin una investigación de por medio.
      throw new Error(
        `No se pudo leer el logo del Quote Document en ${LOGO_PATH}. ` +
          'Si es un despliegue, comprueba `outputFileTracingIncludes` en next.config.ts.',
        { cause }
      );
    }
  }

  return cached;
}
