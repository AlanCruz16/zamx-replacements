/**
 * `.env.example` contra el código, para que no se separen.
 *
 * Las dos veces que esto ha costado una caída, la variable existía y lo que
 * faltaba era saber **en qué runtime** — las fechas y el detalle están en la
 * cabecera de `.env.example`, que es a quien le toca contarlo.
 *
 * Así que esto no comprueba que el fichero esté bonito: comprueba que cada
 * variable que el código lee esté documentada, y que esté documentada del lado
 * que de verdad la lee. Una variable nueva sin documentar rompe la suite; una
 * documentada del lado equivocado, también.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, sourceFiles } from '@/test/source-files';

/** Los encabezados de sección de `.env.example`, en su forma `## Nombre`. */
const CONVEX_SIDE = 'Convex-side';
const NEXT_SIDE = 'Next.js-side';
const VERCEL_ONLY = 'Vercel build only';
const SECTIONS = [CONVEX_SIDE, NEXT_SIDE, VERCEL_ONLY];

/**
 * Variables que `.env.example` documenta y que ningún `process.env.X` del
 * código nombra. Cada una necesita una razón, porque la lista es la puerta de
 * atrás de la comprobación: sin razón, cualquier variable muerta se queda.
 */
const NOT_READ_BY_OUR_SOURCE: Record<string, string> = {
  CONVEX_DEPLOYMENT: 'la escribe `npx convex dev`; la lee el CLI de Convex',
  CONVEX_DEPLOY_KEY: 'la lee `convex deploy` durante el build de Vercel',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'la lee el SDK de Clerk, no nuestro código',
  CLERK_SECRET_KEY: 'la lee el SDK de Clerk, no nuestro código',
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: 'la lee el SDK de Clerk, no nuestro código',
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: 'la lee el SDK de Clerk, no nuestro código',
  GOOGLE_GENERATIVE_AI_API_KEY: 'la lee `@ai-sdk/google` al construir el proveedor',
};

/**
 * `NODE_ENV` no se documenta: la pone el runtime, no quien despliega.
 */
const PROVIDED_BY_THE_RUNTIME = new Set(['NODE_ENV']);

/**
 * La ruta de depuración del buzón, apagada en producción. Es la excepción a «lo
 * que lee `src/app/` es del lado de Next»: `IMAP_HOST`, `IMAP_PORT` e
 * `IMAP_PASSWORD` son del lado de Convex, porque el sondeo es una acción de
 * Convex, y sólo esta ruta los nombra en Next.
 *
 * `IMAP_USER` **no** entra en la excepción y por eso no está aquí: dos rutas de
 * Next lo usan de `replyTo` para que la respuesta del Approver vuelva al buzón
 * que se sondea. Es de los dos lados. Si aparece un segundo lector en Next de
 * los otros tres, la excepción deja de ser cierta y esto tiene que enterarse.
 */
const DEV_ONLY_IMAP_ROUTE = 'src/app/api/debug-imap/route.ts';

/** El andamiaje de pruebas no lee variables de entorno de producción. */
const TEST_SCAFFOLDING = (path: string) => path.startsWith(join('src', 'test'));

/** Cada `process.env.X` del código, con los ficheros que lo nombran. */
function readsByVariable(): Map<string, string[]> {
  const found = new Map<string, string[]>();

  const scanned = [
    ...sourceFiles('convex', { exclude: TEST_SCAFFOLDING }),
    ...sourceFiles('src', { exclude: TEST_SCAFFOLDING }),
  ];

  for (const path of scanned) {
    const contents = readFileSync(join(ROOT, path), 'utf8');
    for (const match of contents.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      const name = match[1];
      if (PROVIDED_BY_THE_RUNTIME.has(name)) continue;
      found.set(name, [...(found.get(name) ?? []), path].filter(unique));
    }
  }

  return found;
}

function unique<T>(value: T, index: number, all: T[]): boolean {
  return all.indexOf(value) === index;
}

type Documented = {
  /** Secciones bajo las que aparece cada variable. Una puede estar en dos. */
  sections: Map<string, Set<string>>;
  /** Variables con una línea `NOMBRE=` sin comentar, que es la asignable. */
  assigned: string[];
};

function parseEnvExample(): Documented {
  const lines = readFileSync(join(ROOT, '.env.example'), 'utf8').split('\n');

  const sections = new Map<string, Set<string>>();
  const assigned: string[] = [];
  let current: string | undefined;

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1];
      continue;
    }

    const variable = /^(#\s)?([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!variable) continue;

    const [, commented, name] = variable;
    if (!commented) assigned.push(name);

    const seen = sections.get(name) ?? new Set<string>();
    if (current) seen.add(current);
    sections.set(name, seen);
  }

  return { sections, assigned };
}

describe('.env.example', () => {
  const reads = readsByVariable();
  const { sections, assigned } = parseEnvExample();

  it('usa sólo los encabezados de sección que esta prueba conoce', () => {
    const headings = [...new Set([...sections.values()].flatMap((set) => [...set]))];
    const unknown = headings.filter((heading) => !SECTIONS.includes(heading));
    expect(unknown, `encabezados que esta prueba no reconoce: ${unknown}`).toEqual([]);
  });

  it('documenta cada variable que el código lee', () => {
    const undocumented = [...reads.keys()].filter((name) => !sections.has(name));
    expect(undocumented, `sin documentar en .env.example: ${undocumented.join(', ')}`).toEqual([]);
  });

  it('no documenta variables que ya no lee nadie', () => {
    const dead = [...sections.keys()].filter(
      (name) => !reads.has(name) && !(name in NOT_READ_BY_OUR_SOURCE)
    );
    expect(dead, `documentadas y sin lector: ${dead.join(', ')}`).toEqual([]);
  });

  it('coloca del lado de Convex todo lo que leen las funciones de Convex', () => {
    const misfiled = [...reads.entries()]
      .filter(([, paths]) => paths.some((path) => path.startsWith('convex')))
      .filter(([name]) => !sections.get(name)?.has(CONVEX_SIDE))
      .map(([name]) => name);

    expect(misfiled, `las lee Convex y no están bajo "## ${CONVEX_SIDE}": ${misfiled}`).toEqual([]);
  });

  it('coloca del lado de Next todo lo que leen sus rutas y componentes', () => {
    const misfiled = [...reads.entries()]
      .filter(([, paths]) => paths.some((path) => path.startsWith(join('src', 'app'))))
      .filter(([name]) => !sections.get(name)?.has(NEXT_SIDE))
      // `IMAP_*` es la excepción documentada, y sólo mientras su único lector en
      // Next siga siendo la ruta de depuración apagada en producción.
      .filter(([, paths]) => {
        const inNext = paths.filter((path) => path.startsWith(join('src', 'app')));
        return !(inNext.length === 1 && inNext[0] === DEV_ONLY_IMAP_ROUTE);
      })
      .map(([name]) => name);

    expect(misfiled, `las lee Next y no están bajo "## ${NEXT_SIDE}": ${misfiled}`).toEqual([]);
  });

  it('deja una sola línea asignable por variable', () => {
    const twice = assigned.filter((name, index) => assigned.indexOf(name) !== index);
    expect(twice, `asignadas más de una vez, la copia a .env.local perdería una: ${twice}`).toEqual(
      []
    );
  });
});
