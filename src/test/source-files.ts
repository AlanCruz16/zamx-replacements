/**
 * Recorrer el código como lo hace una comprobación estática.
 *
 * Dos pruebas leen el árbol entero en vez de montar nada: `env-example.test.ts`
 * busca cada `process.env.X`, y `undefined-colour-tokens.test.ts` busca clases
 * de color que no compilan. Las dos hacían el mismo paseo, y de las dos copias
 * sólo se diferenciaban las exclusiones. Vive aquí, en `src/test/`, porque es
 * andamiaje de pruebas y no código que se despliegue.
 *
 * Lo que se salta siempre: los `_generated` de Convex, que no los escribe
 * nadie, y los propios ficheros `.test`/`.check`, que son quienes preguntan.
 * Lo que cada llamada decide: `exclude`, para lo que sólo sobra en un caso.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = process.cwd();

type Options = {
  /** Extensiones a mirar. Por defecto sólo TypeScript. */
  extensions?: RegExp;
  /** Rutas —relativas a la raíz— que esta comprobación en concreto no quiere. */
  exclude?: (path: string) => boolean;
};

/** Los ficheros de `dir` que una comprobación estática debería leer, en rutas relativas a la raíz. */
export function sourceFiles(dir: string, options: Options = {}): string[] {
  const { extensions = /\.tsx?$/, exclude = () => false } = options;

  return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
    .map((entry) => join(dir, entry))
    .filter((path) => extensions.test(path))
    .filter((path) => !/\.(test|check)\.tsx?$/.test(path))
    .filter((path) => !path.includes('_generated'))
    .filter((path) => !exclude(path));
}
